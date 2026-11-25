/** Resolve a requirement (or quote) to the evidence behind it. Shared by the CLI, exports and MCP server. */
import { asOf, type ReceiptsConfig } from "./config.js";
import { quoteStatus } from "./spec/check.js";
import type { Store } from "./store.js";
import type { ParsedSpec, Quote, Requirement, Source } from "./types.js";
import { countBy, humanAge } from "./util.js";

export interface QuoteEvidence {
  id: string;
  text: string;
  kind: Quote["kind"];
  intensity: number;
  customer: string;
  segment?: string;
  date?: string;
  age: string;
  verified: boolean;
  problem?: string;
  source: { id: string; kind: Source["kind"]; title: string; origin: string; url?: string; line: number };
  context: { before: string; after: string };
}

export interface RequirementEvidence {
  requirement: { id: string; title: string; line: number; metric?: string; bet?: string };
  quotes: QuoteEvidence[];
  missing: string[];
  customers: number;
  segments: Record<string, number>;
}

export function quoteEvidence(store: Store, q: Quote, config: ReceiptsConfig, contextChars = 220): QuoteEvidence {
  const src = store.source(q.sourceId);
  const status = quoteStatus(store, q);
  const text = src?.text ?? "";
  let before = text.slice(Math.max(0, q.start - contextChars), q.start);
  let after = text.slice(q.end, q.end + contextChars);
  if (q.start - contextChars > 0) before = `…${before.replace(/^\S*\s/, "")}`;
  if (q.end + contextChars < text.length) after = `${after.replace(/\s\S*$/, "")}…`;
  return {
    id: q.id,
    text: q.text,
    kind: q.kind,
    intensity: q.intensity,
    customer: q.customer,
    ...(q.segment ? { segment: q.segment } : {}),
    ...(q.date ? { date: q.date } : {}),
    age: humanAge(q.date, asOf(config)),
    verified: status.ok,
    ...(status.reason ? { problem: status.reason } : {}),
    source: {
      id: q.sourceId,
      kind: src?.kind ?? "note",
      title: src?.title ?? "(missing source)",
      origin: src?.origin ?? "",
      ...(typeof src?.meta?.url === "string" ? { url: src.meta.url } : {}),
      line: q.line,
    },
    context: { before, after },
  };
}

export function findRequirement(spec: ParsedSpec, id: string): Requirement | undefined {
  const norm = id.toUpperCase().replace(/^R-?/, "R");
  return spec.requirements.find((r) => r.id === norm || r.id === id.toUpperCase());
}

export function requirementEvidence(store: Store, req: Requirement, config: ReceiptsConfig): RequirementEvidence {
  const quotes: QuoteEvidence[] = [];
  const missing: string[] = [];
  for (const c of req.because) {
    const q = store.quote(c.id);
    if (q) quotes.push(quoteEvidence(store, q, config));
    else missing.push(c.id);
  }
  const customers = new Map(quotes.map((q) => [q.customer, q.segment ?? "unknown"]));
  return {
    requirement: {
      id: req.id,
      title: req.title,
      line: req.line,
      ...(req.metric ? { metric: req.metric.text } : {}),
      ...(req.bet ? { bet: req.bet.reason } : {}),
    },
    quotes,
    missing,
    customers: customers.size,
    segments: countBy([...customers.values()], (s) => s),
  };
}
