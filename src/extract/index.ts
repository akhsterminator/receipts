import type { ReceiptsConfig } from "../config.js";
import { LLMError, mapLimit, type LLM } from "../llm.js";
import type { Store } from "../store.js";
import type { Extractor, Quote, Source } from "../types.js";
import { lineOf, sha256 } from "../util.js";
import { verifyQuote, verifyStored } from "../verify.js";
import { customerRanges, heuristicExtract, type Candidate } from "./heuristic.js";
import { batchSources, modelExtract } from "./model.js";

export interface Dropped {
  sourceId: string;
  text: string;
  reason: string;
}

export interface ExtractReport {
  extractor: Extractor;
  quotes: number;
  newQuotes: number;
  sourcesProcessed: number;
  sourcesReused: number;
  dropped: Dropped[];
  errors: string[];
}

export interface ExtractOptions {
  llm?: LLM;
  fresh?: boolean;
  concurrency?: number;
  batchChars?: number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Turn candidate quotes into verified Quote records. Anything that is not a
 * verbatim span of a customer turn is dropped and reported.
 */
export function verifyCandidates(
  store: Store,
  source: Source,
  candidates: Candidate[],
  extractor: Extractor,
): { quotes: Quote[]; dropped: Dropped[] } {
  const quotes: Quote[] = [];
  const dropped: Dropped[] = [];
  const ranges = customerRanges(source);
  const multi = new Set(source.turns?.filter((t) => t.role === "customer").map((t) => t.speaker)).size > 1;
  const taken = new Set<string>();
  for (const c of candidates) {
    let v = verifyQuote(c.text, source.text, c.start !== undefined ? Math.max(0, c.start - 1) : 0);
    if (!v.ok && c.start !== undefined) v = verifyQuote(c.text, source.text);
    if (!v.ok) {
      dropped.push({ sourceId: source.id, text: c.text, reason: v.reason ?? "not found" });
      continue;
    }
    // Must sit inside a single customer turn: no quoting the interviewer, no stitching turns.
    let range = ranges.find((r) => v.start >= r.start && v.end <= r.end);
    if (!range && source.turns) {
      // The same words might appear again later in a customer turn.
      let from = v.end;
      while (!range) {
        const again = verifyQuote(c.text, source.text, from);
        if (!again.ok) break;
        const r = ranges.find((x) => again.start >= x.start && again.end <= x.end);
        if (r) {
          v = again;
          range = r;
        }
        from = again.end;
      }
      if (!range) {
        dropped.push({ sourceId: source.id, text: c.text, reason: "spoken by the interviewer or spans several turns" });
        continue;
      }
    }
    const key = `${v.start}:${v.end}`;
    if (taken.has(key)) continue;
    taken.add(key);
    const exact = v.exact;
    const hash = sha256(exact);
    const speaker = range && "speaker" in range ? (range as { speaker?: string }).speaker : undefined;
    quotes.push({
      id: store.quoteId(source.id, hash),
      sourceId: source.id,
      text: exact,
      start: v.start,
      end: v.end,
      line: lineOf(source.text, v.start),
      kind: c.kind,
      intensity: c.intensity,
      customer: multi && speaker ? `${source.customer}-${speaker.replace(/\D/g, "") || "1"}` : source.customer,
      ...(source.segment ? { segment: source.segment } : {}),
      ...(source.date ? { date: source.date } : {}),
      sha256: hash,
      extractor,
    });
  }
  return { quotes, dropped };
}

export async function extractAll(store: Store, config: ReceiptsConfig, options: ExtractOptions = {}): Promise<ExtractReport> {
  const llm = options.llm;
  const extractor: Extractor = llm ? llm.name : "heuristic";
  const report: ExtractReport = {
    extractor,
    quotes: 0,
    newQuotes: 0,
    sourcesProcessed: 0,
    sourcesReused: 0,
    dropped: [],
    errors: [],
  };
  const before = new Set(store.quotes.map((q) => q.id));
  const bySource = new Map<string, Quote[]>();
  for (const q of store.quotes) {
    const list = bySource.get(q.sourceId) ?? [];
    list.push(q);
    bySource.set(q.sourceId, list);
  }

  // Reuse quotes whose source is unchanged and was mined by the same extractor.
  const keep: Quote[] = [];
  const todo: Source[] = [];
  const extracted = store.meta.extracted ?? {};
  // Canonical order (by source ID) so new quote IDs are assigned identically
  // however the store was built.
  const ordered = [...store.sources].sort((a, b) => a.id.localeCompare(b.id));
  for (const s of ordered) {
    const existing = bySource.get(s.id) ?? [];
    const sameExtractor = extracted[s.id] === `${extractor}:${s.sha256}`;
    const stillValid = existing.every((q) => verifyStored(q, s.text).ok && q.extractor === extractor);
    if (!options.fresh && sameExtractor && stillValid) {
      keep.push(...existing);
      report.sourcesReused++;
    } else {
      todo.push(s);
    }
  }

  const fresh: Quote[] = [];
  const done = (n: number) => options.onProgress?.(n, todo.length);
  if (!llm) {
    todo.forEach((s, i) => {
      const { quotes, dropped } = verifyCandidates(store, s, heuristicExtract(s), "heuristic");
      fresh.push(...quotes);
      report.dropped.push(...dropped);
      extracted[s.id] = `heuristic:${s.sha256}`;
      done(i + 1);
    });
  } else {
    const batches = batchSources(todo, options.batchChars ?? 40_000);
    let finished = 0;
    await mapLimit(batches, options.concurrency ?? 4, async (batch) => {
      try {
        const found = await modelExtract(llm, batch, config.claude.maxQuotesPerSource);
        for (const s of batch.sources) {
          const { quotes, dropped } = verifyCandidates(store, s, found.get(s.id) ?? [], extractor);
          fresh.push(...quotes);
          report.dropped.push(...dropped);
          extracted[s.id] = `${extractor}:${s.sha256}`;
        }
      } catch (err) {
        if (!(err instanceof LLMError)) throw err;
        report.errors.push(`${batch.sources.length} source(s) skipped: ${err.message}`);
        // Keep old quotes for these sources rather than losing evidence.
        for (const s of batch.sources) keep.push(...(bySource.get(s.id) ?? []));
      }
      finished += batch.sources.length;
      done(finished);
    });
  }

  store.meta.extracted = extracted;
  report.sourcesProcessed = todo.length;
  const all = [...keep, ...fresh];
  const unique = new Map(all.map((q) => [q.id, q]));
  store.setQuotes([...unique.values()]);
  report.quotes = store.quotes.length;
  report.newQuotes = store.quotes.filter((q) => !before.has(q.id)).length;
  return report;
}
