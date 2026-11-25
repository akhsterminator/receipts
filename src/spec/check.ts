/**
 * `receipts check`: lint a spec against the evidence store.
 *
 * Errors fail CI. Warnings are judgement calls a PM should see before an agent
 * builds the thing.
 */
import { asOf, type ReceiptsConfig } from "../config.js";
import type { Store } from "../store.js";
import type { CheckResult, Finding, ParsedSpec, Quote, Requirement } from "../types.js";
import { daysBetween, monthsOld, plural, sha256 } from "../util.js";
import { normalize, verifyStored } from "../verify.js";

function truncateQuote(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 90 ? `${t.slice(0, 89)}…` : t;
}

export interface QuoteStatus {
  ok: boolean;
  reason?: string;
}

/** Re-verify a stored quote against its stored source. */
export function quoteStatus(store: Store, quote: Quote): QuoteStatus {
  const source = store.source(quote.sourceId);
  if (!source) return { ok: false, reason: `its source ${quote.sourceId} is missing from the store` };
  if (sha256(source.text) !== source.sha256) return { ok: false, reason: `its source ${source.id} was edited after ingestion` };
  if (sha256(quote.text) !== quote.sha256) return { ok: false, reason: "the quote text was edited after verification" };
  const v = verifyStored(quote, source.text);
  if (!v.ok) return { ok: false, reason: `it no longer appears in ${source.id} (${v.reason})` };
  return { ok: true };
}

export function checkSpec(spec: ParsedSpec, store: Store, config: ReceiptsConfig): CheckResult {
  const findings: Finding[] = [];
  const now = asOf(config);
  const add = (f: Finding) => findings.push(f);
  const statusCache = new Map<string, QuoteStatus>();
  const status = (q: Quote) => {
    let s = statusCache.get(q.id);
    if (!s) {
      s = quoteStatus(store, q);
      statusCache.set(q.id, s);
    }
    return s;
  };

  if (!spec.requirements.length) {
    add({
      severity: "error",
      rule: "no-requirements",
      message: "No requirements found. Use headings like `## R1. Title` (see receipts docs).",
      line: 1,
    });
  }

  const seen = new Map<string, Requirement>();
  const staleReported = new Set<string>();
  const citedQuotes = new Set<string>();
  const allCustomers = new Set<string>();
  let cited = 0;
  let bets = 0;
  let uncited = 0;

  for (const req of spec.requirements) {
    const dup = seen.get(req.id);
    if (dup) {
      add({ severity: "error", rule: "duplicate-id", requirement: req.id, line: req.line, message: `${req.id} is used twice (also line ${dup.line})` });
    }
    seen.set(req.id, req);

    if (req.bet) {
      bets++;
      if (!req.bet.reason || /^(todo|tbd|\?+)$/i.test(req.bet.reason)) {
        add({ severity: "error", rule: "empty-bet", requirement: req.id, line: req.bet.line, message: `${req.id} is marked bet: but gives no reason. Say why you're betting and how you'll find out.` });
      }
    }

    if (req.hasBecause && !req.because.length && !req.bet) {
      add({ severity: "error", rule: "empty-because", requirement: req.id, line: req.line, message: `${req.id} has an empty because:. Cite quote IDs or mark it bet:` });
    }
    if (!req.hasBecause && !req.bet) {
      uncited++;
      add({ severity: "error", rule: "no-evidence", requirement: req.id, line: req.line, message: `${req.id} has no evidence. Add because: or mark it bet:` });
    }

    // Validate every citation.
    const valid: Quote[] = [];
    const seenHere = new Set<string>();
    for (const c of req.because) {
      if (seenHere.has(c.id)) continue;
      seenHere.add(c.id);
      const q = store.quote(c.id);
      if (!q) {
        add({ severity: "error", rule: "unknown-quote", requirement: req.id, quote: c.id, line: c.line, message: `${req.id} cites ${c.id}, which is not in the evidence store` });
        continue;
      }
      const st = status(q);
      if (!st.ok) {
        add({ severity: "error", rule: "unverified-quote", requirement: req.id, quote: c.id, line: c.line, message: `${c.id} cannot be verified: ${st.reason}` });
        continue;
      }
      valid.push(q);
      citedQuotes.add(q.id);
    }
    if (req.because.length && valid.length) cited++;
    else if (req.because.length && !req.bet) uncited++;

    // Inline quotes must match the store word for word.
    for (const iq of req.inlineQuotes) {
      const q = store.quote(iq.id);
      if (!q) {
        add({ severity: "error", rule: "unknown-quote", requirement: req.id, quote: iq.id, line: iq.line, message: `Quoted text attributed to ${iq.id}, which is not in the evidence store` });
      } else if (normalize(iq.text) !== normalize(q.text)) {
        add({ severity: "error", rule: "misquote", requirement: req.id, quote: iq.id, line: iq.line, message: `${req.id} misquotes ${iq.id}. The customer said: "${truncateQuote(q.text)}"` });
      } else if (!req.because.some((c) => c.id === iq.id)) {
        add({ severity: "info", rule: "uncited-inline-quote", requirement: req.id, quote: iq.id, line: iq.line, message: `${iq.id} is quoted under ${req.id} but not listed in because:` });
      }
    }

    if (!valid.length) {
      if (req.metric === undefined && config.check.requireMetric && (req.hasBecause || req.bet)) {
        add({ severity: "warning", rule: "no-metric", requirement: req.id, line: req.line, message: `${req.id} has no metric. How will you know it worked?` });
      }
      continue;
    }

    const customers = new Set(valid.map((q) => q.customer));
    for (const c of customers) allCustomers.add(c);
    if (customers.size < config.check.minCustomers) {
      add({
        severity: "warning",
        rule: "loudest-voice",
        requirement: req.id,
        line: req.line,
        message: `${req.id} rests on ${plural(customers.size, "customer")} (loudest-voice risk)`,
      });
    }

    const staleAfter = config.check.staleAfterDays;
    const dated = valid.filter((q) => q.date);
    const stale = dated.filter((q) => daysBetween(new Date(q.date!), now) > staleAfter);
    if (dated.length && stale.length === dated.length && dated.length === valid.length) {
      add({ severity: "warning", rule: "stale-evidence", requirement: req.id, line: req.line, message: `All evidence for ${req.id} is over ${Math.round(staleAfter / 30.4)} months old. Is it still true?` });
    } else {
      for (const q of stale) {
        if (staleReported.has(q.id)) continue;
        staleReported.add(q.id);
        add({ severity: "warning", rule: "stale-quote", requirement: req.id, quote: q.id, line: req.because.find((c) => c.id === q.id)?.line ?? req.line, message: `${q.id} is ${monthsOld(q.date!, now)} months old (cited by ${req.id})` });
      }
    }

    if (config.check.requireMetric && (!req.metric || !req.metric.text || /^(todo|tbd)\b/i.test(req.metric.text))) {
      add({ severity: "warning", rule: "no-metric", requirement: req.id, line: req.metric?.line ?? req.line, message: `${req.id} has no metric. How will you know it worked?` });
    }
  }

  const total = spec.requirements.length;
  if (total >= 2 && bets / total > config.check.maxBetShare) {
    add({ severity: "warning", rule: "too-many-bets", message: `${bets} of ${total} requirements are bets. That's a hypothesis list, not a spec. Run some discovery.` });
  }

  // Whole-store integrity: the summary line reports it, errors only for cited quotes (above).
  let verifiedQuotes = 0;
  let unverifiedQuotes = 0;
  for (const q of store.quotes) {
    if (status(q).ok) verifiedQuotes++;
    else unverifiedQuotes++;
  }

  const order = { error: 0, warning: 1, info: 2 } as const;
  findings.sort((a, b) => order[a.severity] - order[b.severity] || (a.line ?? 0) - (b.line ?? 0));
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  return {
    spec: spec.path,
    findings,
    summary: {
      requirements: total,
      cited,
      bets,
      uncited,
      citedQuotes: citedQuotes.size,
      verifiedQuotes,
      unverifiedQuotes,
      customers: allCustomers.size,
    },
    ok: errors === 0 && !(config.check.strict && warnings > 0),
  };
}
