/**
 * Quote verification: the trust anchor of Receipts.
 *
 * A quote is only accepted if it appears word for word in its source. We allow
 * exactly three kinds of difference, none of which change meaning:
 *   1. Whitespace runs (line breaks, double spaces) compare as a single space.
 *   2. Typographic variants: curly vs straight quotes, en/em dash vs hyphen,
 *      the ellipsis character vs three dots, non-breaking spaces.
 *   3. Unicode compatibility forms (NFKC), e.g. full-width letters.
 *
 * Case, punctuation, word order and elisions ("…" standing for omitted words)
 * are NOT forgiven. If a model paraphrases, the quote is dropped.
 */

const TYPO_MAP: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "‚": "'",
  "‛": "'",
  "′": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "‟": '"',
  "″": '"',
  "‐": "-",
  "‑": "-",
  "‒": "-",
  "–": "-",
  "—": "-",
  "―": "-",
  "−": "-",
  "…": "...",
  " ": " ",
  " ": " ",
  " ": " ",
};

interface Normalized {
  text: string;
  /** For each char in `text`, the offset of the original char it came from. */
  map: number[];
}

/**
 * Normalise text while remembering where every output character came from, so
 * a match in normalised space can be mapped back to exact original offsets.
 */
export function normalizeWithMap(input: string): Normalized {
  const out: string[] = [];
  const map: number[] = [];
  let pendingSpace = -1;
  for (let i = 0; i < input.length; i++) {
    const code = input.codePointAt(i)!;
    const width = code > 0xffff ? 2 : 1;
    const raw = input.slice(i, i + width);
    let chunk = TYPO_MAP[raw] ?? raw.normalize("NFKC");
    if (width === 2) i++;
    if (/^\s+$/u.test(chunk)) {
      if (out.length > 0 && pendingSpace < 0) pendingSpace = i - (width - 1);
      continue;
    }
    if (pendingSpace >= 0) {
      out.push(" ");
      map.push(pendingSpace);
      pendingSpace = -1;
    }
    chunk = chunk.replace(/\s+/gu, " ");
    // One map entry per UTF-16 code unit, so offsets stay aligned after emoji.
    for (let k = 0; k < chunk.length; k++) {
      out.push(chunk[k]!);
      map.push(i - (width - 1));
    }
  }
  return { text: out.join(""), map };
}

export function normalize(input: string): string {
  return normalizeWithMap(input).text.trim();
}

export interface VerifyResult {
  ok: boolean;
  start: number;
  end: number;
  /** The exact original substring (may differ typographically from the candidate). */
  exact: string;
  reason?: string;
}

const keyed = new Map<string, Normalized>();

function normalizedSource(source: string): Normalized {
  // Strings cannot be WeakMap keys; use a small bounded cache instead.
  const hit = keyed.get(source);
  if (hit) return hit;
  const n = normalizeWithMap(source);
  if (keyed.size > 64) keyed.clear();
  keyed.set(source, n);
  return n;
}

/**
 * Find `candidate` verbatim inside `source`.
 * Returns the original offsets of the first match at or after `from`.
 */
export function verifyQuote(candidate: string, source: string, from = 0): VerifyResult {
  const needle = normalize(candidate);
  if (needle.length < 3) {
    return { ok: false, start: -1, end: -1, exact: "", reason: "quote is empty or too short" };
  }
  const hay = normalizedSource(source);
  let fromN = 0;
  if (from > 0) {
    fromN = hay.map.findIndex((o) => o >= from);
    if (fromN < 0) fromN = hay.text.length;
  }
  const idx = hay.text.indexOf(needle, fromN);
  if (idx < 0) {
    const lower = hay.text.toLowerCase().indexOf(needle.toLowerCase());
    const reason =
      lower >= 0
        ? "capitalisation differs from the source"
        : needle.includes("...")
          ? "quote uses an ellipsis to elide words"
          : "not found in source";
    return { ok: false, start: -1, end: -1, exact: "", reason };
  }
  const start = hay.map[idx]!;
  const lastChar = hay.map[idx + needle.length - 1]!;
  // Extend to cover the whole last original character (e.g. a surrogate pair or "…").
  let end = lastChar + 1;
  const code = source.codePointAt(lastChar);
  if (code !== undefined && code > 0xffff) end = lastChar + 2;
  return { ok: true, start, end, exact: source.slice(start, end) };
}

/** Re-check that a stored quote still matches its source at the stored offsets. */
export function verifyStored(
  quote: { text: string; start: number; end: number },
  source: string,
): VerifyResult {
  const atOffsets = source.slice(quote.start, quote.end);
  if (atOffsets === quote.text) {
    return { ok: true, start: quote.start, end: quote.end, exact: atOffsets };
  }
  // Offsets drifted (e.g. source re-ingested): fall back to a search.
  const found = verifyQuote(quote.text, source);
  if (found.ok && normalize(found.exact) === normalize(quote.text)) return found;
  return { ...found, ok: false, reason: found.reason ?? "text at stored offsets differs" };
}
