// Appends this week's row to product/metrics.md. Run by .github/workflows/metrics.yml.
// Every source is public; anything that fails is recorded as "n/a" rather than guessed.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const repo = process.env.REPO ?? "akhsterminator/receipts";
const pkg = "@hashimua/receipts";
const token = process.env.GITHUB_TOKEN;
const gh = { accept: "application/vnd.github+json", "user-agent": "receipts-metrics", ...(token ? { authorization: `Bearer ${token}` } : {}) };

async function json(url, headers = {}) {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return undefined;
    return await res.json();
  } catch {
    return undefined;
  }
}

const stars = (await json(`https://api.github.com/repos/${repo}`, gh))?.stargazers_count ?? "n/a";
const installs = (await json(`https://api.npmjs.org/downloads/point/last-week/${pkg}`))?.downloads ?? "n/a";
// Code search needs an authenticated token and only sees indexed public repos: a lower bound.
const actionUsers = (await json(`https://api.github.com/search/code?q=${encodeURIComponent(`"uses: ${repo}" path:.github/workflows`)}`, gh))?.total_count ?? "n/a";
const activation = (await json(`https://api.github.com/search/code?q=${encodeURIComponent("filename:quotes.json path:.receipts")}`, gh))?.total_count ?? "n/a";

let health = "n/a";
try {
  const out = execFileSync("node", ["dist/cli.js", "check", "product/spec.md", "--store", "product/.receipts", "--format", "json"], { encoding: "utf8" });
  const r = JSON.parse(out);
  health = `${r.summary.cited}/${r.summary.requirements} cited`;
} catch (err) {
  try {
    const r = JSON.parse(err.stdout);
    health = `${r.summary.cited}/${r.summary.requirements} cited (check failing)`;
  } catch {
    /* leave n/a */
  }
}

const monday = new Date();
monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
const week = monday.toISOString().slice(0, 10);
const row = `| ${week} | ${stars} | ${installs} | ${actionUsers} | ${activation} | ${health} | |`;

const file = new URL("../product/metrics.md", import.meta.url);
const md = readFileSync(file, "utf8");
if (md.includes(`| ${week} |`)) {
  console.log(`Row for ${week} already exists`);
} else {
  writeFileSync(file, md.replace("<!-- metrics:table:end -->", `${row}\n<!-- metrics:table:end -->`));
  console.log(row);
}
