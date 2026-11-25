import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import { redact, pseudonym, type RedactOptions } from "../privacy.js";
import type { Source, SourceKind, SourceTurn } from "../types.js";
import { parseDate, sha256, shortHash } from "../util.js";
import { csvToRecords } from "./csv.js";
import { docxToText } from "./docx.js";
import {
  cleanIssueBody,
  isGitHubIssue,
  issueLabels,
  issueSegment,
  issueVotes,
  type GitHubIssue,
} from "./github.js";
import {
  buildTranscript,
  detectInterviewers,
  parseSpeakerText,
  parseSubtitles,
  splitFrontMatter,
  type RawTurn,
} from "./transcript.js";

export interface IngestContext {
  salt: string;
  root: string;
  redact: boolean;
  redactOptions: RedactOptions;
  interviewers: string[];
  /** Force a kind for tabular rows (otherwise inferred). */
  kind?: SourceKind;
  /** Force a segment for every source in this run. */
  segment?: string;
  columns?: Partial<ColumnMap>;
}

export interface IngestReport {
  sources: Source[];
  skipped: { path: string; reason: string }[];
  redactions: number;
}

export const SUPPORTED_EXTENSIONS = [".csv", ".tsv", ".json", ".jsonl", ".ndjson", ".txt", ".md", ".vtt", ".srt", ".docx"];

/* ---------- Tabular column detection ---------- */

export interface ColumnMap {
  text: string[];
  title: string;
  customer: string;
  name: string[];
  segment: string;
  date: string;
  rating: string;
  votes: string;
  id: string;
  url: string;
}

const COLUMN_HINTS: Record<keyof ColumnMap, string[]> = {
  text: ["body", "description", "message", "comment", "comments", "content", "review", "review text", "text", "feedback", "answer", "response", "conversation", "transcript", "note", "notes", "details", "ticket body", "first message", "verbatim", "what could we improve", "why"],
  title: ["subject", "title", "summary", "review title", "topic"],
  customer: ["customer id", "customer_id", "user id", "user_id", "requester id", "contact id", "account id", "email", "requester email", "requester", "customer email", "user email", "author", "user", "reviewer", "username", "customer", "account", "company", "organization", "name"],
  name: ["name", "requester", "requester name", "customer name", "full name", "first name", "last name", "author", "reviewer", "reviewer name", "user name", "contact name", "submitted by", "reporter"],
  segment: ["segment", "plan", "tier", "customer segment", "account tier", "subscription", "persona", "role", "plan name", "company size", "market"],
  date: ["created_at", "created at", "created", "date", "timestamp", "submitted", "submitted_at", "submitted at", "time", "review date", "opened", "updated_at", "updated at"],
  rating: ["rating", "stars", "score", "nps", "star rating", "csat"],
  votes: ["votes", "upvotes", "likes", "thumbs_up", "helpful", "helpful count", "+1"],
  id: ["id", "ticket id", "ticket_id", "conversation id", "review id", "number", "key"],
  url: ["url", "link", "permalink", "html_url"],
};

function pickColumn(headers: string[], hints: string[], exclude: Set<string> = new Set()): string | undefined {
  const norm = (h: string) => h.toLowerCase().replace(/[_-]+/g, " ").trim();
  for (const hint of hints) {
    const h = headers.find((x) => !exclude.has(x) && norm(x) === norm(hint));
    if (h) return h;
  }
  for (const hint of hints) {
    if (hint.length < 4) continue;
    const h = headers.find((x) => !exclude.has(x) && norm(x).includes(norm(hint)));
    if (h) return h;
  }
  return undefined;
}

export function detectColumns(headers: string[], override: Partial<ColumnMap> = {}): ColumnMap {
  const used = new Set<string>();
  const take = (key: keyof ColumnMap): string => {
    const forced = override[key];
    if (typeof forced === "string") return forced;
    const c = pickColumn(headers, COLUMN_HINTS[key], used);
    if (c) used.add(c);
    return c ?? "";
  };
  const id = take("id");
  const title = take("title");
  const text = override.text ?? (() => {
    const c = pickColumn(headers, COLUMN_HINTS.text, used);
    if (c) used.add(c);
    return c ? [c] : [];
  })();
  const customer = take("customer");
  const segment = take("segment");
  const date = take("date");
  const rating = take("rating");
  const votes = take("votes");
  const url = take("url");
  const name =
    override.name ??
    headers.filter((h) => COLUMN_HINTS.name.some((n) => h.toLowerCase().replace(/[_-]+/g, " ") === n));
  return { text, title, customer, name, segment, date, rating, votes, id, url };
}

/* ---------- Helpers ---------- */

function redactWith(ctx: IngestContext, text: string, names: string[] = []) {
  if (!ctx.redact) return { text, count: 0, kinds: {} as Record<string, number> };
  return redact(text, { ...ctx.redactOptions, names: [...(ctx.redactOptions.names ?? []), ...names] });
}

function makeSource(
  ctx: IngestContext,
  init: Omit<Source, "sha256" | "id" | "customer"> & { key: string; customerKey: string },
): Source {
  const { key, customerKey, ...rest } = init;
  return {
    id: `src_${shortHash(key, 10)}`,
    ...rest,
    customer: pseudonym(customerKey, ctx.salt),
    sha256: sha256(rest.text),
  };
}

/** Guess the kind of feedback from the export's file name. */
export function kindFromName(origin: string): SourceKind | undefined {
  const name = basename(origin.split("#")[0]!).toLowerCase();
  if (/survey|nps|csat|typeform|questionnaire/.test(name)) return "survey";
  if (/review|app-?store|play-?store|g2|capterra|trustpilot/.test(name)) return "review";
  if (/ticket|support|zendesk|intercom|helpscout|freshdesk|front|conversation/.test(name)) return "ticket";
  if (/interview|transcript|call/.test(name)) return "interview";
  return undefined;
}

function recordToSource(
  rec: Record<string, unknown>,
  cols: ColumnMap,
  ctx: IngestContext,
  origin: string,
  rowIndex: number,
): Source | undefined {
  const get = (c: string) => (c && rec[c] !== undefined && rec[c] !== null ? String(rec[c]).trim() : "");
  const body = cols.text.map(get).filter(Boolean).join("\n\n");
  const title = get(cols.title);
  if (!body && !title) return undefined;
  const raw = title && body && !body.startsWith(title) ? `${title}\n\n${body}` : body || title;
  const names = cols.name.map(get).filter(Boolean);
  const red = redactWith(ctx, raw, names);
  const titleRed = title ? redactWith(ctx, title, names).text : "";
  const rating = Number(get(cols.rating));
  const votes = Number(get(cols.votes));
  const customerKey = get(cols.customer) || `${origin}#${rowIndex}`;
  const kind: SourceKind = ctx.kind ?? kindFromName(origin) ?? (cols.rating && get(cols.rating) ? "review" : "ticket");
  const rowId = get(cols.id) || String(rowIndex);
  return makeSource(ctx, {
    key: `${origin}#${rowId}`,
    customerKey,
    kind,
    title: titleRed || `${kind.charAt(0).toUpperCase()}${kind.slice(1)} ${rowId}`,
    origin: `${origin}#${rowId}`,
    segment: ctx.segment ?? (get(cols.segment) || undefined),
    date: parseDate(get(cols.date)),
    text: red.text,
    redactions: red.count,
    meta: {
      ...(Number.isFinite(rating) && get(cols.rating) ? { rating } : {}),
      ...(Number.isFinite(votes) && votes > 0 ? { votes } : {}),
      ...(get(cols.url) ? { url: get(cols.url) } : {}),
    },
  });
}

export function issueToSource(issue: GitHubIssue, ctx: IngestContext, repo?: string): Source {
  const body = cleanIssueBody(issue.body ?? "");
  const raw = body ? `${issue.title}\n\n${body}` : issue.title;
  const red = redactWith(ctx, raw);
  const repoName = repo ?? /github\.com\/([^/]+\/[^/]+)\//.exec(issue.html_url)?.[1] ?? "github";
  const votes = issueVotes(issue);
  return makeSource(ctx, {
    key: `github:${repoName}#${issue.number}`,
    customerKey: `github:${issue.user?.login ?? `anon-${issue.number}`}`,
    kind: "issue",
    title: redactWith(ctx, issue.title).text,
    origin: issue.html_url,
    segment: ctx.segment ?? issueSegment(issue),
    // Upvotes keep arriving long after an issue is filed, so recency follows the
    // last activity on an open issue, not its creation date.
    date: parseDate(issue.state === "closed" ? issue.created_at : (issue.updated_at ?? issue.created_at)),
    text: red.text,
    redactions: red.count,
    meta: {
      url: issue.html_url,
      number: issue.number,
      createdAt: parseDate(issue.created_at),
      ...(votes ? { votes } : {}),
      labels: issueLabels(issue),
      comments: issue.comments ?? 0,
    },
  });
}

function transcriptToSource(
  turnsRaw: RawTurn[],
  ctx: IngestContext,
  meta: Record<string, string>,
  origin: string,
  fallbackTitle: string,
): Source {
  const interviewers = detectInterviewers(turnsRaw, [...ctx.interviewers, ...(meta.interviewer ? [meta.interviewer] : [])]);
  const names = [...new Set(turnsRaw.map((t) => t.speaker))].filter(
    (s) => !/^(interviewer|participant( \d+)?|q|a|unknown)$/i.test(s),
  );
  if (meta.participant && !/^p\d+$/i.test(meta.participant)) names.push(meta.participant);
  let redactions = 0;
  const redacted = turnsRaw.map((t) => {
    const r = redactWith(ctx, t.text, names);
    redactions += r.count;
    return { speaker: t.speaker, text: r.text };
  });
  const built = buildTranscript(redacted, interviewers);
  const participant = meta.participant ?? meta.customer ?? built.speakerNames.find((n) => ![...interviewers].includes(n)) ?? origin;
  return makeSource(ctx, {
    key: `file:${origin}`,
    customerKey: `participant:${participant}`,
    kind: "interview",
    title: meta.title ?? fallbackTitle,
    origin,
    segment: ctx.segment ?? meta.segment,
    date: parseDate(meta.date),
    text: built.text,
    redactions,
    turns: built.turns as SourceTurn[],
    meta: { participants: new Set(built.turns.filter((t) => t.role === "customer").map((t) => t.speaker)).size },
  });
}

/* ---------- File dispatch ---------- */

/** WebVTT NOTE blocks may carry `key: value` metadata (segment, date, interviewer…). */
function vttNoteMeta(body: string): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const block of body.replace(/\r/g, "").split(/\n{2,}/)) {
    if (!/^NOTE\b/.test(block)) continue;
    for (const line of block.split("\n").slice(1)) {
      const kv = /^([\w-]+)\s*:\s*(.+)$/.exec(line.trim());
      if (kv) meta[kv[1]!.toLowerCase()] = kv[2]!.trim();
    }
  }
  return meta;
}

export function ingestText(text: string, origin: string, ctx: IngestContext, ext: string): Source[] {
  const title = basename(origin).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
  // A date in the file name ("p01-2026-10-02.vtt") is a sensible default.
  const fileDate = /(\d{4}-\d{2}-\d{2})/.exec(basename(origin))?.[1];
  if (ext === ".vtt" || ext === ".srt") {
    const { meta, body } = splitFrontMatter(text);
    Object.assign(meta, vttNoteMeta(body), meta);
    if (!meta.date && fileDate) meta.date = fileDate;
    const turns = parseSubtitles(body);
    if (!turns.length) return [];
    return [transcriptToSource(turns, ctx, meta, origin, title)];
  }
  const { meta, body } = splitFrontMatter(text);
  if (!meta.date && fileDate) meta.date = fileDate;
  const turns = parseSpeakerText(body);
  if (turns) return [transcriptToSource(turns, ctx, meta, origin, title)];
  // A plain note: one customer, whole text is evidence.
  const red = redactWith(ctx, body.trim());
  if (!red.text) return [];
  return [
    makeSource(ctx, {
      key: `file:${origin}`,
      customerKey: `note:${meta.participant ?? meta.customer ?? origin}`,
      kind: (meta.kind as SourceKind) ?? ctx.kind ?? "note",
      title: meta.title ?? title,
      origin,
      segment: ctx.segment ?? meta.segment,
      date: parseDate(meta.date),
      text: red.text,
      redactions: red.count,
    }),
  ];
}

export function ingestRecords(records: unknown[], origin: string, ctx: IngestContext): Source[] {
  const objects = records.filter((r): r is Record<string, unknown> => !!r && typeof r === "object");
  if (!objects.length) return [];
  if (objects.every(isGitHubIssue)) {
    return (objects as unknown as GitHubIssue[]).filter((i) => !i.pull_request).map((i) => issueToSource(i, ctx));
  }
  const headers = [...new Set(objects.flatMap((o) => Object.keys(o)))];
  const cols = detectColumns(headers, ctx.columns);
  if (!cols.text.length && !cols.title) {
    throw new Error(
      `Could not find a feedback text column in ${origin}. Columns: ${headers.join(", ")}. Use --text-col <name>.`,
    );
  }
  const out: Source[] = [];
  objects.forEach((rec, i) => {
    const s = recordToSource(rec, cols, ctx, origin, i + 1);
    if (s) out.push(s);
  });
  return out;
}

export function ingestFile(path: string, ctx: IngestContext): Source[] {
  const ext = extname(path).toLowerCase();
  const origin = relative(ctx.root, path) || basename(path);
  if (ext === ".docx") return ingestText(docxToText(readFileSync(path)), origin, ctx, ".txt");
  const text = readFileSync(path, "utf8");
  if (ext === ".csv" || ext === ".tsv") return ingestRecords(csvToRecords(text), origin, ctx);
  if (ext === ".json") {
    const data = JSON.parse(text) as unknown;
    const list = Array.isArray(data)
      ? data
      : data && typeof data === "object" && Array.isArray((data as { items?: unknown[] }).items)
        ? (data as { items: unknown[] }).items
        : [data];
    return ingestRecords(list, origin, ctx);
  }
  if (ext === ".jsonl" || ext === ".ndjson") {
    const list = text
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as unknown);
    return ingestRecords(list, origin, ctx);
  }
  if (ext === ".txt" || ext === ".md" || ext === ".vtt" || ext === ".srt") return ingestText(text, origin, ctx, ext);
  throw new Error(`Unsupported file type ${ext}`);
}

export function expandPaths(paths: string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    const st = statSync(p);
    if (st.isDirectory()) {
      const entries = readdirSync(p).sort();
      out.push(
        ...expandPaths(
          entries.filter((e) => !e.startsWith(".") && e !== "node_modules" && e.toLowerCase() !== "readme.md").map((e) => join(p, e)),
        ),
      );
    } else if (SUPPORTED_EXTENSIONS.includes(extname(p).toLowerCase())) {
      out.push(p);
    }
  }
  return out;
}

export function ingestPaths(paths: string[], ctx: IngestContext): IngestReport {
  const report: IngestReport = { sources: [], skipped: [], redactions: 0 };
  for (const file of expandPaths(paths)) {
    try {
      const sources = ingestFile(file, ctx);
      if (!sources.length) report.skipped.push({ path: file, reason: "no text found" });
      report.sources.push(...sources);
    } catch (err) {
      report.skipped.push({ path: file, reason: (err as Error).message });
    }
  }
  for (const s of report.sources) report.redactions += s.redactions;
  return report;
}
