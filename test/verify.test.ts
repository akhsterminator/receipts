import { describe, expect, it } from "vitest";
import { normalize, normalizeWithMap, verifyQuote, verifyStored } from "../src/verify.js";

const source = `Interviewer: How was it?
Participant: Honestly?  It's “fine”, but I can't export to Excel —
which is the whole reason I signed up… so I copy-paste every Friday.`;

describe("verifyQuote", () => {
  it("accepts an exact substring and returns exact offsets", () => {
    const r = verifyQuote("I can't export to Excel", source);
    expect(r.ok).toBe(true);
    expect(source.slice(r.start, r.end)).toBe("I can't export to Excel");
  });

  it("forgives whitespace and line breaks", () => {
    const r = verifyQuote("export to Excel — which is the whole reason", source);
    expect(r.ok).toBe(true);
    expect(r.exact).toBe("export to Excel —\nwhich is the whole reason");
  });

  it("forgives typographic quotes, dashes and ellipsis characters", () => {
    expect(verifyQuote(`It's "fine", but`, source).ok).toBe(true);
    expect(verifyQuote("Excel - which", source).ok).toBe(true);
    expect(verifyQuote("signed up... so I copy-paste", source).ok).toBe(true);
  });

  it("maps a match that ends on a multi-char normalisation back to the full original char", () => {
    const r = verifyQuote("signed up...", source);
    expect(r.ok).toBe(true);
    expect(r.exact).toBe("signed up…");
  });

  it("rejects paraphrases", () => {
    const r = verifyQuote("I cannot export to Excel", source);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not found in source");
  });

  it("rejects changed capitalisation and says why", () => {
    const r = verifyQuote("i can't export to excel", source);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/capitalisation/);
  });

  it("rejects elisions that stitch distant words together", () => {
    const r = verifyQuote("I can't export to Excel... every Friday", source);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/ellipsis/);
  });

  it("rejects empty or trivial quotes", () => {
    expect(verifyQuote("  ", source).ok).toBe(false);
    expect(verifyQuote("I", source).ok).toBe(false);
  });

  it("finds later occurrences when given a starting offset", () => {
    const text = "pause please. Later: pause please.";
    const first = verifyQuote("pause please", text);
    const second = verifyQuote("pause please", text, first.end);
    expect(second.ok).toBe(true);
    expect(second.start).toBeGreaterThan(first.start);
  });

  it("handles astral characters (emoji) without breaking offsets", () => {
    const text = "I love it 😍 but it crashes daily";
    const r = verifyQuote("😍 but it crashes", text);
    expect(r.ok).toBe(true);
    expect(text.slice(r.start, r.end)).toBe("😍 but it crashes");
  });
});

describe("verifyStored", () => {
  it("passes when the stored offsets still point at the text", () => {
    const r = verifyQuote("copy-paste every Friday", source);
    expect(verifyStored({ text: r.exact, start: r.start, end: r.end }, source).ok).toBe(true);
  });

  it("recovers when offsets drift but the text is unchanged", () => {
    const r = verifyQuote("copy-paste every Friday", source);
    const shifted = `New first line.\n${source}`;
    expect(verifyStored({ text: r.exact, start: r.start, end: r.end }, shifted).ok).toBe(true);
  });

  it("fails when the source no longer contains the quote", () => {
    const r = verifyQuote("copy-paste every Friday", source);
    const edited = source.replace("every Friday", "every Monday");
    expect(verifyStored({ text: r.exact, start: r.start, end: r.end }, edited).ok).toBe(false);
  });
});

describe("normalize", () => {
  it("is idempotent", () => {
    expect(normalize(normalize(source))).toBe(normalize(source));
  });

  it("keeps a one-to-one map from output to input offsets", () => {
    const n = normalizeWithMap("a  “b”\n\nc");
    expect(n.text).toBe('a "b" c');
    expect(n.map.length).toBe(n.text.length);
  });
});
