import { Argument, Command, Option } from "commander";
import {
  cmdCheck,
  cmdDemo,
  cmdExport,
  cmdExtract,
  cmdGithub,
  cmdIngest,
  cmdInit,
  cmdOpportunities,
  cmdQuote,
  cmdRun,
  cmdSearch,
  cmdSources,
  cmdSpec,
  cmdSynthesize,
  cmdVerify,
  cmdView,
  cmdWhy,
  context,
  UserError,
  type GlobalOptions,
} from "./commands.js";
import type { ExportFormat } from "./export.js";
import { LLMError } from "./llm.js";
import type { SourceKind } from "./types.js";
import { c, setQuiet, sym } from "./ui.js";
import { VERSION } from "./version.js";

// Piping into `head` closes stdout early; that's not an error.
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});

const program = new Command();

program
  .name("receipts")
  .description("Evidence-backed product specs. No requirement without a receipt.")
  .version(VERSION, "-v, --version")
  .option("-c, --config <file>", "config file (default: receipts.config.{ts,mjs,js,json})")
  .option("-s, --store <dir>", "evidence store directory (default: .receipts)")
  .option("--as-of <date>", "treat this date as today (reproducible runs)")
  .option("-q, --quiet", "only print results")
  .hook("preAction", (cmd) => {
    if (cmd.opts().quiet) setQuiet(true);
  })
  .showHelpAfterError()
  .addHelpText(
    "after",
    `
Quick start:
  $ npx @hashimua/receipts demo                       try it on sample data, no setup
  $ npx @hashimua/receipts github excalidraw/excalidraw  a cited roadmap from any public repo
  $ npx @hashimua/receipts run feedback/              your own transcripts, tickets, reviews
  $ npx @hashimua/receipts check spec.md              verify a spec before an agent builds it

Docs: https://github.com/akhsterminator/receipts`,
  );

const g = (): GlobalOptions => program.opts<GlobalOptions>();
const ctx = () => context(g());

const ingestOptions = (cmd: Command) =>
  cmd
    .addOption(new Option("--kind <kind>", "force the source kind for tabular rows").choices(["interview", "ticket", "review", "issue", "survey", "note"]))
    .option("--segment <segment>", "assign every source in this batch to a segment")
    .option("--text-col <names>", "CSV/JSON column(s) holding the feedback text, comma-separated")
    .option("--customer-col <name>", "column identifying the customer (hashed, never stored)")
    .option("--segment-col <name>", "column holding the customer segment or plan")
    .option("--date-col <name>", "column holding the date")
    .option("--no-redact", "skip PII redaction (not recommended)");

program
  .command("init")
  .description("create receipts.config.ts and a feedback/ folder")
  .option("--project <name>", "product name")
  .option("--ci", "also add a GitHub Actions workflow that checks spec.md on every PR")
  .option("-f, --force", "overwrite an existing config")
  .action(async (opts) => cmdInit(await ctx(), opts));

ingestOptions(
  program
    .command("run")
    .description("ingest → extract → cluster → write spec.md → evidence map, in one go")
    .argument("[paths...]", "files or folders of feedback (omit to re-run on the existing store)")
    .addOption(new Option("-e, --extractor <engine>", "quote extractor").choices(["auto", "claude", "ollama", "heuristic"]))
    .option("-o, --out <file>", "spec path", "spec.md")
    .option("--top <n>", "number of requirements in the spec", (v) => parseInt(v, 10))
    .option("-f, --force", "overwrite an existing spec")
    .option("--fresh", "re-extract every source, ignoring cached quotes")
    .option("--open", "open the evidence map in a browser"),
).action(async (paths: string[], opts) => cmdRun(await ctx(), paths, { ...opts, kind: opts.kind as SourceKind | undefined }));

program
  .command("github")
  .description("build a cited roadmap from a public GitHub repo's issues")
  .argument("<owner/repo>", "e.g. excalidraw/excalidraw")
  .option("-n, --limit <n>", "issues to analyse (most-upvoted first, max 1000)", (v) => parseInt(v, 10), 300)
  .addOption(new Option("--state <state>", "issue state").choices(["open", "closed", "all"]).default("open"))
  .option("-l, --label <label...>", "only issues with these labels")
  .option("-o, --out <dir>", "output directory (default: receipts-<repo>)")
  .option("--from-file <json>", "use a saved issues JSON (REST or search API format) instead of fetching")
  .addOption(new Option("-e, --extractor <engine>", "quote extractor").choices(["auto", "claude", "ollama", "heuristic"]))
  .option("--open", "open the evidence map in a browser")
  .action(async (repo: string, opts) => cmdGithub(await ctx(), repo, opts));

ingestOptions(
  program
    .command("ingest")
    .description("add feedback to the evidence store (PII is removed first)")
    .argument("<paths...>", "files or folders: .csv .json .jsonl .txt .md .vtt .srt .docx"),
).action(async (paths: string[], opts) => {
  cmdIngest(await ctx(), paths, { ...opts, kind: opts.kind as SourceKind | undefined });
});

program
  .command("extract")
  .description("mine verified quotes from ingested sources")
  .addOption(new Option("-e, --extractor <engine>", "quote extractor").choices(["auto", "claude", "ollama", "heuristic"]))
  .option("--fresh", "re-extract every source")
  .option("--concurrency <n>", "parallel model requests", (v) => parseInt(v, 10))
  .action(async (opts) => {
    await cmdExtract(await ctx(), opts);
  });

program
  .command("synthesize")
  .alias("cluster")
  .description("group quotes into scored opportunities")
  .addOption(new Option("-e, --extractor <engine>", "engine for clustering").choices(["auto", "claude", "ollama", "heuristic"]))
  .action(async (opts) => {
    await cmdSynthesize(await ctx(), opts);
  });

program
  .command("spec")
  .description("write a cited spec from the top opportunities")
  .option("-o, --out <file>", "output path", "spec.md")
  .option("--top <n>", "number of requirements", (v) => parseInt(v, 10))
  .option("-f, --force", "overwrite an existing file")
  .option("--stdout", "print instead of writing a file")
  .action(async (opts) => {
    cmdSpec(await ctx(), opts);
  });

program
  .command("check")
  .description("verify every requirement in a spec cites real, verified customer evidence")
  .argument("[spec]", "spec file", "spec.md")
  .addOption(new Option("-f, --format <format>", "output format (github is the default inside GitHub Actions)").choices(["pretty", "json", "github", "markdown"]))
  .option("--strict", "fail on warnings too")
  .option("--verbose", "include info-level findings")
  .option("--summary <file>", "append a Markdown summary to this file (defaults to $GITHUB_STEP_SUMMARY in Actions)")
  .action(async (spec: string, opts) => {
    const result = cmdCheck(await ctx(), spec, opts);
    process.exitCode = result.ok ? 0 : 1;
  });

program
  .command("why")
  .description("show the customer evidence behind a requirement")
  .argument("<requirement>", "e.g. R3")
  .option("--spec <file>", "spec file", "spec.md")
  .option("--json", "machine-readable output")
  .action(async (id: string, opts) => cmdWhy(await ctx(), id, opts));

program
  .command("quote")
  .description("show one quote in the context of its source")
  .argument("<id>", "e.g. Q-0142")
  .option("--json", "machine-readable output")
  .action(async (id: string, opts) => cmdQuote(await ctx(), id, opts));

program
  .command("search")
  .description("search everything customers said")
  .argument("<query...>")
  .option("-n, --limit <n>", "max results", (v) => parseInt(v, 10))
  .option("--json", "machine-readable output")
  .action(async (query: string[], opts) => cmdSearch(await ctx(), query.join(" "), opts));

program
  .command("opportunities")
  .alias("opps")
  .description("list ranked opportunities with their evidence")
  .option("-n, --limit <n>", "how many", (v) => parseInt(v, 10))
  .option("--json", "machine-readable output")
  .action(async (opts) => cmdOpportunities(await ctx(), opts));

program
  .command("sources")
  .description("list ingested sources and how much personal data was removed")
  .option("--json", "machine-readable output (without source text)")
  .action(async (opts) => cmdSources(await ctx(), opts));

program
  .command("verify")
  .description("re-check every stored quote against its source")
  .action(async () => {
    process.exitCode = cmdVerify(await ctx()) ? 0 : 1;
  });

program
  .command("view")
  .description("write the interactive evidence map (a single HTML file)")
  .option("-o, --out <file>", "output path (default: .receipts/view/index.html)")
  .option("--spec <file>", "spec to link requirements from", "spec.md")
  .option("--open", "open it in a browser")
  .action(async (opts) => {
    cmdView(await ctx(), opts);
  });

program
  .command("export")
  .description("hand the spec to where work happens")
  .addArgument(new Argument("<format>", "speckit | linear | github | json").choices(["speckit", "linear", "github", "json"]))
  .option("--spec <file>", "spec file", "spec.md")
  .option("-o, --out <path>", "output file or directory (- for stdout)")
  .option("--feature <name>", "feature name for Spec Kit")
  .action(async (format: ExportFormat, opts) => cmdExport(await ctx(), format, opts));

program
  .command("mcp")
  .description("run the MCP server for Claude Code and other agents (stdio)")
  .option("--spec <file>", "default spec file", "spec.md")
  .action(async (opts: { spec?: string }) => {
    const { startMcpServer } = await import("./mcp.js");
    await startMcpServer({ ...g(), ...(opts.spec ? { spec: opts.spec } : {}) });
  });

program
  .command("demo")
  .description("run the whole pipeline on bundled sample data (Tempo, a fictional app)")
  .option("--open", "open the evidence map in a browser")
  .addOption(new Option("-e, --extractor <engine>", "quote extractor").choices(["auto", "claude", "ollama", "heuristic"]))
  .action(async (opts) => cmdDemo(opts));

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof UserError || err instanceof LLMError) {
    console.error(`${c.red(sym.err)} ${err.message}`);
  } else {
    console.error(`${c.red(sym.err)} ${(err as Error)?.stack ?? String(err)}`);
    console.error(c.dim("This looks like a bug. Please report it: https://github.com/akhsterminator/receipts/issues"));
  }
  process.exitCode = 2;
});
