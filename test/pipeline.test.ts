/**
 * End to end on the bundled Tempo demo data: ingest → extract → synthesize →
 * spec → check → exports → viewer. Deterministic (heuristic extractor, fixed date).
 */
import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadConfig, type ReceiptsConfig } from "../src/config.js";
import { extractAll } from "../src/extract/index.js";
import { toLinearCsv, toSpecKit } from "../src/export.js";
import { ingestPaths } from "../src/ingest/index.js";
import { searchQuotes } from "../src/search.js";
import { checkSpec } from "../src/spec/check.js";
import { parseSpec } from "../src/spec/parse.js";
import { renderSpec } from "../src/spec/write.js";
import { Store } from "../src/store.js";
import { synthesize } from "../src/synthesize/index.js";
import { buildViewData, renderView } from "../src/view.js";

let dir: string;
let config: ReceiptsConfig;
let store: Store;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "receipts-e2e-"));
  cpSync(join(import.meta.dirname, "..", "examples", "tempo"), dir, { recursive: true });
  ({ config } = await loadConfig(dir));
  store = new Store(join(dir, ".receipts"));
  const report = ingestPaths([join(dir, "feedback")], {
    salt: "fixed",
    root: dir,
    redact: true,
    redactOptions: { allow: config.privacy.allow },
    interviewers: config.interviewers,
  });
  store.upsertSources(report.sources);
  await extractAll(store, config);
  await synthesize(store, config);
  store.save();
});

describe("Tempo demo, end to end", () => {
  it("ingests every format and removes personal data", () => {
    const kinds = new Set(store.sources.map((s) => s.kind));
    expect(kinds).toEqual(new Set(["ticket", "review", "survey", "interview"]));
    const all = store.sources.map((s) => s.text).join("\n");
    expect(all).not.toMatch(/priya\.raman@example\.com|7700 900123|Ben Carter|Rachel|Joanne/);
    expect(store.sources.filter((s) => s.kind === "interview")).toHaveLength(5);
  });

  it("verifies every quote against its source", () => {
    for (const q of store.quotes) {
      const src = store.source(q.sourceId)!;
      expect(src.text.slice(q.start, q.end)).toBe(q.text);
    }
  });

  it("never quotes the interviewer", () => {
    for (const q of store.quotes) {
      const src = store.source(q.sourceId)!;
      if (!src.turns) continue;
      const turn = src.turns.find((t) => q.start >= t.start && q.end <= t.end);
      expect(turn?.role).toBe("customer");
    }
  });

  it("ranks pausing a membership as the top opportunity", () => {
    const top = store.opportunities[0]!;
    expect(top.keywords).toContain("pause");
    expect(top.stats.customers).toBeGreaterThanOrEqual(8);
    expect(top.score).toBeGreaterThan(store.opportunities[1]!.score);
  });

  it("is deterministic", async () => {
    const before = store.opportunities.map((o) => [o.id, o.quoteIds.join(",")]);
    await synthesize(store, config);
    expect(store.opportunities.map((o) => [o.id, o.quoteIds.join(",")])).toEqual(before);
  });

  it("writes a spec that passes its own check with no errors", () => {
    const md = renderSpec(store, config);
    const result = checkSpec(parseSpec(md, "spec.md"), store, config);
    expect(result.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(result.summary.cited).toBe(result.summary.requirements);
  });

  it("catches the planted mistakes in the reviewed demo spec", () => {
    const md = readFileSync(join(dir, "spec.md"), "utf8");
    const result = checkSpec(parseSpec(md, "spec.md"), store, config);
    const got = result.findings.filter((f) => f.severity !== "info").map((f) => `${f.rule}:${f.requirement}`);
    expect(got).toEqual(["misquote:R4", "no-evidence:R7", "loudest-voice:R5", "stale-quote:R6"]);
    expect(result.ok).toBe(false);
  });

  it("exports to Spec Kit with evidence carried through", () => {
    const spec = parseSpec(readFileSync(join(dir, "spec.md"), "utf8"), "spec.md");
    const kit = toSpecKit(spec, store, config);
    expect(kit).toMatch(/^# Feature Specification: Tempo/);
    expect(kit).toContain("**FR-001** (R1): Let members pause their membership");
    expect(kit).toMatch(/\*\*FR-001\*\* \(R1\): .*\[Evidence: Q-\d{4}/);
    expect(kit).toContain("## Assumptions");
    expect(toLinearCsv(spec, store, config).split("\n")[0]).toBe("Title,Description,Priority,Labels");
  });

  it("searches what customers said", () => {
    const hits = searchQuotes(store, "offline download", 5);
    expect(hits[0]!.quote.text.toLowerCase()).toMatch(/download|offline/);
  });

  it("renders a self-contained viewer that cannot be broken out of by quote text", () => {
    const html = renderView(buildViewData(store, config));
    expect(html).toContain('<script id="data" type="application/json">');
    expect(html).not.toMatch(/<script[^>]*src=/);
    expect(html.match(/<\/script>/g)).toHaveLength(2);
  });
});
