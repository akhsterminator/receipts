/**
 * Spec grammar. Deliberately tiny so people can write it by hand:
 *
 *   ## R3. Let users pause a subscription for up to 3 months
 *   because: [Q-0142, Q-0388, Q-0911]   # anything after # is a comment
 *   metric: Monthly-plan churn −10% within 90 days
 *
 * or, for a deliberate decision without evidence:
 *
 *   ## R7. Ship an API
 *   bet: Partners keep asking in sales calls; we'll validate with 5 interviews by March.
 *
 * Headings can be ## or ###, the ID can be R1 / R-1 / REQ-1 / FR-001, and the
 * fields may be list items or bold (`- **because:** …`).
 */
import type { Citation, InlineQuote, ParsedSpec, Requirement } from "../types.js";

const HEADING = /^(#{2,4})\s+((?:R|REQ|FR)-?\d+[a-z]?)\s*[.:)\-–—]?\s+(.*?)\s*#*\s*$/i;
const ANY_HEADING = /^#{1,4}\s+/;
const FIELD = /^\s*(?:[-*+]\s+)?(?:\*\*|__)?(because|bet|metric|owner|evidence)(?:\*\*|__)?\s*:\s*(?:\*\*|__)?\s*(.*)$/i;
const QUOTE_ID = /\bQ-\d{1,6}\b/gi;
const INLINE_QUOTE = /^>\s*[“"«](.+)[”"»]\s*(?:[—–-]{1,2}|~)\s*(Q-\d{1,6})\b/i;

function stripComment(value: string): string {
  // `#` starts a comment unless it is part of a word (e.g. "C#", "#123" issue refs are rare here).
  const i = value.search(/\s#\s|\s#$|^#\s/);
  return (i >= 0 ? value.slice(0, i) : value).trim();
}

export function parseSpec(markdown: string, path = "spec.md"): ParsedSpec {
  const lines = markdown.split(/\r?\n/);
  const requirements: Requirement[] = [];
  let title: string | undefined;
  let current: Requirement | undefined;
  let inFence = false;
  let inComment = false;

  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    if (inComment) {
      if (line.includes("-->")) inComment = false;
      return;
    }
    if (/^\s*<!--/.test(line) && !line.includes("-->")) {
      inComment = true;
      return;
    }
    if (!title) {
      const t = /^#\s+(.+)$/.exec(line);
      if (t) title = t[1]!.trim();
    }
    const h = HEADING.exec(line);
    if (h) {
      current = {
        id: h[2]!.toUpperCase().replace(/^R-?/, "R").replace(/^REQ-?/, "REQ-").replace(/^FR-?/, "FR-"),
        title: h[3]!.trim(),
        line: lineNo,
        because: [],
        hasBecause: false,
        inlineQuotes: [],
      };
      requirements.push(current);
      return;
    }
    if (ANY_HEADING.test(line)) {
      current = undefined;
      return;
    }
    if (!current) return;

    const inline = INLINE_QUOTE.exec(line.trim());
    if (inline) {
      current.inlineQuotes.push({ id: inline[2]!.toUpperCase(), text: inline[1]!, line: lineNo });
      return;
    }

    const f = FIELD.exec(line);
    if (!f) return;
    const key = f[1]!.toLowerCase();
    const value = f[2]!;
    if (key === "because" || key === "evidence") {
      current.hasBecause = true;
      const ids = stripComment(value).match(QUOTE_ID) ?? [];
      for (const id of ids) current.because.push({ id: id.toUpperCase(), line: lineNo } satisfies Citation);
    } else if (key === "bet") {
      current.bet = { reason: stripComment(value).replace(/^\*\*|\*\*$/g, "").trim(), line: lineNo };
    } else if (key === "metric") {
      current.metric = { text: stripComment(value), line: lineNo };
    } else if (key === "owner") {
      current.owner = stripComment(value);
    }
  });

  return { path, ...(title ? { title } : {}), requirements };
}

export function inlineQuotesOf(req: Requirement): InlineQuote[] {
  return req.inlineQuotes;
}
