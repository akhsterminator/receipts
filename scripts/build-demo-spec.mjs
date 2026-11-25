// Resolves {{quote text}} placeholders in examples/tempo/.template/spec.template.md
// to the quote IDs the heuristic extractor assigns, writing examples/tempo/spec.md.
// Run after `npm run build` whenever extraction changes: node scripts/build-demo-spec.mjs
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractAll, ingestPaths, loadConfig, Store } from "../dist/index.js";

const example = new URL("../examples/tempo/", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "receipts-demo-spec-"));
cpSync(example, dir, { recursive: true });
const { config } = await loadConfig(dir);
const store = new Store(join(dir, ".receipts"));
const report = ingestPaths([join(dir, "feedback")], {
  salt: "x",
  root: dir,
  redact: true,
  redactOptions: { allow: [...config.privacy.allow, ...config.project.split(/\s+/)] },
  interviewers: config.interviewers,
});
store.upsertSources(report.sources);
await extractAll(store, config);

const template = readFileSync(join(example, ".template", "spec.template.md"), "utf8");
const out = template.replace(/\{\{([^}]+)\}\}/g, (_, snippet) => {
  const hits = store.quotes.filter((q) => q.text.includes(snippet));
  if (hits.length !== 1) throw new Error(`"${snippet}" matched ${hits.length} quotes`);
  return hits[0].id;
});
writeFileSync(join(example, "spec.md"), out);
console.log("wrote examples/tempo/spec.md");
