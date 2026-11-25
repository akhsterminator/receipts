/**
 * MCP server: lets a coding agent (Claude Code, Cursor, …) ask why a
 * requirement exists while it builds, and check a spec before it starts.
 *
 *   claude mcp add receipts -- npx -y @hashimua/receipts mcp
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { findRequirement, quoteEvidence, requirementEvidence } from "./evidence.js";
import { searchQuotes } from "./search.js";
import { checkSpec } from "./spec/check.js";
import { parseSpec } from "./spec/parse.js";
import { formatMarkdown } from "./spec/report.js";
import { Store } from "./store.js";
import { plural } from "./util.js";
import { VERSION } from "./version.js";

export interface McpOptions {
  cwd?: string;
  config?: string;
  spec?: string;
  store?: string;
}

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

export async function startMcpServer(options: McpOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const { config, root } = await loadConfig(cwd, options.config);
  const storeDir = resolve(root, options.store ?? config.store);
  const defaultSpec = options.spec ?? "spec.md";
  const store = () => Store.open(storeDir);
  const spec = (path?: string) => {
    const p = resolve(cwd, path ?? defaultSpec);
    if (!existsSync(p)) throw new Error(`Spec not found: ${p}`);
    return parseSpec(readFileSync(p, "utf8"), path ?? defaultSpec);
  };

  const server = new McpServer({ name: "receipts", version: VERSION });

  server.registerTool(
    "why",
    {
      title: "Why does this requirement exist?",
      description:
        "Returns the verified customer evidence behind a requirement in the spec (e.g. R3): exact quotes, who said them (pseudonymous), segment, date and source. Use it before implementing a requirement to understand the real customer problem, and to resolve ambiguity in favour of what customers actually asked for.",
      inputSchema: {
        requirement: z.string().describe("Requirement ID, e.g. R3"),
        spec: z.string().optional().describe("Path to the spec, relative to the project root (default spec.md)"),
      },
    },
    async ({ requirement, spec: specPath }) => {
      const s = store();
      const parsed = spec(specPath);
      const req = findRequirement(parsed, requirement);
      if (!req) return text(`No requirement ${requirement} in ${parsed.path}. Known: ${parsed.requirements.map((r) => r.id).join(", ")}`);
      const ev = requirementEvidence(s, req, config);
      const lines = [`${req.id}. ${req.title}`];
      if (ev.requirement.metric) lines.push(`Metric: ${ev.requirement.metric}`);
      if (ev.requirement.bet) lines.push(`BET (no customer evidence): ${ev.requirement.bet}`);
      const segs = Object.entries(ev.segments).map(([k, v]) => `${k} ${v}`).join(", ");
      lines.push(`Evidence: ${plural(ev.customers, "customer")}${segs ? ` (${segs})` : ""}, ${plural(ev.quotes.length, "quote")}`, "");
      for (const q of ev.quotes) {
        lines.push(`${q.id} [${q.kind}, ${q.segment ?? "no segment"}, ${q.age}${q.verified ? "" : `, UNVERIFIED: ${q.problem}`}] from ${q.source.kind} "${q.source.title}"`);
        lines.push(`  "${q.text.replace(/\s+/g, " ")}"`);
      }
      if (ev.missing.length) lines.push("", `Cited but missing from the store: ${ev.missing.join(", ")}`);
      return text(lines.join("\n"));
    },
  );

  server.registerTool(
    "search_evidence",
    {
      title: "Search customer evidence",
      description:
        "Full-text search over all verified customer quotes. Use it to check whether customers asked for something before adding it, or to find evidence for an edge case.",
      inputSchema: {
        query: z.string(),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ query, limit }) => {
      const s = store();
      const hits = searchQuotes(s, query, limit ?? 10);
      if (!hits.length) return text(`No customer evidence matches "${query}". If you add this, it is a bet.`);
      return text(
        hits
          .map(({ quote: q, score }) => `${q.id} (${score.toFixed(2)}) [${q.kind}, ${q.segment ?? "-"}] "${q.text.replace(/\s+/g, " ")}"`)
          .join("\n"),
      );
    },
  );

  server.registerTool(
    "get_quote",
    {
      title: "Get a quote with context",
      description: "Returns one quote (e.g. Q-0142) with the surrounding text from its source and its verification status.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const s = store();
      const q = s.quote(id);
      if (!q) return text(`No quote ${id}`);
      const ev = quoteEvidence(s, q, config, 400);
      return text(
        [
          `${ev.id} · ${ev.kind} · intensity ${ev.intensity} · ${ev.segment ?? "no segment"} · ${ev.age} · ${ev.verified ? "verified" : `UNVERIFIED: ${ev.problem}`}`,
          `Source: ${ev.source.kind} "${ev.source.title}" (${ev.source.url ?? ev.source.origin}, line ${ev.source.line})`,
          "",
          `${ev.context.before}>>>${ev.text}<<<${ev.context.after}`,
        ].join("\n"),
      );
    },
  );

  server.registerTool(
    "list_opportunities",
    {
      title: "List ranked opportunities",
      description: "Customer opportunities (clusters of quotes) ranked by the project's scoring formula.",
      inputSchema: { limit: z.number().int().min(1).max(100).optional() },
    },
    async ({ limit }) => {
      const s = store();
      return text(
        s.opportunities
          .slice(0, limit ?? 20)
          .map((o) => `${o.id} score ${o.score} · ${o.stats.customers} customers · ${o.theme}: ${o.title}`)
          .join("\n") || "No opportunities yet. Run `receipts run <feedback files>`.",
      );
    },
  );

  server.registerTool(
    "check_spec",
    {
      title: "Check a spec's evidence",
      description: "Runs `receipts check`: every requirement must cite verified quotes or be an explicit bet. Run before starting work on a spec.",
      inputSchema: { spec: z.string().optional() },
    },
    async ({ spec: specPath }) => {
      const result = checkSpec(spec(specPath), store(), config);
      return text(formatMarkdown(result));
    },
  );

  await server.connect(new StdioServerTransport());
}
