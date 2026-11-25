import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { csvToRecords, parseCsv, sniffDelimiter } from "../src/ingest/csv.js";
import { docxToText } from "../src/ingest/docx.js";
import { detectColumns, ingestFile, ingestRecords, ingestText, kindFromName, type IngestContext } from "../src/ingest/index.js";
import { detectInterviewers, parseSpeakerText, parseSubtitles } from "../src/ingest/transcript.js";
// @ts-expect-error plain ESM helper without types
import { makeDocx } from "../scripts/make-docx.mjs";

const ctx = (over: Partial<IngestContext> = {}): IngestContext => ({
  salt: "test-salt",
  root: "/",
  redact: true,
  redactOptions: {},
  interviewers: [],
  ...over,
});

describe("csv", () => {
  it("parses quoted fields, escaped quotes and embedded newlines", () => {
    const rows = parseCsv('a,b\n"x, y","he said ""hi""\nthen left"\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", 'he said "hi"\nthen left'],
    ]);
  });

  it("sniffs semicolons and tabs", () => {
    expect(sniffDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(sniffDelimiter("a\tb\n1\t2")).toBe("\t");
  });

  it("strips a BOM and maps headers to records", () => {
    expect(csvToRecords("﻿id,text\n1,hello")).toEqual([{ id: "1", text: "hello" }]);
  });
});

describe("column detection", () => {
  it("recognises common Zendesk / Intercom / app store headers", () => {
    const cols = detectColumns(["Ticket ID", "Subject", "Description", "Requester", "Requester email", "Plan", "Created at"]);
    expect(cols.text).toEqual(["Description"]);
    expect(cols.title).toBe("Subject");
    expect(cols.customer).toBe("Requester email");
    expect(cols.segment).toBe("Plan");
    expect(cols.date).toBe("Created at");
    expect(cols.id).toBe("Ticket ID");
  });
});

describe("tabular ingestion", () => {
  it("creates redacted sources with pseudonymous customers", () => {
    const sources = ingestRecords(
      [{ id: "7", subject: "Pause please", body: "Hi, I'm Dana from Acme. Can I pause? Thanks, Dana Smith", email: "dana@acme.io", name: "Dana Smith", plan: "Pro", created_at: "2026-10-01" }],
      "tickets.csv",
      ctx(),
    );
    expect(sources).toHaveLength(1);
    const s = sources[0]!;
    expect(s.kind).toBe("ticket");
    expect(s.text).not.toMatch(/Dana|dana@acme\.io/);
    expect(s.customer).toMatch(/^cust_[0-9a-f]{8}$/);
    expect(s.segment).toBe("Pro");
    expect(s.date).toBe("2026-10-01T00:00:00.000Z");
    expect(s.text.startsWith("Pause please\n\n")).toBe(true);
  });

  it("gives every row the same customer ID when the customer is the same", () => {
    const sources = ingestRecords(
      [
        { text: "first complaint here", email: "a@b.co" },
        { text: "second complaint here", email: "A@B.co" },
      ],
      "x.csv",
      ctx(),
    );
    expect(sources[0]!.customer).toBe(sources[1]!.customer);
  });

  it("recognises GitHub issue JSON", () => {
    const sources = ingestRecords(
      [{ number: 12, title: "Add dark mode", body: "<!-- template -->\nPlease add dark mode, my eyes hurt.", html_url: "https://github.com/o/r/issues/12", created_at: "2026-01-02T00:00:00Z", user: { login: "someone" }, author_association: "NONE", reactions: { "+1": 41, heart: 3 } }],
      "issues.json",
      ctx(),
    );
    const s = sources[0]!;
    expect(s.kind).toBe("issue");
    expect(s.meta?.votes).toBe(44);
    expect(s.segment).toBe("user");
    expect(s.text).toBe("Add dark mode\n\nPlease add dark mode, my eyes hurt.");
  });

  it("infers survey/review/ticket from the file name", () => {
    expect(kindFromName("exports/nps-2026.csv")).toBe("survey");
    expect(kindFromName("app-store-reviews.json")).toBe("review");
    expect(kindFromName("zendesk.csv#12")).toBe("ticket");
  });

  it("explains how to fix a CSV with no recognisable text column", () => {
    expect(() => ingestRecords([{ foo: "1", bar: "2" }], "weird.csv", ctx())).toThrow(/--text-col/);
  });
});

describe("transcripts", () => {
  const txt = `---
participant: P7
segment: Enterprise
date: 2026-09-01
---
Alex: What happened last time?
Morgan Lee: We lost a whole day because exports kept failing.
Alex: And then?
Morgan Lee: I rebuilt the report by hand. Again.
Alex: Why?`;

  it("parses speaker lines and front matter", () => {
    const turns = parseSpeakerText(txt.split("---\n")[2]!);
    expect(turns?.map((t) => t.speaker)).toEqual(["Alex", "Morgan Lee", "Alex", "Morgan Lee", "Alex"]);
  });

  it("detects the interviewer as the person asking the questions", () => {
    const turns = parseSpeakerText(txt.split("---\n")[2]!)!;
    expect([...detectInterviewers(turns)]).toEqual(["Alex"]);
  });

  it("replaces speaker names with roles and keeps turn offsets", () => {
    const [s] = ingestText(txt, "interviews/p7.md", ctx(), ".md");
    expect(s!.kind).toBe("interview");
    expect(s!.segment).toBe("Enterprise");
    expect(s!.text).not.toMatch(/Morgan|Alex/);
    expect(s!.text).toContain("Participant: We lost a whole day");
    const customerTurn = s!.turns!.find((t) => t.role === "customer")!;
    expect(s!.text.slice(customerTurn.start, customerTurn.end)).toBe("We lost a whole day because exports kept failing.");
  });

  it("parses WebVTT voice tags and SRT speaker prefixes", () => {
    const vtt = parseSubtitles("WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\n<v Sam>Why?</v>\n\n2\n00:00:02.000 --> 00:00:04.000\n<v Kim>Because it breaks.</v>\n\n3\n00:00:04.000 --> 00:00:05.000\n<v Kim>Every day.</v>");
    expect(vtt).toEqual([
      { speaker: "Sam", text: "Why?" },
      { speaker: "Kim", text: "Because it breaks. Every day." },
    ]);
    const srt = parseSubtitles("1\n00:00:00,000 --> 00:00:02,000\nInterviewer: Hi?\n\n2\n00:00:02,000 --> 00:00:04,000\nParticipant: Hello there.");
    expect(srt.map((t) => t.speaker)).toEqual(["Interviewer", "Participant"]);
  });

  it("reads metadata from VTT NOTE blocks and dates from file names", () => {
    const vtt = "WEBVTT\n\nNOTE\nsegment: Pro\n\n1\n00:00:01.000 --> 00:00:02.000\n<v A>Why is that?</v>\n\n2\n00:00:02.000 --> 00:00:03.000\n<v B>It is slow every morning.</v>";
    const [s] = ingestText(vtt, "calls/2026-03-04-b.vtt", ctx(), ".vtt");
    expect(s!.segment).toBe("Pro");
    expect(s!.date?.slice(0, 10)).toBe("2026-03-04");
  });

  it("treats text without speakers as a single-customer note", () => {
    const [s] = ingestText("Customer says sync is broken and they are switching.", "notes/call.txt", ctx(), ".txt");
    expect(s!.kind).toBe("note");
    expect(s!.turns).toBeUndefined();
  });
});

describe("docx", () => {
  it("extracts paragraphs from a real .docx zip", () => {
    const buf: Buffer = makeDocx(["Interviewer: Hello?", "Participant: The invoices are wrong & late."]);
    expect(docxToText(buf)).toBe("Interviewer: Hello?\nParticipant: The invoices are wrong & late.");
  });

  it("ingests .docx files from disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "receipts-docx-"));
    const file = join(dir, "call.docx");
    writeFileSync(file, makeDocx(["Interviewer: What hurts?", "Participant: Billing is confusing every month.", "Interviewer: Why?", "Participant: Two invoices, no explanation."]));
    const [s] = ingestFile(file, ctx({ root: dir }));
    expect(s!.kind).toBe("interview");
    expect(s!.text).toContain("Participant: Billing is confusing every month.");
  });
});
