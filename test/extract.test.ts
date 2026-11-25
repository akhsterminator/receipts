import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { extractAll, verifyCandidates } from "../src/extract/index.js";
import { heuristicExtract } from "../src/extract/heuristic.js";
import { classify, sentences } from "../src/extract/signals.js";
import type { JsonRequest, LLM } from "../src/llm.js";
import { Store } from "../src/store.js";
import type { Source } from "../src/types.js";
import { sha256 } from "../src/util.js";

function source(text: string, over: Partial<Source> = {}): Source {
  return { id: "src_test", kind: "ticket", title: text.split("\n")[0]!, origin: "t.csv#1", customer: "cust_1", text, sha256: sha256(text), redactions: 0, ...over };
}

const tmpStore = () => new Store(mkdtempSync(join(tmpdir(), "receipts-store-")));

describe("signals", () => {
  it("classifies pains, requests, praise and questions", () => {
    expect(classify("The export keeps crashing and I lose my work.").kind).toBe("pain");
    expect(classify("I'd love a way to share dashboards with clients.").kind).toBe("request");
    expect(classify("Honestly the best tool we use.").kind).toBe("praise");
    expect(classify("Is there a way to export to PDF?").kind).toBe("request");
  });

  it("treats 'love it, but…' as the pain, not praise", () => {
    expect(classify("I love it, but sync is broken every morning.").kind).toBe("pain");
  });

  it("rates threats to leave as more intense than mild requests", () => {
    expect(classify("This is a deal-breaker, we are switching to a competitor.").intensity).toBeGreaterThan(
      classify("It would be nice to have a dark theme.").intensity,
    );
  });

  it("splits sentences with exact offsets and skips code, quotes and template headings", () => {
    const text = "### Describe the bug\nSaving fails. It loses my work!\n```\nconst x = 1;\n```\n> someone else said this\nPlease add autosave, e.g. every 5 minutes.";
    const spans = sentences(text);
    expect(spans.map((s) => s.text)).toEqual(["Saving fails.", "It loses my work!", "Please add autosave, e.g. every 5 minutes."]);
    for (const s of spans) expect(text.slice(s.start, s.end)).toBe(s.text);
  });
});

describe("heuristic extractor", () => {
  it("only quotes customer turns in interviews", () => {
    const text = "Interviewer: Would it be frustrating if exports broke?\nParticipant: Exports break every week and I have to rebuild reports by hand.";
    const s = source(text, {
      kind: "interview",
      turns: [
        { start: 13, end: 54, speaker: "Interviewer", role: "interviewer" },
        { start: 68, end: text.length, speaker: "Participant", role: "customer" },
      ],
    });
    const quotes = heuristicExtract(s);
    expect(quotes.length).toBeGreaterThan(0);
    expect(quotes.every((q) => !q.text.includes("Would it be"))).toBe(true);
  });

  it("uses an issue's title as the customer's own summary", () => {
    const s = source("Support exporting boards as PDF\n\nI need to send boards to clients who don't have accounts.", { kind: "issue" });
    expect(heuristicExtract(s)[0]?.text).toBe("Support exporting boards as PDF");
  });
});

describe("verifyCandidates", () => {
  it("drops paraphrases and interviewer quotes, keeps verbatim customer quotes", () => {
    const text = "Interviewer: Is billing confusing?\nParticipant: I never know which invoice is which.";
    const s = source(text, {
      kind: "interview",
      turns: [
        { start: 13, end: 34, speaker: "Interviewer", role: "interviewer" },
        { start: 48, end: text.length, speaker: "Participant", role: "customer" },
      ],
    });
    const { quotes, dropped } = verifyCandidates(
      tmpStore(),
      s,
      [
        { text: "I never know which invoice is which.", kind: "pain", intensity: 0.5 },
        { text: "I never know what invoice is which.", kind: "pain", intensity: 0.5 },
        { text: "Is billing confusing?", kind: "question", intensity: 0.2 },
      ],
      "claude",
    );
    expect(quotes.map((q) => q.text)).toEqual(["I never know which invoice is which."]);
    expect(dropped.map((d) => d.reason)).toEqual(["not found in source", "spoken by the interviewer or spans several turns"]);
    expect(text.slice(quotes[0]!.start, quotes[0]!.end)).toBe(quotes[0]!.text);
  });

  it("assigns stable IDs: the same quote gets the same ID on every run", () => {
    const store = tmpStore();
    const s = source("Sync is broken. Please fix sync!");
    const a = verifyCandidates(store, s, [{ text: "Sync is broken.", kind: "pain", intensity: 0.5 }], "heuristic").quotes[0]!;
    const b = verifyCandidates(store, s, [{ text: "Sync is broken.", kind: "pain", intensity: 0.5 }], "heuristic").quotes[0]!;
    expect(a.id).toBe("Q-0001");
    expect(b.id).toBe(a.id);
  });
});

/** A model that tries its best to hallucinate. */
class LyingLLM implements LLM {
  readonly name = "claude" as const;
  readonly model = "fake";
  calls = 0;
  async json<T>(req: JsonRequest<T>): Promise<T> {
    this.calls++;
    const ids = [...req.prompt.matchAll(/<source id="([^"]+)"/g)].map((m) => m[1]!);
    return req.schema.parse({
      quotes: ids.flatMap((id) => [
        { source_id: id, text: "The mobile app logs me out every single day.", kind: "pain", intensity: 0.7 },
        { source_id: id, text: "The app is great and has no problems at all.", kind: "praise", intensity: 0.9 },
        { source_id: "src_made_up", text: "anything", kind: "pain", intensity: 1 },
      ]),
    });
  }
}

describe("extractAll with a model", () => {
  it("keeps only quotes that verify, whatever the model claims", async () => {
    const store = tmpStore();
    store.upsertSources([source("Logged out again\n\nThe mobile app logs me out every single day.")]);
    const llm = new LyingLLM();
    const report = await extractAll(store, DEFAULT_CONFIG, { llm });
    expect(report.extractor).toBe("claude");
    expect(store.quotes.map((q) => q.text)).toEqual(["The mobile app logs me out every single day."]);
    expect(report.dropped).toHaveLength(1);
  });

  it("does not call the model again for unchanged sources", async () => {
    const store = tmpStore();
    store.upsertSources([source("Logged out again\n\nThe mobile app logs me out every single day.")]);
    const llm = new LyingLLM();
    await extractAll(store, DEFAULT_CONFIG, { llm });
    await extractAll(store, DEFAULT_CONFIG, { llm });
    expect(llm.calls).toBe(1);
  });
});
