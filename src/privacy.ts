/**
 * Local-first PII scrubbing. Runs before anything is written to the evidence
 * store and before any text is sent to a model.
 *
 * This is deliberately conservative: it would rather redact a harmless word
 * than leak a phone number. It is not a compliance guarantee. Review the store
 * before sharing it (`receipts sources --show-redactions`).
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "./util.js";

export interface RedactOptions {
  /** Extra regex sources to replace with [REDACTED]. */
  patterns?: string[];
  /** Known personal names (e.g. from a CSV "name" column) to scrub everywhere. */
  names?: string[];
  /** Capitalised words that must never be treated as names. */
  allow?: string[];
}

export interface RedactResult {
  text: string;
  count: number;
  kinds: Record<string, number>;
}

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

interface Rule {
  kind: string;
  token: string;
  re: RegExp;
  /** Return false to keep the match. */
  accept?: (match: string, groups: string[]) => boolean;
  /** Only replace this capture group (1-based), keeping the rest of the match. */
  group?: number;
}

const NAME = "[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?";
const FULL_NAME = `${NAME}(?:\\s+${NAME}){0,2}`;

const RULES: Rule[] = [
  { kind: "secret", token: "[SECRET]", re: /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g },
  { kind: "email", token: "[EMAIL]", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  {
    kind: "url-token",
    token: "$1[REDACTED]",
    re: /([?&](?:token|key|apikey|api_key|access_token|auth|sig|signature|password|secret|session|code)=)[^\s&#]+/gi,
  },
  {
    kind: "card",
    token: "[CARD]",
    re: /\b\d(?:[ -]?\d){12,18}\b/g,
    accept: (m) => {
      const digits = m.replace(/\D/g, "");
      return digits.length >= 13 && digits.length <= 19 && luhn(digits);
    },
  },
  { kind: "iban", token: "[IBAN]", re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/g },
  { kind: "ssn", token: "[ID]", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { kind: "uk-ni", token: "[ID]", re: /\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/g },
  {
    kind: "phone",
    token: "[PHONE]",
    re: /(?<![\w.]|\d[\s.-])(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,5}\)[\s.-]?)?\d{2,5}[\s.-]\d{3,4}[\s.-]?\d{3,4}(?!\w|\.\d|[\s.-]\d)/g,
    accept: (m) => {
      const digits = m.replace(/\D/g, "");
      // Avoid dates (2024-01-15), versions and short numbers.
      if (digits.length < 9 || digits.length > 15) return false;
      if (/^\d{4}[-./]\d{2}[-./]\d{2}/.test(m.trim())) return false;
      return true;
    },
  },
  { kind: "ip", token: "[IP]", re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g },
  { kind: "postcode", token: "[POSTCODE]", re: /\b[A-Z]{1,2}\d[A-Z\d]?\s+\d[A-Z]{2}\b/g },
  {
    kind: "address",
    token: "[ADDRESS]",
    re: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Boulevard|Blvd|Way|Close|Court|Ct|Place|Pl|Terrace)\b\.?/g,
  },
  // Self-identification: "my name is Jane Doe", "I'm Jane from Acme", "this is Jane".
  {
    kind: "name",
    token: "[NAME]",
    re: new RegExp(`\\b(?:[Mm]y name is|[Mm]y name's|[Tt]his is|I am|I'm|[Ii]t's)\\s+(${FULL_NAME})(?=\\s+(?:from|at|with|here|and|,|\\.)|[,.!])`, "g"),
    group: 1,
  },
  // Greetings and sign-offs in tickets and emails.
  {
    kind: "name",
    token: "[NAME]",
    re: new RegExp(`\\b(?:Hi|Hello|Hey|Dear|Thanks|Thank you|Cheers|Regards|Best|Sincerely|Kind regards|Best regards|Many thanks)[,!]?[ \\t]+(${FULL_NAME})\\b`, "g"),
    group: 1,
  },
  {
    kind: "name",
    token: "[NAME]",
    re: new RegExp(`(?:^|\\n)\\s*(?:—|--|-)\\s*(${FULL_NAME})\\s*(?=\\n|$)`, "g"),
    group: 1,
  },
  // Social handles.
  { kind: "handle", token: "[HANDLE]", re: /(?<![\w@./])@[A-Za-z0-9_][A-Za-z0-9_-]{1,38}(?![\w/-]|\.[a-z])/g },
];

const NOT_NAMES = new Set(
  [
    "Team", "Support", "Everyone", "All", "There", "Folks", "Guys", "Sir", "Madam", "Again",
    "So", "Very", "Much", "The", "This", "That", "It", "Not", "Just", "Really", "Also", "Hi", "Hello",
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Yes", "No", "Ok", "Okay",
    "Sure", "Here", "Going", "Trying", "Using", "Looking", "Working", "Happy", "Sorry", "Glad", "Excited",
    "Frustrated", "Confused", "Done", "Back", "Still", "Now", "Finally", "Always", "Never", "Please",
  ].map((w) => w.toLowerCase()),
);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redact(input: string, options: RedactOptions = {}): RedactResult {
  let text = input;
  let count = 0;
  const kinds: Record<string, number> = {};
  const allow = new Set([...(options.allow ?? []).map((w) => w.toLowerCase()), ...NOT_NAMES]);
  const bump = (kind: string) => {
    count++;
    kinds[kind] = (kinds[kind] ?? 0) + 1;
  };

  // Known names first (e.g. the requester's name from a CSV column), so later
  // rules see [NAME] rather than half a name.
  const names = (options.names ?? [])
    .flatMap((n) => [n, ...n.split(/\s+/)])
    .map((n) => n.trim())
    .filter((n) => n.length >= 3 && /^[\p{L}'-]+(?:\s+[\p{L}'-]+)*$/u.test(n) && !allow.has(n.toLowerCase()))
    .sort((a, b) => b.length - a.length);
  for (const name of new Set(names)) {
    const re = new RegExp(`(?<![\\p{L}])${escapeRegExp(name)}(?![\\p{L}])`, "gu");
    text = text.replace(re, () => {
      bump("name");
      return "[NAME]";
    });
  }

  for (const rule of RULES) {
    text = text.replace(rule.re, (match: string, ...rest: unknown[]) => {
      const groups = rest.filter((g) => typeof g === "string") as string[];
      if (rule.accept && !rule.accept(match, groups)) return match;
      if (rule.group) {
        const g = groups[rule.group - 1];
        if (!g) return match;
        const first = g.split(/\s+/)[0]!.toLowerCase();
        if (allow.has(first) || allow.has(g.toLowerCase())) return match;
        bump(rule.kind);
        return match.replace(g, rule.token);
      }
      bump(rule.kind);
      return rule.token.includes("$1") ? rule.token.replace("$1", groups[0] ?? "") : rule.token;
    });
  }

  for (const pattern of options.patterns ?? []) {
    let re: RegExp;
    try {
      re = new RegExp(pattern, "g");
    } catch {
      continue;
    }
    text = text.replace(re, () => {
      bump("custom");
      return "[REDACTED]";
    });
  }

  return { text, count, kinds };
}

/* ---------- Pseudonyms ---------- */

/**
 * Per-store secret salt. Pseudonyms are `salted-hash(identifier)`, so the same
 * customer gets the same ID across runs, but nobody holding only the committed
 * store can reverse an ID by hashing a list of known emails.
 */
export function loadSalt(storeDir: string): string {
  const file = join(storeDir, ".salt");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  mkdirSync(storeDir, { recursive: true });
  const salt = randomBytes(24).toString("hex");
  writeFileSync(file, `${salt}\n`, { mode: 0o600 });
  return salt;
}

export function pseudonym(identifier: string, salt: string, prefix = "cust"): string {
  const normalized = identifier.trim().toLowerCase();
  return `${prefix}_${sha256(`${salt}:${normalized}`).slice(0, 8)}`;
}
