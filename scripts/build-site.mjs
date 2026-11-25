// Builds site/: the landing page's live demos.
//   node scripts/build-site.mjs                      fetch excalidraw issues live (set GITHUB_TOKEN)
//   ISSUES_JSON=path node scripts/build-site.mjs     use a saved issues dump instead
// Requires `npm run build` first.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const cli = join(root, "dist", "cli.js");
const site = join(root, "site");
const run = (args, cwd) => execFileSync("node", [cli, ...args], { cwd, stdio: ["ignore", "inherit", "inherit"] });

// 1. Tempo demo (fictional data, deterministic).
const tempo = mkdtempSync(join(tmpdir(), "receipts-site-tempo-"));
cpSync(join(root, "examples", "tempo"), tempo, { recursive: true });
rmSync(join(tempo, "spec.md"));
run(["run", "feedback", "--extractor", "heuristic", "-q"], tempo);
mkdirSync(join(site, "tempo"), { recursive: true });
run(["view", "--out", join(site, "tempo", "index.html")], tempo);

// 2. A real repo.
const repo = process.env.DEMO_REPO ?? "excalidraw/excalidraw";
const slug = repo.split("/")[1];
const gh = mkdtempSync(join(tmpdir(), "receipts-site-gh-"));
const args = ["github", repo, "--out", gh, "--extractor", process.env.DEMO_EXTRACTOR ?? "heuristic", "-q"];
if (process.env.ISSUES_JSON) args.push("--from-file", process.env.ISSUES_JSON);
run(args, root);
mkdirSync(join(site, slug), { recursive: true });
cpSync(join(gh, "evidence.html"), join(site, slug, "index.html"));
cpSync(join(gh, "spec.md"), join(site, slug, "spec.md"));
console.log(`site/ updated: tempo/, ${slug}/`);
