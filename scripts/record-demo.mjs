// Records docs/assets/demo.gif from real CLI runs (no mock output).
//   npm run build && ISSUES_JSON=excalidraw.json node scripts/record-demo.mjs
// Without ISSUES_JSON it fetches excalidraw/excalidraw issues live.
// Uses Playwright (Chromium) to render terminal frames and gifenc to encode.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import gifenc from "gifenc";
import pngjs from "pngjs";
const { GIFEncoder, quantize, applyPalette } = gifenc;
const { PNG } = pngjs;

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = new URL("..", import.meta.url).pathname;
const cli = join(root, "dist", "cli.js");
const env = { ...process.env, FORCE_COLOR: "1" };
const sh = (args, cwd) => {
  try {
    return execFileSync("node", [cli, ...args], { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    return `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }
};
const shAll = (args, cwd) => {
  // stderr carries progress lines; merge both streams in order of appearance (stderr first is fine here).
  const res = require("node:child_process").spawnSync("node", [cli, ...args], { cwd, env, encoding: "utf8" });
  return `${res.stderr}${res.stdout}`;
};

// --- 1. Capture real output ---
const work = mkdtempSync(join(tmpdir(), "receipts-rec-"));
const ghArgs = ["github", "excalidraw/excalidraw", "--out", "receipts-excalidraw"];
if (process.env.ISSUES_JSON) ghArgs.push("--from-file", resolve(process.env.ISSUES_JSON));
const ghOut = shAll(ghArgs, work);
const whyOut = sh(["why", "R2"], join(work, "receipts-excalidraw"));
const tempo = join(work, "tempo");
cpSync(join(root, "examples", "tempo"), tempo, { recursive: true });
cpSync(join(tempo, "spec.md"), join(tempo, "spec.reviewed.md"));
rmSync(join(tempo, "spec.md"));
sh(["run", "feedback", "--extractor", "heuristic", "-q"], tempo);
const checkOut = sh(["check", "spec.reviewed.md"], tempo).replace(/spec\.reviewed\.md/g, "spec.md");

// --- 2. ANSI → HTML ---
const COLORS = { 31: "#fb7185", 32: "#34d399", 33: "#fbbf24", 34: "#60a5fa", 35: "#c4b5fd", 36: "#22d3ee", 90: "#6b7f76" };
function ansiToHtml(text) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let out = "";
  let state = { color: null, bold: false, dim: false, italic: false };
  const open = () => {
    const st = [];
    if (state.color) st.push(`color:${state.color}`);
    if (state.bold) st.push("font-weight:700;color:#f3f7f4");
    if (state.dim) st.push("opacity:.6");
    if (state.italic) st.push("font-style:italic");
    return st.length ? `<span style="${st.join(";")}">` : "<span>";
  };
  for (const part of text.split(/(\x1b\[[0-9;]*m)/)) {
    const m = /^\x1b\[([0-9;]*)m$/.exec(part);
    if (!m) {
      out += open() + esc(part) + "</span>";
      continue;
    }
    for (const code of m[1].split(";").map(Number)) {
      if (code === 0) state = { color: null, bold: false, dim: false, italic: false };
      else if (code === 1) state.bold = true;
      else if (code === 2) state.dim = true;
      else if (code === 3) state.italic = true;
      else if (code === 22) state.bold = state.dim = false;
      else if (code === 23) state.italic = false;
      else if (code === 39) state.color = null;
      else if (COLORS[code]) state.color = COLORS[code];
    }
  }
  return out;
}

// --- 3. Script the frames ---
const W = 980;
const H = 640;
const prompt = '<span style="color:#34d399">❯</span> ';
const frames = []; // { html, delay }
let screen = "";
const push = (delay) => frames.push({ html: screen, delay });
const type = (cmd, title) => {
  if (title) screen += `<span style="color:#6b7f76"># ${title}</span>\n`;
  for (let i = 0; i <= cmd.length; i += 2) frames.push({ html: `${screen}${prompt}${cmd.slice(0, i)}<span class="cur"></span>`, delay: 45 });
  screen += `${prompt}${cmd}\n`;
  push(350);
};
const reveal = (text, perLine = 90, hold = 0) => {
  for (const line of text.replace(/\n+$/, "").split("\n")) {
    screen += `${ansiToHtml(line)}\n`;
    push(perLine);
  }
  if (hold) push(hold);
};

type("npx @hashimua/receipts github excalidraw/excalidraw", "a cited roadmap from any public repo, no setup");
reveal(ghOut.split("\n").filter((l) => !/Everything is in|^\s*$/.test(l.replace(/\x1b\[[0-9;]*m/g, ""))).slice(0, 26).join("\n"), 70, 2600);
screen = "";
type("cd receipts-excalidraw && npx @hashimua/receipts why R2", "three different users, the same need, verified word for word");
reveal(whyOut.split("\n").slice(0, 20).join("\n"), 60, 3000);
screen = "";
type("npx @hashimua/receipts check spec.md", "then lint a PM's edited spec before an agent builds it");
reveal(checkOut, 220, 4200);

// --- 4. Render & encode ---
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const shell = (body) => `<!doctype html><html><head><style>
  html,body{margin:0;background:#0b0f0e}
  .win{position:absolute;inset:0;background:#070a09;display:flex;flex-direction:column}
  .bar{display:flex;align-items:center;gap:7px;padding:11px 14px;border-bottom:1px solid #1a2420;font:12px ui-sans-serif,system-ui,sans-serif;color:#5d6f67}
  .bar i{width:11px;height:11px;border-radius:50%;background:#26332d;display:inline-block}
  .bar span{margin-left:auto;margin-right:auto;transform:translateX(-24px)}
  .term{flex:1;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;padding:14px 16px}
  .term.full{justify-content:flex-end}
  pre{margin:0;font:13px/1.55 "DejaVu Sans Mono",ui-monospace,Menlo,monospace;color:#d6e2db;white-space:pre-wrap;word-break:break-word}
  .cur{display:inline-block;width:8px;height:15px;background:#34d399;vertical-align:-3px}
</style></head><body><div class="win"><div class="bar"><i></i><i></i><i></i><span>receipts</span></div><div class="term"><pre>${body}</pre></div></div><script>const t=document.querySelector(".term");if(t.firstChild.offsetHeight>t.clientHeight-28)t.classList.add("full")</script></body></html>`;

// Merge consecutive identical frames, summing their delays.
const merged = [];
for (const f of frames) {
  const prev = merged[merged.length - 1];
  if (prev && prev.html === f.html) prev.delay += f.delay;
  else merged.push({ ...f });
}
const render = async (html) => {
  await page.setContent(shell(html));
  const png = PNG.sync.read(await page.screenshot({ type: "png" }));
  return new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length);
};
// One global palette from the busiest frames (scene ends), so every colour is in it.
const keyFrames = merged.filter((f) => f.delay >= 2000);
const sample = [];
for (const f of keyFrames) sample.push(await render(f.html));
const all = new Uint8Array(sample.reduce((n, a) => n + a.length, 0));
let off = 0;
for (const a of sample) {
  all.set(a, off);
  off += a.length;
}
const palette = quantize(all, 128);
const gif = GIFEncoder();
for (const f of merged) {
  const rgba = await render(f.html);
  gif.writeFrame(applyPalette(rgba, palette), W, H, { palette, delay: f.delay });
}
gif.finish();
await browser.close();
const out = join(root, "docs", "assets", "demo.gif");
writeFileSync(out, gif.bytes());
console.log(`wrote ${out} (${merged.length} frames, ${(gif.bytes().length / 1024).toFixed(0)} KB)`);
