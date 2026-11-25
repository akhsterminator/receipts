import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { asOf, CONFIG_TEMPLATE, loadConfig, type ExtractorChoice, type ReceiptsConfig } from "./config.js";
import { findRequirement, quoteEvidence, requirementEvidence } from "./evidence.js";
import { toJson, toLinearCsv, toSpecKit, writeGithubIssues, type ExportFormat } from "./export.js";
import { extractAll } from "./extract/index.js";
import { fetchIssues, type GitHubIssue } from "./ingest/github.js";
import { ingestPaths, issueToSource, type ColumnMap, type IngestContext } from "./ingest/index.js";
import { createLLM, hasAnthropicCredentials, type LLM } from "./llm.js";
import { loadSalt } from "./privacy.js";
import { searchQuotes } from "./search.js";
import { checkSpec, quoteStatus } from "./spec/check.js";
import { parseSpec } from "./spec/parse.js";
import { formatGithub, formatJson, formatMarkdown, formatPretty } from "./spec/report.js";
import { evidenceComment, renderSpec } from "./spec/write.js";
import { Store } from "./store.js";
import { synthesize } from "./synthesize/index.js";
import type { CheckResult, Source, SourceKind } from "./types.js";
import { bar, c, header, log, out, spinner, sym } from "./ui.js";
import { humanAge, plural, truncate } from "./util.js";
import { buildViewData, renderView } from "./view.js";

export interface GlobalOptions {
  config?: string;
  store?: string;
  asOf?: string;
  cwd?: string;
}

export interface Ctx {
  config: ReceiptsConfig;
  root: string;
  storeDir: string;
  cwd: string;
}

export async function context(opts: GlobalOptions): Promise<Ctx> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const { config, root } = await loadConfig(cwd, opts.config);
  if (opts.asOf) config.asOf = opts.asOf;
  const storeDir = resolve(opts.store ? cwd : root, opts.store ?? config.store);
  return { config, root, storeDir, cwd };
}

function openStore(ctx: Ctx, mustExist = true): Store {
  const store = Store.open(ctx.storeDir);
  if (mustExist && !store.exists()) {
    throw new UserError(`No evidence store at ${relative(ctx.cwd, ctx.storeDir) || "."}. Run \`receipts run <feedback files>\` first, or pass --store.`);
  }
  return store;
}

export class UserError extends Error {}

/* ---------------- init ---------------- */

export function cmdInit(ctx: Ctx, opts: { project?: string; ci?: boolean; force?: boolean }): void {
  const file = join(ctx.cwd, "receipts.config.ts");
  const project = opts.project ?? basename(ctx.cwd);
  if (existsSync(file) && !opts.force) {
    log(`${c.yellow(sym.warn)} receipts.config.ts already exists (use --force to overwrite)`);
  } else {
    writeFileSync(file, CONFIG_TEMPLATE.replace("__PROJECT__", project.replace(/"/g, "'")));
    log(`${c.green(sym.ok)} wrote receipts.config.ts`);
  }
  const feedback = join(ctx.cwd, "feedback");
  if (!existsSync(feedback)) {
    mkdirSync(feedback, { recursive: true });
    writeFileSync(
      join(feedback, "README.md"),
      "Drop customer feedback here: interview transcripts (.txt .md .vtt .srt .docx), support-ticket or review exports (.csv .json), GitHub issue dumps.\n\nThen run `npx @hashimua/receipts run feedback/`.\n",
    );
    log(`${c.green(sym.ok)} created feedback/ (put exports and transcripts here)`);
  }
  if (opts.ci) {
    const wf = join(ctx.cwd, ".github", "workflows", "receipts.yml");
    mkdirSync(dirname(wf), { recursive: true });
    writeFileSync(wf, CI_WORKFLOW);
    log(`${c.green(sym.ok)} wrote .github/workflows/receipts.yml (checks spec.md on every PR)`);
  }
  log(`\nNext: ${c.cyan("npx @hashimua/receipts run feedback/")}`);
}

export const CI_WORKFLOW = `name: receipts
on:
  pull_request:
    paths: ["**/*.md", ".receipts/**"]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: akhsterminator/receipts@v0
        with:
          spec: spec.md
`;

/* ---------------- ingest / extract / synthesize ---------------- */

export interface IngestOptions {
  kind?: SourceKind;
  segment?: string;
  textCol?: string;
  customerCol?: string;
  segmentCol?: string;
  dateCol?: string;
  redact?: boolean;
}

function ingestContext(ctx: Ctx, opts: IngestOptions): IngestContext {
  const columns: Partial<ColumnMap> = {};
  if (opts.textCol) columns.text = opts.textCol.split(",").map((s) => s.trim());
  if (opts.customerCol) columns.customer = opts.customerCol;
  if (opts.segmentCol) columns.segment = opts.segmentCol;
  if (opts.dateCol) columns.date = opts.dateCol;
  return {
    salt: loadSalt(ctx.storeDir),
    root: ctx.cwd,
    redact: opts.redact !== false && ctx.config.privacy.redact,
    redactOptions: {
      patterns: ctx.config.privacy.patterns,
      allow: [...ctx.config.privacy.allow, ...ctx.config.project.split(/\s+/)],
    },
    interviewers: ctx.config.interviewers,
    ...(opts.kind ? { kind: opts.kind } : {}),
    ...(opts.segment ? { segment: opts.segment } : {}),
    columns,
  };
}

export function cmdIngest(ctx: Ctx, paths: string[], opts: IngestOptions): Store {
  const store = openStore(ctx, false);
  const report = ingestPaths(
    paths.map((p) => resolve(ctx.cwd, p)),
    ingestContext(ctx, opts),
  );
  const r = store.upsertSources(report.sources);
  store.save();
  const kinds = Object.entries(
    report.sources.reduce<Record<string, number>>((a, s) => ((a[s.kind] = (a[s.kind] ?? 0) + 1), a), {}),
  )
    .map(([k, n]) => plural(n, k))
    .join(", ");
  log(`${c.green(sym.ok)} ingested ${plural(report.sources.length, "source")}${kinds ? ` (${kinds})` : ""}: ${r.added} new, ${r.updated} changed, ${r.unchanged} unchanged`);
  if (report.redactions) log(`${c.green(sym.ok)} removed ${plural(report.redactions, "piece")} of personal data before storing anything`);
  for (const s of report.skipped) log(`${c.yellow(sym.warn)} skipped ${relative(ctx.cwd, s.path)}: ${s.reason}`);
  return store;
}

export function resolveExtractor(ctx: Ctx, choice?: string): { llm?: LLM; label: string } {
  const pick = (choice ?? ctx.config.extractor) as ExtractorChoice;
  const llm = createLLM(pick, ctx.config);
  if (!llm && pick === "auto") return { label: `heuristic (offline${hasAnthropicCredentials() ? "" : "; set ANTHROPIC_API_KEY for Claude"})` };
  if (!llm) return { label: "heuristic (offline)" };
  return { llm, label: `${llm.name} · ${llm.model}` };
}

export async function cmdExtract(ctx: Ctx, opts: { extractor?: string; fresh?: boolean; concurrency?: number }): Promise<Store> {
  const store = openStore(ctx);
  const { llm, label } = resolveExtractor(ctx, opts.extractor);
  const spin = spinner(`Extracting quotes with ${label}`);
  const report = await extractAll(store, ctx.config, {
    ...(llm ? { llm } : {}),
    ...(opts.fresh ? { fresh: true } : {}),
    concurrency: opts.concurrency ?? 4,
    onProgress: (d, t) => spin.update(`Extracting quotes with ${label}: ${d}/${t} sources`),
  });
  spin.stop();
  store.meta.lastRun = {
    at: new Date().toISOString(),
    extractor: report.extractor,
    clusterer: store.meta.lastRun?.clusterer ?? "heuristic",
    dropped: report.dropped.length,
  };
  store.save();
  log(`${c.green(sym.ok)} ${plural(report.quotes, "verified quote")} (${report.newQuotes} new) via ${label}`);
  if (report.dropped.length) {
    log(`${c.yellow(sym.warn)} dropped ${plural(report.dropped.length, "quote")} that did not appear word for word in the source${process.env.RECEIPTS_DEBUG ? "" : " (RECEIPTS_DEBUG=1 to list)"}`);
    if (process.env.RECEIPTS_DEBUG) for (const d of report.dropped) log(c.dim(`    ${d.sourceId}: ${truncate(d.text, 80)} (${d.reason})`));
  }
  for (const e of report.errors) log(`${c.yellow(sym.warn)} ${e}`);
  return store;
}

export async function cmdSynthesize(ctx: Ctx, opts: { extractor?: string }): Promise<Store> {
  const store = openStore(ctx);
  const choice = opts.extractor ?? (ctx.config.clusterer === "auto" ? ctx.config.extractor : ctx.config.clusterer);
  const { llm, label } = resolveExtractor(ctx, choice);
  const spin = spinner(`Grouping quotes into opportunities (${label})`);
  const report = await synthesize(store, ctx.config, llm ? { llm } : {});
  spin.stop();
  if (store.meta.lastRun) store.meta.lastRun.clusterer = report.clusterer === "heuristic" ? "heuristic" : "claude";
  store.save();
  log(`${c.green(sym.ok)} ${plural(report.opportunities, "opportunity", "opportunities")} ranked · ${report.longTail} quotes in the long tail`);
  for (const e of report.errors) log(`${c.yellow(sym.warn)} ${e}`);
  return store;
}

export function cmdSpec(ctx: Ctx, opts: { out?: string; top?: number; force?: boolean; stdout?: boolean }): string | undefined {
  const store = openStore(ctx);
  const outPath = resolve(ctx.cwd, opts.out ?? "spec.md");
  const storeRel = relative(dirname(outPath), ctx.storeDir) || ".";
  const md = renderSpec(store, ctx.config, { ...(opts.top ? { top: opts.top } : {}), storePath: storeRel });
  if (opts.stdout) {
    out(md);
    return undefined;
  }
  if (existsSync(outPath) && !opts.force) {
    throw new UserError(`${relative(ctx.cwd, outPath)} already exists. Use --force to overwrite, or --out spec.draft.md.`);
  }
  writeFileSync(outPath, md);
  log(`${c.green(sym.ok)} wrote ${relative(ctx.cwd, outPath)} (${plural(Math.min(store.opportunities.length, opts.top ?? 12), "cited requirement")})`);
  return outPath;
}

/* ---------------- check ---------------- */

export function cmdCheck(
  ctx: Ctx,
  specArg: string | undefined,
  opts: { format?: string; strict?: boolean; verbose?: boolean; summary?: string },
): CheckResult {
  const specPath = resolve(ctx.cwd, specArg ?? "spec.md");
  if (!existsSync(specPath)) throw new UserError(`Spec not found: ${relative(ctx.cwd, specPath)}`);
  const store = openStore(ctx, false);
  if (opts.strict) ctx.config.check.strict = true;
  const spec = parseSpec(readFileSync(specPath, "utf8"), relative(ctx.cwd, specPath));
  const result = checkSpec(spec, store, ctx.config);
  const format = opts.format ?? (process.env.GITHUB_ACTIONS === "true" ? "github" : "pretty");
  if (format === "json") out(formatJson(result));
  else if (format === "github") out(formatGithub(result));
  else if (format === "markdown") out(formatMarkdown(result));
  else out(formatPretty(result, { verbose: opts.verbose ?? false }));
  const summaryFile = opts.summary ?? (process.env.GITHUB_ACTIONS === "true" ? process.env.GITHUB_STEP_SUMMARY : undefined);
  if (summaryFile) appendFileSync(summaryFile, `${formatMarkdown(result)}\n`);
  return result;
}

/* ---------------- read commands ---------------- */

function wrap(text: string, width: number, indent: string): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > width) {
      lines.push(line);
      line = w;
    } else line = (line + " " + w).trim();
  }
  if (line) lines.push(line);
  return lines.map((l) => indent + l).join("\n");
}

const KIND_COLOR: Record<string, (s: string) => string> = { pain: c.red, request: c.blue, praise: c.green, question: c.magenta, other: c.dim };

export function cmdWhy(ctx: Ctx, id: string, opts: { spec?: string; json?: boolean }): void {
  const store = openStore(ctx);
  const specPath = resolve(ctx.cwd, opts.spec ?? "spec.md");
  if (!existsSync(specPath)) throw new UserError(`Spec not found: ${relative(ctx.cwd, specPath)}`);
  const spec = parseSpec(readFileSync(specPath, "utf8"), relative(ctx.cwd, specPath));
  const req = findRequirement(spec, id);
  if (!req) throw new UserError(`No requirement ${id} in ${spec.path}. Known: ${spec.requirements.map((r) => r.id).join(", ")}`);
  const ev = requirementEvidence(store, req, ctx.config);
  if (opts.json) return out(JSON.stringify(ev, null, 2));
  const lines = [header(`${req.id}. ${req.title}`)];
  if (req.metric) lines.push(`  ${c.dim("metric")}  ${req.metric.text}`);
  if (req.bet) lines.push(`  ${c.yellow("bet")}     ${req.bet.reason}`);
  const segs = Object.entries(ev.segments).map(([s, n]) => `${s} ${n}`).join(", ");
  lines.push(`  ${c.dim("evidence")} ${plural(ev.customers, "customer")}${segs ? ` (${segs})` : ""} · ${plural(ev.quotes.length, "quote")}\n`);
  for (const q of ev.quotes) {
    const kind = (KIND_COLOR[q.kind] ?? c.dim)(q.kind.padEnd(8));
    lines.push(`  ${c.bold(q.id)} ${kind} ${c.dim(`${q.source.kind}${q.segment ? ` · ${q.segment}` : ""} · ${q.age}`)} ${q.verified ? c.green(sym.ok) : c.red(`${sym.err} ${q.problem}`)}`);
    lines.push(c.italic(wrap(`“${q.text}”`, 88, "    ")));
    if (q.source.url) lines.push(c.dim(`    ${q.source.url}`));
    lines.push("");
  }
  for (const m of ev.missing) lines.push(`  ${c.red(sym.err)} ${m} is cited but missing from the store`);
  out(lines.join("\n"));
}

export function cmdQuote(ctx: Ctx, id: string, opts: { json?: boolean }): void {
  const store = openStore(ctx);
  const q = store.quote(id);
  if (!q) throw new UserError(`No quote ${id}`);
  const ev = quoteEvidence(store, q, ctx.config, 400);
  if (opts.json) return out(JSON.stringify(ev, null, 2));
  out(
    [
      header(`${ev.id} · ${ev.kind} · ${ev.segment ?? "no segment"} · ${ev.age}`),
      `  ${c.dim("source")}   ${ev.source.kind} "${ev.source.title}" ${c.dim(`(${ev.source.url ?? ev.source.origin}, line ${ev.source.line})`)}`,
      `  ${c.dim("customer")} ${ev.customer}`,
      `  ${c.dim("status")}   ${ev.verified ? c.green(`${sym.ok} verified word for word`) : c.red(`${sym.err} ${ev.problem}`)}\n`,
      c.dim(wrap(ev.context.before, 88, "  ")),
      c.bold(c.green(wrap(ev.text, 88, "  "))),
      c.dim(wrap(ev.context.after, 88, "  ")),
    ].join("\n"),
  );
}

export function cmdSearch(ctx: Ctx, query: string, opts: { limit?: number; json?: boolean }): void {
  const store = openStore(ctx);
  const hits = searchQuotes(store, query, opts.limit ?? 15);
  if (opts.json) return out(JSON.stringify(hits.map((h) => ({ score: h.score, ...h.quote })), null, 2));
  if (!hits.length) return out(`No customer evidence matches "${query}". If you build it anyway, mark it bet:`);
  for (const { quote: q } of hits) {
    out(`${c.bold(q.id)} ${(KIND_COLOR[q.kind] ?? c.dim)(q.kind.padEnd(8))} ${c.dim(q.segment ?? "")}\n${c.italic(wrap(`“${q.text}”`, 88, "  "))}\n`);
  }
}

export function cmdOpportunities(ctx: Ctx, opts: { limit?: number; json?: boolean }): void {
  const store = openStore(ctx);
  const opps = store.opportunities.slice(0, opts.limit ?? 15);
  if (opts.json) return out(JSON.stringify(opps, null, 2));
  out(renderRoadmap(store, ctx.config, opps.length));
}

export function renderRoadmap(store: Store, config: ReceiptsConfig, limit = 10): string {
  const now = asOf(config);
  const opps = store.opportunities.slice(0, limit);
  const max = Math.max(1, ...opps.map((o) => o.score));
  const lines = [header(`${config.project}: what customers actually want`)];
  opps.forEach((o, i) => {
    lines.push(
      `  ${c.dim(String(i + 1).padStart(2))}  ${bar(o.score, max, 14)} ${c.bold(String(o.score).padStart(5))}  ${truncate(o.title, 70)}`,
    );
    lines.push(c.dim(`                          ${o.id} · ${o.theme} · ${evidenceComment(o, now)}`));
  });
  if (!opps.length) lines.push(c.dim("  No opportunities yet: need at least two customers saying a similar thing."));
  return lines.join("\n");
}

export function cmdSources(ctx: Ctx, opts: { json?: boolean }): void {
  const store = openStore(ctx);
  if (opts.json) return out(JSON.stringify(store.sources.map(({ text: _t, ...s }) => s), null, 2));
  const byKind: Record<string, Source[]> = {};
  for (const s of store.sources) (byKind[s.kind] ??= []).push(s);
  const quotesBySource = new Map<string, number>();
  for (const q of store.quotes) quotesBySource.set(q.sourceId, (quotesBySource.get(q.sourceId) ?? 0) + 1);
  for (const [kind, list] of Object.entries(byKind)) {
    out(header(`${kind} (${list.length})`));
    for (const s of list.slice(0, 50)) {
      out(`  ${c.dim(s.id)}  ${truncate(s.title, 56).padEnd(56)}  ${c.dim(`${quotesBySource.get(s.id) ?? 0} quotes · ${s.redactions} redactions${s.segment ? ` · ${s.segment}` : ""}`)}`);
    }
    if (list.length > 50) out(c.dim(`  …and ${list.length - 50} more (use --json)`));
  }
}

export function cmdVerify(ctx: Ctx): boolean {
  const store = openStore(ctx);
  let bad = 0;
  for (const q of store.quotes) {
    const st = quoteStatus(store, q);
    if (!st.ok) {
      bad++;
      out(`${c.red(sym.err)} ${q.id}: ${st.reason}`);
    }
  }
  out(`${bad ? c.red(sym.err) : c.green(sym.ok)} ${store.quotes.length - bad}/${store.quotes.length} quotes verified word for word against ${plural(store.sources.length, "source")}`);
  return bad === 0;
}

/* ---------------- view / export ---------------- */

export function cmdView(ctx: Ctx, opts: { out?: string; open?: boolean; spec?: string; repo?: string }): string {
  const store = openStore(ctx);
  const specPath = resolve(ctx.cwd, opts.spec ?? "spec.md");
  let extra = {};
  if (existsSync(specPath)) {
    const spec = parseSpec(readFileSync(specPath, "utf8"), relative(ctx.cwd, specPath));
    extra = { spec, check: checkSpec(spec, store, ctx.config) };
  }
  const html = renderView(buildViewData(store, ctx.config, { ...extra, ...(opts.repo ? { links: { repo: opts.repo } } : {}) }));
  const file = resolve(ctx.cwd, opts.out ?? join(relative(ctx.cwd, ctx.storeDir), "view", "index.html"));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  log(`${c.green(sym.ok)} evidence map: ${relative(ctx.cwd, file)}`);
  if (opts.open) openInBrowser(file);
  return file;
}

export function openInBrowser(file: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", file] : [file];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => undefined).unref();
  } catch {
    /* best effort */
  }
}

export function cmdExport(ctx: Ctx, format: ExportFormat, opts: { spec?: string; out?: string; feature?: string }): void {
  const store = openStore(ctx);
  const specPath = resolve(ctx.cwd, opts.spec ?? "spec.md");
  if (!existsSync(specPath)) throw new UserError(`Spec not found: ${relative(ctx.cwd, specPath)}`);
  const spec = parseSpec(readFileSync(specPath, "utf8"), relative(ctx.cwd, specPath));
  const write = (defaultPath: string, content: string) => {
    if (opts.out === "-") return out(content);
    const file = resolve(ctx.cwd, opts.out ?? defaultPath);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    log(`${c.green(sym.ok)} wrote ${relative(ctx.cwd, file)}`);
  };
  if (format === "speckit") {
    const feature = opts.feature ?? spec.title?.replace(/:.*$/, "") ?? ctx.config.project;
    const slug = feature.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "feature";
    write(join("specs", `001-${slug}`, "spec.md"), toSpecKit(spec, store, ctx.config, feature));
  } else if (format === "linear") {
    write("receipts-linear.csv", toLinearCsv(spec, store, ctx.config));
    log(c.dim("  Import in Linear: Settings → Import / Export → CSV."));
  } else if (format === "github") {
    const dir = resolve(ctx.cwd, opts.out ?? "receipts-issues");
    const files = writeGithubIssues(spec, store, ctx.config, dir);
    log(`${c.green(sym.ok)} wrote ${plural(files.length, "issue")} to ${relative(ctx.cwd, dir)}/ · review, then run ${c.cyan(`bash ${relative(ctx.cwd, dir)}/create-issues.sh`)}`);
  } else if (format === "json") {
    write("receipts-evidence.json", toJson(spec, store, ctx.config));
  } else {
    throw new UserError(`Unknown export format "${format}". Use speckit, linear, github or json.`);
  }
}

/* ---------------- run / github / demo ---------------- */

export async function cmdRun(
  ctx: Ctx,
  paths: string[],
  opts: IngestOptions & { extractor?: string; out?: string; top?: number; force?: boolean; open?: boolean; fresh?: boolean },
): Promise<void> {
  if (paths.length) cmdIngest(ctx, paths, opts);
  await cmdExtract(ctx, { ...(opts.extractor ? { extractor: opts.extractor } : {}), ...(opts.fresh ? { fresh: true } : {}) });
  const store = await cmdSynthesize(ctx, { ...(opts.extractor ? { extractor: opts.extractor } : {}) });
  const specFile = resolve(ctx.cwd, opts.out ?? "spec.md");
  const force = opts.force ?? !existsSync(specFile);
  if (existsSync(specFile) && !force) {
    log(`${c.yellow(sym.warn)} ${relative(ctx.cwd, specFile)} exists, not overwriting. Wrote ${c.cyan("spec.draft.md")} instead.`);
    cmdSpec(ctx, { out: "spec.draft.md", force: true, ...(opts.top ? { top: opts.top } : {}) });
  } else {
    cmdSpec(ctx, { out: specFile, force: true, ...(opts.top ? { top: opts.top } : {}) });
  }
  cmdView(ctx, { ...(opts.open ? { open: true } : {}), spec: existsSync(specFile) ? specFile : "spec.draft.md" });
  out(renderRoadmap(store, ctx.config, 8));
  out(`\n  Next: edit ${c.cyan(relative(ctx.cwd, specFile))}, then ${c.cyan("receipts check")} · ${c.cyan("receipts why R1")} · ${c.cyan("receipts view --open")}\n`);
}

export async function cmdGithub(
  ctx: Ctx,
  repo: string,
  opts: { limit?: number; state?: "open" | "closed" | "all"; label?: string[]; out?: string; open?: boolean; extractor?: string; fromFile?: string },
): Promise<void> {
  const name = repo.split("/")[1] ?? repo;
  const dir = resolve(ctx.cwd, opts.out ?? `receipts-${name}`);
  mkdirSync(dir, { recursive: true });
  const sub: Ctx = {
    ...ctx,
    cwd: dir,
    storeDir: join(dir, ".receipts"),
    config: {
      ...ctx.config,
      project: repo,
      // Issues filed by maintainers are often internal tasks; users count most.
      segments: { weights: { user: 1, contributor: 1, maintainer: 0.5, ...ctx.config.segments.weights }, default: ctx.config.segments.default },
      // Issues stay open for years; flag evidence only after two years without activity.
      check: { ...ctx.config.check, staleAfterDays: Math.max(ctx.config.check.staleAfterDays, 730) },
    },
  };
  // Write a config so later commands in this folder (check, why, view) behave the same.
  const cfgFile = join(dir, "receipts.config.json");
  if (!existsSync(cfgFile)) {
    writeFileSync(
      cfgFile,
      `${JSON.stringify({ project: repo, segments: sub.config.segments, check: { staleAfterDays: sub.config.check.staleAfterDays } }, null, 2)}\n`,
    );
  }
  let issues: GitHubIssue[];
  if (opts.fromFile) {
    const raw = JSON.parse(readFileSync(resolve(ctx.cwd, opts.fromFile), "utf8")) as GitHubIssue[] | { items: GitHubIssue[] };
    issues = Array.isArray(raw) ? raw : raw.items;
  } else {
    const spin = spinner(`Fetching the most-upvoted issues from ${repo}`);
    try {
      issues = await fetchIssues(repo, {
        limit: opts.limit ?? 300,
        state: opts.state ?? "open",
        ...(opts.label ? { labels: opts.label } : {}),
        onProgress: (n) => spin.update(`Fetching issues from ${repo}: ${n}`),
      });
    } finally {
      spin.stop();
    }
  }
  if (!issues.length) throw new UserError(`No issues found for ${repo}.`);
  const store = openStore(sub, false);
  const ictx = ingestContext(sub, {});
  const sources = issues.filter((i) => !i.pull_request).map((i) => issueToSource(i, ictx, repo));
  store.upsertSources(sources);
  store.save();
  log(`${c.green(sym.ok)} ${plural(sources.length, "issue")} from ${repo} · ${sources.reduce((a, s) => a + s.redactions, 0)} redactions`);
  await cmdExtract(sub, { ...(opts.extractor ? { extractor: opts.extractor } : {}) });
  const synthesized = await cmdSynthesize(sub, { ...(opts.extractor ? { extractor: opts.extractor } : {}) });
  cmdSpec(sub, { out: join(dir, "spec.md"), force: true });
  cmdView(sub, { out: join(dir, "evidence.html"), spec: join(dir, "spec.md"), repo, ...(opts.open ? { open: true } : {}) });
  out(renderRoadmap(synthesized, sub.config, 10));
  out(`\n  ${c.dim("Everything is in")} ${c.cyan(relative(ctx.cwd, dir) + "/")}${c.dim(": spec.md, evidence.html, .receipts/")}\n`);
}

export function packageRoot(): string {
  // dist/commands.js or src/commands.ts → package root
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

export async function cmdDemo(opts: { keep?: boolean; open?: boolean; extractor?: string }): Promise<void> {
  const example = join(packageRoot(), "examples", "tempo");
  if (!existsSync(example)) throw new UserError("Bundled demo data not found.");
  const dir = mkdtempSync(join(tmpdir(), "receipts-demo-"));
  cpSync(join(example, "feedback"), join(dir, "feedback"), { recursive: true });
  cpSync(join(example, "receipts.config.mjs"), join(dir, "receipts.config.mjs"));
  log(c.dim(`Demo: Tempo, a fictional subscription app. Working in ${dir}\n`));
  const ctx = await context({ cwd: dir });
  await cmdRun(ctx, ["feedback"], { extractor: opts.extractor ?? "heuristic", ...(opts.open ? { open: true } : {}) });
  // Show the check working on a hand-edited spec with typical mistakes.
  const edited = readFileSync(join(example, "spec.md"), "utf8");
  writeFileSync(join(dir, "spec.reviewed.md"), edited);
  out(c.bold(`\n$ receipts check spec.reviewed.md`));
  out(c.dim("  (a PM's edited version of the spec, with some typical problems)\n"));
  cmdCheck(ctx, "spec.reviewed.md", { format: "pretty" });
  out(`\n  ${c.dim("Try:")} cd ${dir} && npx @hashimua/receipts why R1\n`);
}
