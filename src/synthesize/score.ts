/**
 * Transparent prioritisation. Every factor is shown next to the score, and the
 * formula lives in receipts.config.ts where a team can argue about it in code
 * review instead of in a meeting.
 */
import type { ReceiptsConfig } from "../config.js";
import type { OpportunityStats, Quote, ScoreBreakdown, Source } from "../types.js";
import { countBy, daysBetween, round } from "../util.js";

/**
 * Upvotes belong to an issue as a whole. An opportunity gets all of an issue's
 * upvotes only if it contains the issue itself (its title); otherwise it gets a
 * share in proportion to how many of the issue's quotes it holds, halved. This
 * stops one stray sentence from a popular issue from carrying its votes.
 */
export function attributedVotes(quotes: Quote[], sources: Map<string, Source>, quotesPerSource?: Map<string, number>): number {
  const bySource = new Map<string, Quote[]>();
  for (const q of quotes) bySource.set(q.sourceId, [...(bySource.get(q.sourceId) ?? []), q]);
  let votes = 0;
  for (const [id, qs] of bySource) {
    const src = sources.get(id);
    const v = Number(src?.meta?.votes ?? 0) || 0;
    if (!v || !src) continue;
    const hasTitle = qs.some((q) => q.start === 0 && q.text === src.title);
    const total = quotesPerSource?.get(id) ?? qs.length;
    votes += hasTitle ? v : v * (qs.length / Math.max(1, total)) * 0.5;
  }
  return Math.round(votes);
}

export function statsFor(quotes: Quote[], sources: Map<string, Source>, quotesPerSource?: Map<string, number>): OpportunityStats {
  const dates = quotes.map((q) => q.date).filter((d): d is string => !!d).sort();
  const votes = attributedVotes(quotes, sources, quotesPerSource);
  // Segments counted per customer, not per quote: one chatty customer is one voice.
  const customerSegment = new Map<string, string>();
  for (const q of quotes) if (!customerSegment.has(q.customer)) customerSegment.set(q.customer, q.segment ?? "unknown");
  return {
    quotes: quotes.length,
    customers: customerSegment.size,
    segments: countBy([...customerSegment.values()], (s) => s),
    kinds: countBy(quotes, (q) => q.kind),
    votes,
    ...(dates.length ? { firstSeen: dates[0], lastSeen: dates[dates.length - 1] } : {}),
  };
}

export function breakdownFor(
  quotes: Quote[],
  stats: OpportunityStats,
  config: ReceiptsConfig,
  now: Date,
): ScoreBreakdown {
  const reach = Math.log2(1 + stats.customers) + 0.5 * Math.log2(1 + stats.votes);
  // Strongest feeling per customer, averaged: repetition doesn't inflate intensity.
  const perCustomer = new Map<string, number>();
  for (const q of quotes) perCustomer.set(q.customer, Math.max(perCustomer.get(q.customer) ?? 0, q.intensity));
  const intensity = [...perCustomer.values()].reduce((a, b) => a + b, 0) / Math.max(1, perCustomer.size);
  const weightOf = (segment: string) => config.segments.weights[segment] ?? config.segments.default;
  let segTotal = 0;
  let segCount = 0;
  for (const [segment, n] of Object.entries(stats.segments)) {
    segTotal += weightOf(segment) * n;
    segCount += n;
  }
  const segmentWeight = segCount ? segTotal / segCount : config.segments.default;
  const dated = quotes.filter((q) => q.date);
  const recency = dated.length
    ? dated.reduce((acc, q) => acc + 0.5 ** (daysBetween(new Date(q.date!), now) / config.scoring.halfLifeDays), 0) / dated.length
    : 1;
  return {
    reach: round(reach, 3),
    intensity: round(intensity, 3),
    segmentWeight: round(segmentWeight, 3),
    recency: round(recency, 3),
  };
}

export function defaultScore(b: ScoreBreakdown): number {
  return 10 * b.reach * (0.5 + b.intensity) * b.segmentWeight * (0.5 + 0.5 * b.recency);
}

export function scoreFor(
  breakdown: ScoreBreakdown,
  opp: { id: string; title: string; stats: OpportunityStats },
  config: ReceiptsConfig,
): number {
  const raw = config.score ? config.score({ breakdown, opportunity: opp }) : defaultScore(breakdown);
  return Number.isFinite(raw) ? round(raw, 1) : 0;
}

export const SCORE_FORMULA = "10 × reach × (0.5 + intensity) × segmentWeight × (0.5 + 0.5 × recency)";
