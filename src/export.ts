/**
 * Hand-off to where work happens. Exports read the PM's edited spec (not the
 * raw opportunities), so whatever was decided in review is what gets built.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { asOf, type ReceiptsConfig } from "./config.js";
import { requirementEvidence } from "./evidence.js";
import { toCsv } from "./ingest/csv.js";
import type { Store } from "./store.js";
import type { ParsedSpec, Requirement } from "./types.js";
import { pad, plural, slugify } from "./util.js";

export type ExportFormat = "speckit" | "linear" | "github" | "json";

function evidenceBlock(store: Store, req: Requirement, config: ReceiptsConfig, max = 5): string[] {
  const ev = requirementEvidence(store, req, config);
  const lines: string[] = [];
  if (req.bet) lines.push(`**Bet (no customer evidence yet):** ${req.bet.reason}`, "");
  if (ev.quotes.length) {
    const segs = Object.entries(ev.segments).map(([s, n]) => `${s} ${n}`).join(", ");
    lines.push(`**Evidence:** ${plural(ev.customers, "customer")}${segs ? ` (${segs})` : ""}, ${plural(ev.quotes.length, "verified quote")}.`, "");
    for (const q of ev.quotes.slice(0, max)) {
      lines.push(`> "${q.text.replace(/\s+/g, " ")}" — ${q.id}, ${q.source.kind}${q.segment ? `, ${q.segment}` : ""}, ${q.age}`);
    }
    if (ev.quotes.length > max) lines.push(`> …and ${ev.quotes.length - max} more (\`receipts why ${req.id}\`)`);
    lines.push("");
  }
  return lines;
}

/** GitHub Spec Kit `spec.md` layout, with evidence carried into every section. */
export function toSpecKit(spec: ParsedSpec, store: Store, config: ReceiptsConfig, feature?: string): string {
  const today = asOf(config).toISOString().slice(0, 10);
  const name = feature ?? spec.title?.replace(/:.*$/, "") ?? config.project;
  const out: string[] = [
    `# Feature Specification: ${name}`,
    "",
    `**Feature Branch**: \`${slugify(name)}\``,
    `**Created**: ${today}`,
    "**Status**: Draft",
    `**Input**: Evidence-backed spec \`${spec.path}\`, exported by Receipts. Every requirement traces to verified customer quotes (IDs like Q-0142). Ask \`receipts why <R-id>\` or the Receipts MCP server for the full evidence.`,
    "",
    "## User Scenarios & Testing *(mandatory)*",
    "",
  ];
  spec.requirements.forEach((r, i) => {
    const priority = i < 3 ? "P1" : i < 7 ? "P2" : "P3";
    out.push(`### User Story ${i + 1} - ${r.title} (Priority: ${priority})`, "");
    out.push(...evidenceBlock(store, r, config));
    out.push(`**Why this priority**: Ranked #${i + 1} in the evidence-backed spec${r.because.length ? ` (cites ${r.because.length} quotes)` : " (deliberate bet)"}.`, "");
    out.push(`**Independent Test**: ${r.metric ? `Success is measured by: ${r.metric.text}.` : "[NEEDS CLARIFICATION: no success metric in the source spec]"}`, "");
    out.push("**Acceptance Scenarios**:", "", "1. [NEEDS CLARIFICATION: write Given/When/Then from the evidence above]", "");
  });
  out.push("## Requirements *(mandatory)*", "", "### Functional Requirements", "");
  spec.requirements.forEach((r, i) => {
    const refs = r.because.length ? ` [Evidence: ${r.because.map((c) => c.id).join(", ")}]` : r.bet ? " [Bet: unvalidated]" : " [NEEDS CLARIFICATION: no evidence]";
    out.push(`- **FR-${pad(i + 1, 3)}** (${r.id}): ${r.title}.${refs}`);
  });
  out.push("", "## Success Criteria *(mandatory)*", "", "### Measurable Outcomes", "");
  const metrics = spec.requirements.filter((r) => r.metric);
  if (!metrics.length) out.push("- **SC-001**: [NEEDS CLARIFICATION: add `metric:` lines to the source spec]");
  metrics.forEach((r, i) => out.push(`- **SC-${pad(i + 1, 3)}** (${r.id}): ${r.metric!.text}`));
  const bets = spec.requirements.filter((r) => r.bet);
  if (bets.length) {
    out.push("", "## Assumptions", "");
    for (const r of bets) out.push(`- ${r.id} is a bet, not yet backed by customer evidence: ${r.bet!.reason}`);
  }
  out.push("");
  return out.join("\n");
}

export function toLinearCsv(spec: ParsedSpec, store: Store, config: ReceiptsConfig): string {
  const rows: (string | number)[][] = [["Title", "Description", "Priority", "Labels"]];
  spec.requirements.forEach((r, i) => {
    const description = [
      ...(r.metric ? [`**Metric:** ${r.metric.text}`, ""] : []),
      ...evidenceBlock(store, r, config, 4),
      `_Exported from ${spec.path} by Receipts. ${r.id}._`,
    ].join("\n");
    // Linear priorities: 1 urgent, 2 high, 3 medium, 4 low.
    rows.push([`${r.id}: ${r.title}`, description, i < 3 ? 2 : i < 7 ? 3 : 4, r.bet ? "receipts,bet" : "receipts,evidence-backed"]);
  });
  return `${toCsv(rows)}\n`;
}

export function writeGithubIssues(spec: ParsedSpec, store: Store, config: ReceiptsConfig, dir: string): string[] {
  mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  const script = ["#!/usr/bin/env bash", "# Creates one GitHub issue per requirement. Review the .md files first.", "set -euo pipefail", ""];
  for (const r of spec.requirements) {
    const file = `${r.id}-${slugify(r.title, 40)}.md`;
    const body = [
      ...(r.metric ? [`**Success metric:** ${r.metric.text}`, ""] : []),
      ...evidenceBlock(store, r, config, 6),
      "---",
      `_Requirement ${r.id} in \`${spec.path}\`. Evidence verified by [Receipts](https://github.com/akhsterminator/receipts)._`,
    ].join("\n");
    writeFileSync(join(dir, file), `${body}\n`);
    files.push(file);
    const title = `${r.id}: ${r.title}`.replace(/'/g, "'\\''");
    script.push(`gh issue create --title '${title}' --body-file '${file}' --label '${r.bet ? "bet" : "evidence-backed"}'`);
  }
  writeFileSync(join(dir, "create-issues.sh"), `${script.join("\n")}\n`, { mode: 0o755 });
  return files;
}

export function toJson(spec: ParsedSpec, store: Store, config: ReceiptsConfig): string {
  return JSON.stringify(
    {
      spec: spec.path,
      title: spec.title,
      requirements: spec.requirements.map((r) => requirementEvidence(store, r, config)),
    },
    null,
    2,
  );
}
