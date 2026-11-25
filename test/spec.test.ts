import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, mergeConfig } from "../src/config.js";
import { checkSpec } from "../src/spec/check.js";
import { parseSpec } from "../src/spec/parse.js";
import { formatGithub, formatMarkdown, formatPretty } from "../src/spec/report.js";
import { Store } from "../src/store.js";
import type { Quote, Source } from "../src/types.js";
import { sha256 } from "../src/util.js";

const config = mergeConfig(DEFAULT_CONFIG, { asOf: "2026-11-20" });

function fixtureStore(): Store {
  const store = new Store(mkdtempSync(join(tmpdir(), "receipts-spec-")));
  const sources: Source[] = [];
  const quotes: Quote[] = [];
  const add = (n: number, customer: string, text: string, date: string) => {
    const body = `Ticket ${n}\n\n${text}`;
    const id = `src_${n}`;
    sources.push({ id, kind: "ticket", title: `Ticket ${n}`, origin: `t.csv#${n}`, customer, segment: "Pro", date, text: body, sha256: sha256(body), redactions: 0 });
    const start = body.indexOf(text);
    quotes.push({ id: `Q-000${n}`, sourceId: id, text, start, end: start + text.length, line: 3, kind: "pain", intensity: 0.6, customer, segment: "Pro", date, sha256: sha256(text), extractor: "heuristic" });
  };
  add(1, "cust_a", "I'd rather pause than cancel.", "2026-11-01");
  add(2, "cust_b", "Please let me pause my plan.", "2026-10-01");
  add(3, "cust_c", "I want dark mode.", "2026-10-01");
  add(4, "cust_d", "Pausing would have kept me.", "2025-01-10");
  store.upsertSources(sources);
  store.setQuotes(quotes);
  return store;
}

describe("parseSpec", () => {
  it("parses the documented grammar, including comments and bold list items", () => {
    const spec = parseSpec(`# Title

## R1. Pause subscriptions
because: [Q-0001, Q-0002]   # 2 customers · last seen 6 days ago
metric: Churn −10% in 90 days

### R-2: Dark mode
- **because:** Q-0003
- **owner:** Sam

## R3) Public API
bet: partners asked in sales calls

## Not a requirement
because: [Q-0004]
`);
    expect(spec.title).toBe("Title");
    expect(spec.requirements.map((r) => r.id)).toEqual(["R1", "R2", "R3"]);
    expect(spec.requirements[0]!.because.map((c) => c.id)).toEqual(["Q-0001", "Q-0002"]);
    expect(spec.requirements[0]!.metric?.text).toBe("Churn −10% in 90 days");
    expect(spec.requirements[1]!.because.map((c) => c.id)).toEqual(["Q-0003"]);
    expect(spec.requirements[1]!.owner).toBe("Sam");
    expect(spec.requirements[2]!.bet?.reason).toBe("partners asked in sales calls");
  });

  it("ignores requirement-looking text inside code fences and HTML comments", () => {
    const spec = parseSpec("```\n## R1. Not real\n```\n<!--\n## R2. Hidden\n-->\n## R3. Real\nbet: yes");
    expect(spec.requirements.map((r) => r.id)).toEqual(["R3"]);
  });

  it("collects inline quotes attributed to quote IDs", () => {
    const spec = parseSpec('## R1. X\nbecause: [Q-0001]\n\n> "I\'d rather pause than cancel." — Q-0001 · ticket');
    expect(spec.requirements[0]!.inlineQuotes).toEqual([{ id: "Q-0001", text: "I'd rather pause than cancel.", line: 4 }]);
  });
});

describe("checkSpec", () => {
  const run = (md: string, cfg = config) => checkSpec(parseSpec(md, "spec.md"), fixtureStore(), cfg);
  const rules = (md: string) => run(md).findings.map((f) => f.rule);

  it("passes a well-evidenced spec", () => {
    const r = run("## R1. Pause\nbecause: [Q-0001, Q-0002]\nmetric: churn down");
    expect(r.ok).toBe(true);
    expect(r.findings).toEqual([]);
    expect(r.summary).toMatchObject({ requirements: 1, cited: 1, verifiedQuotes: 4, unverifiedQuotes: 0 });
  });

  it("fails a requirement with no evidence and no bet", () => {
    const r = run("## R1. Pause\nmetric: churn down");
    expect(r.ok).toBe(false);
    expect(r.findings[0]).toMatchObject({ severity: "error", rule: "no-evidence", requirement: "R1", line: 1 });
    expect(r.findings[0]!.message).toBe("R1 has no evidence. Add because: or mark it bet:");
  });

  it("accepts a bet with a reason, rejects one without", () => {
    expect(run("## R1. API\nbet: three partners asked\nmetric: 2 partners").ok).toBe(true);
    expect(rules("## R1. API\nbet: TODO\nmetric: x")).toContain("empty-bet");
  });

  it("flags unknown quote IDs", () => {
    expect(rules("## R1. X\nbecause: [Q-0999]\nmetric: x")).toContain("unknown-quote");
  });

  it("warns on loudest-voice requirements", () => {
    const r = run("## R1. Dark mode\nbecause: [Q-0003]\nmetric: x");
    expect(r.ok).toBe(true);
    expect(r.findings[0]!.message).toBe("R1 rests on 1 customer (loudest-voice risk)");
  });

  it("warns on stale quotes with their age in months", () => {
    const r = run("## R1. Pause\nbecause: [Q-0001, Q-0004]\nmetric: x");
    expect(r.findings[0]!.message).toBe("Q-0004 is 22 months old (cited by R1)");
  });

  it("catches misquotes and shows what the customer actually said", () => {
    const r = run('## R1. Pause\nbecause: [Q-0001, Q-0002]\nmetric: x\n\n> "I\'d much rather pause than cancel." — Q-0001');
    expect(r.ok).toBe(false);
    expect(r.findings[0]!.rule).toBe("misquote");
    expect(r.findings[0]!.message).toContain(`The customer said: "I'd rather pause than cancel."`);
  });

  it("detects quotes whose source was tampered with after verification", () => {
    const store = fixtureStore();
    const src = store.source("src_1")!;
    src.text = src.text.replace("rather pause", "rather stay");
    const r = checkSpec(parseSpec("## R1. Pause\nbecause: [Q-0001, Q-0002]\nmetric: x"), store, config);
    expect(r.findings.map((f) => f.rule)).toContain("unverified-quote");
    expect(r.summary.unverifiedQuotes).toBe(1);
  });

  it("flags duplicate IDs and too many bets", () => {
    expect(rules("## R1. A\nbet: a\nmetric: x\n## R1. B\nbet: b\nmetric: x")).toEqual(expect.arrayContaining(["duplicate-id", "too-many-bets"]));
  });

  it("strict mode turns warnings into failures", () => {
    const strict = mergeConfig(config, { check: { ...config.check, strict: true } });
    expect(run("## R1. Dark mode\nbecause: [Q-0003]\nmetric: x", strict).ok).toBe(false);
  });

  it("formats results for terminals, GitHub annotations and Markdown summaries", () => {
    const r = run("## R1. A\nbecause: [Q-0003]\n## R2. B\nmetric: y");
    expect(formatPretty(r)).toContain("1/2 requirements cited");
    expect(formatGithub(r)).toContain("::error file=spec.md,line=3,title=receipts no-evidence::R2 has no evidence.");
    expect(formatMarkdown(r)).toContain("❌ Evidence check failed");
  });
});
