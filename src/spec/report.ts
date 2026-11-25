/** Output formats for `receipts check`: pretty terminal, JSON, GitHub annotations, Markdown. */
import type { CheckResult, Finding } from "../types.js";
import { plural } from "../util.js";
import { c, sym } from "../ui.js";

const COLLAPSE_LABEL: Record<string, string> = {
  "no-metric": "have no metric",
  "loudest-voice": "rest on a single customer",
  "no-evidence": "have no evidence (add because: or bet:)",
};

function icon(f: Finding): string {
  if (f.severity === "error") return c.red(sym.err);
  if (f.severity === "warning") return c.yellow(sym.warn);
  return c.blue(sym.info);
}

export function summaryLine(r: CheckResult): string {
  const s = r.summary;
  const parts = [
    `${s.cited}/${s.requirements} requirements cited`,
    `${s.verifiedQuotes} verified quotes`,
    `${s.unverifiedQuotes} unverified`,
  ];
  if (s.bets) parts.push(plural(s.bets, "bet"));
  return parts.join(` ${sym.dot} `);
}

export function formatPretty(r: CheckResult, opts: { verbose?: boolean } = {}): string {
  const lines: string[] = [];
  let shown = r.findings.filter((f) => opts.verbose || f.severity !== "info");
  // Collapse noisy repeats ("R1 has no metric", "R2 has no metric", …) into one line.
  if (!opts.verbose) {
    const byRule = new Map<string, Finding[]>();
    for (const f of shown) byRule.set(f.rule, [...(byRule.get(f.rule) ?? []), f]);
    const collapsed = new Set<string>();
    shown = shown.flatMap((f) => {
      const group = byRule.get(f.rule)!;
      if (group.length < 4 || !f.requirement) return [f];
      if (collapsed.has(f.rule)) return [];
      collapsed.add(f.rule);
      const reqs = [...new Set(group.map((g) => g.requirement).filter(Boolean))];
      if (f.rule === "stale-quote") {
        const quotes = [...new Set(group.map((g) => g.quote).filter(Boolean))];
        return [{ ...f, message: `${quotes.length} cited quotes are older than the stale threshold (in ${reqs.join(", ")})`, line: undefined } as Finding];
      }
      const label = COLLAPSE_LABEL[f.rule] ?? f.rule;
      return [{ ...f, message: `${reqs.length} requirements ${label}: ${reqs.join(", ")}`, line: undefined } as Finding];
    });
  }
  const width = Math.min(64, Math.max(30, ...shown.map((f) => f.message.length)));
  for (const f of shown) {
    const where = f.line ? c.dim(`${r.spec}:${f.line}`) : "";
    lines.push(`${icon(f)} ${f.message.padEnd(width)}  ${where}`.trimEnd());
  }
  const errors = r.findings.filter((f) => f.severity === "error").length;
  const warnings = r.findings.filter((f) => f.severity === "warning").length;
  const mark = errors ? c.red(sym.err) : warnings ? c.yellow(sym.ok) : c.green(sym.ok);
  lines.push(`${mark} ${summaryLine(r)}`);
  if (errors || warnings) {
    lines.push(c.dim(`  ${plural(errors, "error")}, ${plural(warnings, "warning")}${r.ok ? "" : " — check failed"}`));
  }
  return lines.join("\n");
}

/** GitHub Actions workflow commands: inline annotations on the PR diff. */
export function formatGithub(r: CheckResult): string {
  const esc = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  const lines = r.findings.map((f) => {
    const level = f.severity === "error" ? "error" : f.severity === "warning" ? "warning" : "notice";
    const loc = `file=${r.spec}${f.line ? `,line=${f.line}` : ""}`;
    return `::${level} ${loc},title=receipts ${f.rule}::${esc(f.message)}`;
  });
  lines.push(summaryLine(r));
  return lines.join("\n");
}

/** Markdown for $GITHUB_STEP_SUMMARY or a PR comment. */
export function formatMarkdown(r: CheckResult): string {
  const errors = r.findings.filter((f) => f.severity === "error");
  const warnings = r.findings.filter((f) => f.severity === "warning");
  const status = errors.length ? "❌ Evidence check failed" : warnings.length ? "⚠️ Evidence check passed with warnings" : "✅ Evidence check passed";
  const s = r.summary;
  const out = [
    `### ${status}`,
    "",
    `\`${r.spec}\` · **${s.cited}/${s.requirements}** requirements cited · **${s.verifiedQuotes}** verified quotes · **${s.unverifiedQuotes}** unverified${s.bets ? ` · **${s.bets}** ${s.bets === 1 ? "bet" : "bets"}` : ""}`,
    "",
  ];
  if (errors.length || warnings.length) {
    out.push("| | Finding | Line |", "|---|---|---|");
    for (const f of [...errors, ...warnings]) {
      out.push(`| ${f.severity === "error" ? "❌" : "⚠️"} | ${f.message.replace(/\|/g, "\\|")} | ${f.line ?? ""} |`);
    }
    out.push("");
  }
  out.push("<sub>Checked by [Receipts](https://github.com/akhsterminator/receipts): no requirement without a receipt.</sub>");
  return out.join("\n");
}

export function formatJson(r: CheckResult): string {
  return JSON.stringify(r, null, 2);
}
