import { z } from "zod";
import { asOf, type ReceiptsConfig } from "../config.js";
import { LLMError, type LLM } from "../llm.js";
import type { Store } from "../store.js";
import type { Opportunity, Quote, Source } from "../types.js";
import { truncate } from "../util.js";
import { clusterQuotes, surfaceOf, themesFor, vectorize, type Cluster } from "./cluster.js";
import { breakdownFor, scoreFor, statsFor } from "./score.js";
import { addInto, cosine, normalizeVector, setIgnoredWords, topTerms, type Vector } from "./text.js";

export interface SynthesizeOptions {
  llm?: LLM;
  /** Write requirement titles and metrics with the model (default: when an LLM is given). */
  write?: boolean;
}

export interface SynthesizeReport {
  clusterer: "heuristic" | "claude" | "ollama";
  opportunities: number;
  longTail: number;
  errors: string[];
}

/* ---------- Model clustering ---------- */

const CLUSTER_SYSTEM = `You are a product discovery lead grouping verified customer quotes into an opportunity solution tree.

An opportunity is a customer need, pain point or desire, written from the customer's point of view ("I can't see why a payment failed"), never a solution ("Add a payment log"). Group quotes that express the same underlying need, even if they use different words. Each quote belongs to at most one opportunity. Leave out quotes that fit nowhere. An opportunity needs at least two quotes.

For each opportunity also give:
- job: a jobs-to-be-done statement, "When <situation>, I want to <motivation>, so I can <outcome>."
- theme: a 1-3 word parent outcome that groups related opportunities (e.g. "Billing", "Onboarding", "Collaboration").`;

const ClusterSchema = z.object({
  opportunities: z.array(
    z.object({
      title: z.string(),
      job: z.string(),
      theme: z.string(),
      quote_ids: z.array(z.string()),
    }),
  ),
});

const WRITE_SYSTEM = `You are a senior product manager writing a spec that AI coding agents will implement. For each opportunity you get the customer evidence behind it. Write:
- title: one requirement, imperative, describing the user-facing capability or outcome (max 90 characters). Do not invent details the evidence does not support.
- metric: one measurable success metric with a direction and a time frame, plausible for this product (e.g. "Export-related support tickets −30% within 60 days").
- rationale: one sentence on why, grounded only in what the quotes say.`;

const WriteSchema = z.object({
  requirements: z.array(z.object({ opportunity_id: z.string(), title: z.string(), metric: z.string(), rationale: z.string() })),
});

interface Draft {
  quoteIds: string[];
  title?: string;
  job?: string;
  theme?: string;
  keywords: string[];
  centroid?: Vector;
}

async function modelClusters(llm: LLM, quotes: Quote[]): Promise<Draft[]> {
  const lines = quotes.map((q) => `${q.id} [${q.kind}${q.segment ? `, ${q.segment}` : ""}] ${q.text.replace(/\s+/g, " ")}`);
  const result = await llm.json({
    system: CLUSTER_SYSTEM,
    prompt: `${quotes.length} verified quotes:\n\n${lines.join("\n")}\n\nGroup them into opportunities. Use only the quote IDs above.`,
    schema: ClusterSchema,
    maxTokens: 32000,
  });
  const known = new Set(quotes.map((q) => q.id));
  const used = new Set<string>();
  const drafts: Draft[] = [];
  for (const o of result.opportunities) {
    // Never trust a model's citation: keep only real, unused IDs.
    const ids = o.quote_ids.map((id) => id.toUpperCase()).filter((id) => known.has(id) && !used.has(id));
    ids.forEach((id) => used.add(id));
    if (ids.length) drafts.push({ quoteIds: ids, title: o.title, job: o.job, theme: o.theme, keywords: [] });
  }
  return drafts;
}

/* ---------- Main ---------- */

function representative(ids: string[], vectors: Map<string, Vector>, centroid: Vector, quotes: Map<string, Quote>): string {
  let best = ids[0]!;
  let bestScore = -1;
  for (const id of ids) {
    const q = quotes.get(id)!;
    const fit = q.text.length >= 25 && q.text.length <= 240 ? 0.1 : 0;
    const s = cosine(vectors.get(id) ?? new Map(), centroid) + fit + q.intensity * 0.05;
    if (s > bestScore) {
      bestScore = s;
      best = id;
    }
  }
  return best;
}

/**
 * The best human-readable title: a customer-written issue or ticket title in
 * the cluster that is close to its centre (upvotes help), otherwise the
 * representative quote.
 */
function heuristicTitle(
  ids: string[],
  repId: string,
  quotes: Map<string, Quote>,
  sources: Map<string, Source>,
  vectors: Map<string, Vector>,
  centroid: Vector,
): { title: string; quoteId?: string } {
  let best: { title: string; weight: number; id: string } | undefined;
  for (const id of ids) {
    const q = quotes.get(id)!;
    const src = sources.get(q.sourceId);
    if (!src || (src.kind !== "issue" && src.kind !== "ticket" && src.kind !== "review")) continue;
    if (q.start !== 0 || q.text !== src.title) continue;
    // How much of the cluster's core vocabulary the title covers (not normalised,
    // so "Can I pause instead of cancelling?" beats "Pause for maternity leave").
    let coverage = 0;
    for (const term of vectors.get(id)?.keys() ?? []) coverage += centroid.get(term) ?? 0;
    const votes = Number(src.meta?.votes ?? 0);
    const weight = (coverage + 0.1) * (1 + Math.log1p(votes) * 0.35) * (q.kind === "request" ? 1.1 : 1);
    if (!best || weight > best.weight) best = { title: src.title, weight, id };
  }
  const raw = best?.title ?? quotes.get(repId)!.text;
  const cleaned = raw.replace(/^\s*\[[^\]]{1,24}\]\s*:?\s*/, "").replace(/^(feature request|feat|request|bug|enhancement)\s*[:\-–]\s*/i, "");
  const t = truncate(cleaned, 90);
  return { title: t.charAt(0).toUpperCase() + t.slice(1), ...(best ? { quoteId: best.id } : {}) };
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  let inter = 0;
  for (const x of b) if (A.has(x)) inter++;
  return inter / (A.size + b.length - inter || 1);
}

export async function synthesize(store: Store, config: ReceiptsConfig, options: SynthesizeOptions = {}): Promise<SynthesizeReport> {
  const now = asOf(config);
  const quotes = store.quotes;
  const quoteMap = new Map(quotes.map((q) => [q.id, q]));
  const sourceMap = new Map(store.sources.map((s) => [s.id, s]));
  // The product's own name appears everywhere and links nothing.
  setIgnoredWords([...config.project.split(/[\s/]+/), ...(config.scoring.ignore ?? [])]);
  const qv = vectorize(quotes, sourceMap);
  const report: SynthesizeReport = { clusterer: "heuristic", opportunities: 0, longTail: 0, errors: [] };

  let drafts: Draft[] | undefined;
  if (options.llm && quotes.length > 0) {
    if (quotes.length <= 1500) {
      try {
        drafts = await modelClusters(options.llm, quotes);
        report.clusterer = options.llm.name;
      } catch (err) {
        if (!(err instanceof LLMError)) throw err;
        report.errors.push(`Model clustering failed, used the heuristic instead: ${err.message}`);
      }
    } else {
      report.errors.push(`${quotes.length} quotes is above the model clustering limit (1500); used the heuristic.`);
    }
  }
  if (!drafts) {
    const clusters: Cluster[] = clusterQuotes(quotes, qv, { similarity: config.scoring.similarity });
    drafts = clusters.map((c) => ({ quoteIds: c.quoteIds, keywords: c.keywords, centroid: c.centroid }));
  }

  const totalCustomers = new Set(quotes.map((q) => q.customer)).size;
  const quotesPerSource = new Map<string, number>();
  for (const q of quotes) quotesPerSource.set(q.sourceId, (quotesPerSource.get(q.sourceId) ?? 0) + 1);
  const previous = store.opportunities;
  const usedIds = new Set<string>();
  const opps: Opportunity[] = [];
  const centroids: Vector[] = [];

  for (const d of drafts) {
    const members = d.quoteIds.map((id) => quoteMap.get(id)!).filter(Boolean);
    const stats = statsFor(members, sourceMap, quotesPerSource);
    const enoughQuotes = members.length >= config.scoring.minQuotes;
    const enoughPeople = stats.customers >= 2 || stats.votes >= 5 || totalCustomers === 1;
    if (!enoughQuotes || !enoughPeople) continue;

    const centroid = d.centroid ?? (() => {
      const c: Vector = new Map();
      for (const id of d.quoteIds) addInto(c, qv.vectors.get(id) ?? new Map());
      return normalizeVector(c);
    })();
    const keywords = d.keywords.length ? d.keywords : topTerms(centroid, 6).map((t) => surfaceOf(t, qv.surface));
    let repId = representative(d.quoteIds, qv.vectors, centroid, quoteMap);
    let title = d.title;
    if (!title) {
      const h = heuristicTitle(d.quoteIds, repId, quoteMap, sourceMap, qv.vectors, centroid);
      title = h.title;
      // When a customer's own title names the opportunity, lead with that quote.
      if (h.quoteId) repId = h.quoteId;
    }

    // Keep IDs stable across runs: reuse the old ID of the most-overlapping opportunity.
    let id: string | undefined;
    let bestOverlap = 0;
    for (const p of previous) {
      if (usedIds.has(p.id)) continue;
      const o = jaccard(p.quoteIds, d.quoteIds);
      if (o > bestOverlap && o >= 0.4) {
        bestOverlap = o;
        id = p.id;
      }
    }
    id ??= store.opportunityId(`rep:${repId}`);
    if (usedIds.has(id)) id = store.opportunityId(`rep:${repId}:${d.quoteIds.length}:${opps.length}`);
    usedIds.add(id);

    const breakdown = breakdownFor(members, stats, config, now);
    const sortedIds = [...d.quoteIds].sort((a, b) => {
      const qa = quoteMap.get(a)!;
      const qb = quoteMap.get(b)!;
      if (a === repId) return -1;
      if (b === repId) return 1;
      return qb.intensity - qa.intensity || a.localeCompare(b, "en", { numeric: true });
    });
    opps.push({
      id,
      title,
      ...(d.job ? { job: d.job } : {}),
      theme: d.theme ?? "",
      keywords,
      quoteIds: sortedIds,
      representativeQuoteId: repId,
      stats,
      score: scoreFor(breakdown, { id, title, stats }, config),
      breakdown,
    });
    centroids.push(centroid);
  }

  // Themes for heuristic clusters.
  if (opps.some((o) => !o.theme)) {
    const labels = themesFor(centroids, qv.surface);
    opps.forEach((o, i) => {
      if (!o.theme) o.theme = labels[i] ?? "General";
    });
  }

  opps.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const shouldWrite = options.write ?? Boolean(options.llm);
  if (shouldWrite && options.llm && opps.length) {
    try {
      await writeRequirements(options.llm, opps, quoteMap);
    } catch (err) {
      if (!(err instanceof LLMError)) throw err;
      report.errors.push(`Could not write requirement drafts: ${err.message}`);
    }
  }
  for (const o of opps) o.requirement ??= { title: o.title };

  store.setOpportunities(opps);
  const covered = new Set(opps.flatMap((o) => o.quoteIds));
  report.opportunities = opps.length;
  report.longTail = quotes.filter((q) => !covered.has(q.id)).length;
  return report;
}

async function writeRequirements(llm: LLM, opps: Opportunity[], quotes: Map<string, Quote>): Promise<void> {
  const top = opps.slice(0, 40);
  const blocks = top.map((o) => {
    const sample = o.quoteIds
      .slice(0, 6)
      .map((id) => `  - ${id}: "${quotes.get(id)?.text.replace(/\s+/g, " ")}"`)
      .join("\n");
    return `${o.id}: ${o.title}\n  ${o.stats.customers} customers, segments: ${Object.keys(o.stats.segments).join(", ")}\n${sample}`;
  });
  const result = await llm.json({
    system: WRITE_SYSTEM,
    prompt: `Opportunities and their evidence:\n\n${blocks.join("\n\n")}\n\nWrite one requirement per opportunity.`,
    schema: WriteSchema,
  });
  const byId = new Map(top.map((o) => [o.id, o]));
  for (const r of result.requirements) {
    const o = byId.get(r.opportunity_id);
    if (o) o.requirement = { title: truncate(r.title, 100), metric: r.metric, rationale: r.rationale };
  }
}
