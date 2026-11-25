/**
 * Model-based extraction. The model proposes quotes; Receipts verifies them.
 * Small sources are batched into one request to keep cost down.
 */
import { z } from "zod";
import type { LLM } from "../llm.js";
import type { Source } from "../types.js";
import type { Candidate } from "./heuristic.js";
import { intensityOf } from "./signals.js";

export const EXTRACT_SYSTEM = `You extract verbatim customer evidence for product teams.

You receive one or more customer feedback sources (interview transcripts, support tickets, app reviews, GitHub issues). Return the passages that tell a product team something about the customer's problems, needs, goals, workarounds or requests. Strong praise is also evidence: it shows what must not break.

Rules that matter most:
1. Copy every quote EXACTLY as it appears in the source, character for character: same words, same order, same spelling mistakes, same punctuation, same capitalisation. A separate program checks each quote against the source and discards anything that is not an exact substring.
2. Never paraphrase, summarise, fix typos, join separate passages, or use "..." to skip words. One quote is one contiguous span, usually one to three sentences.
3. In transcripts, quote only the customer (Participant) turns. Never quote the Interviewer. Do not include the "Participant:" label in the quote.
4. Leave out greetings, thanks, logistics, small talk, and template headings. Placeholders such as [EMAIL] or [NAME] are fine to include if they are inside the span.
5. Prefer specific, self-contained statements a product manager could cite ("I export to Excel every Friday because the dashboard can't filter by region") over vague ones ("it's fine").

For each quote give:
- kind: "pain" (a problem or frustration), "request" (something they want), "praise", or "question".
- intensity: 0 to 1, how strongly they feel. 0.2 = passing remark, 0.5 = clear problem, 0.8+ = threatening to leave, blocked, or very emotional.`;

const QuoteSchema = z.object({
  source_id: z.string(),
  text: z.string(),
  kind: z.enum(["pain", "request", "praise", "question"]),
  intensity: z.number(),
});

const ExtractSchema = z.object({ quotes: z.array(QuoteSchema) });

export interface ModelBatch {
  sources: Source[];
  chars: number;
}

export function batchSources(sources: Source[], maxChars = 40_000, maxSources = 30): ModelBatch[] {
  const batches: ModelBatch[] = [];
  let current: ModelBatch = { sources: [], chars: 0 };
  for (const s of sources) {
    const len = s.text.length;
    if (current.sources.length && (current.chars + len > maxChars || current.sources.length >= maxSources)) {
      batches.push(current);
      current = { sources: [], chars: 0 };
    }
    current.sources.push(s);
    current.chars += len;
  }
  if (current.sources.length) batches.push(current);
  return batches;
}

function renderSource(s: Source): string {
  const attrs = [`id="${s.id}"`, `kind="${s.kind}"`, s.segment ? `segment="${s.segment}"` : ""].filter(Boolean).join(" ");
  return `<source ${attrs}>\n${s.text}\n</source>`;
}

export async function modelExtract(
  llm: LLM,
  batch: ModelBatch,
  maxPerSource: number,
): Promise<Map<string, Candidate[]>> {
  const prompt = `${batch.sources.map(renderSource).join("\n\n")}

Extract evidence quotes from the ${batch.sources.length === 1 ? "source" : `${batch.sources.length} sources`} above. At most ${maxPerSource} quotes per source; fewer is fine, and a source with nothing useful gets none. Set source_id to the id of the source each quote comes from.`;
  const result = await llm.json({ system: EXTRACT_SYSTEM, prompt, schema: ExtractSchema, maxTokens: 16000 });
  const out = new Map<string, Candidate[]>();
  for (const q of result.quotes) {
    const list = out.get(q.source_id) ?? [];
    if (list.length >= maxPerSource) continue;
    const intensity = Number.isFinite(q.intensity) ? Math.min(1, Math.max(0, q.intensity)) : intensityOf(q.text, q.kind);
    list.push({ text: q.text, kind: q.kind, intensity: Math.round(intensity * 100) / 100 });
    out.set(q.source_id, list);
  }
  return out;
}
