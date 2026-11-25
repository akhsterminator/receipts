/**
 * Offline extractor. Finds evidence-bearing sentences with linguistic signals.
 * Every candidate is a literal span of the source, so it always verifies.
 * Fast, free, deterministic and private, but cruder than a model.
 */
import type { QuoteKind, Source } from "../types.js";
import { classify, looksLikeProse, sentences } from "./signals.js";

export interface Candidate {
  text: string;
  kind: QuoteKind;
  intensity: number;
  /** Where the extractor believes the quote is (heuristic knows exactly). */
  start?: number;
  /** Which participant said it, for multi-participant transcripts. */
  speaker?: string;
}

const CAP: Record<Source["kind"], number> = {
  issue: 4,
  ticket: 3,
  review: 3,
  survey: 3,
  note: 8,
  interview: 14,
};

export function customerRanges(source: Source): { start: number; end: number; speaker?: string }[] {
  if (!source.turns?.length) return [{ start: 0, end: source.text.length }];
  return source.turns.filter((t) => t.role === "customer").map((t) => ({ start: t.start, end: t.end, speaker: t.speaker }));
}

export function heuristicExtract(source: Source, max = CAP[source.kind]): Candidate[] {
  const ranges = customerRanges(source);
  const scored: (Candidate & { score: number })[] = [];
  const seen = new Set<string>();

  // The first line of an issue or ticket is the customer's own summary.
  if ((source.kind === "issue" || source.kind === "ticket" || source.kind === "review") && !source.turns) {
    const firstLine = source.text.split("\n", 1)[0] ?? "";
    const title = firstLine.trim();
    const wordCount = title.split(/\s+/).length;
    if (title.length >= 10 && wordCount >= 3 && title === source.title.trim() && !/^\[?(bug|chore|docs?|test|ci|refactor)\]?:?\s*$/i.test(title)) {
      const c = classify(title);
      const kind: QuoteKind = c.kind === "other" || c.kind === "praise" ? (source.kind === "issue" ? "request" : c.kind) : c.kind;
      scored.push({ text: title, start: firstLine.indexOf(title), kind, intensity: c.intensity, score: 2 + c.signal });
      seen.add(title.toLowerCase());
    }
  }

  for (const range of ranges) {
    for (const s of sentences(source.text, [range])) {
      const text = s.text;
      if (text.length < 20 || text.length > 400) continue;
      if (!looksLikeProse(text)) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      const c = classify(text);
      if (c.kind === "other" || c.signal < 0.3) continue;
      // Questions are weak evidence unless they are clearly asking for something.
      if (c.kind === "question" && c.signal < 0.45) continue;
      seen.add(key);
      // Prefer mid-length sentences: very short ones lack context, long ones ramble.
      const lengthFit = text.length >= 40 && text.length <= 220 ? 0.15 : 0;
      scored.push({
        text,
        start: s.start,
        kind: c.kind,
        intensity: c.intensity,
        speaker: "speaker" in range ? range.speaker : undefined,
        score: c.signal + c.intensity * 0.5 + lengthFit,
      });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score || (a.start ?? 0) - (b.start ?? 0))
    .slice(0, max)
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
    .map(({ score: _score, ...c }) => c);
}
