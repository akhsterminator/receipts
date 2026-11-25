/**
 * `receipts view`: a single, self-contained HTML evidence map. No server, no
 * build step, no network: open it from disk or deploy it as a static page.
 */
import { asOf, type ReceiptsConfig } from "./config.js";
import { quoteStatus } from "./spec/check.js";
import type { Store } from "./store.js";
import type { CheckResult, ParsedSpec } from "./types.js";
import { SCORE_FORMULA } from "./synthesize/score.js";
import { VERSION } from "./version.js";

export interface ViewData {
  project: string;
  version: string;
  generatedAt: string;
  asOf: string;
  formula: string;
  extractor?: string;
  stats: { sources: number; quotes: number; customers: number; opportunities: number; kinds: Record<string, number>; redactions: number };
  opportunities: {
    id: string;
    title: string;
    job?: string;
    theme: string;
    keywords: string[];
    score: number;
    breakdown: Record<string, number>;
    stats: Record<string, unknown>;
    quoteIds: string[];
    requirement?: { title: string; metric?: string; rationale?: string };
    rid?: string;
  }[];
  quotes: Record<string, { t: string; k: string; i: number; s?: string; d?: string; c: string; src: string; b: string; a: string; l: number; v: boolean }>;
  sources: Record<string, { k: string; t: string; o: string; u?: string }>;
  spec?: { path: string; summary: CheckResult["summary"]; requirements: { id: string; title: string; because: string[]; bet?: string; metric?: string }[] };
  links?: { repo?: string; title?: string };
}

export function buildViewData(
  store: Store,
  config: ReceiptsConfig,
  extra: { spec?: ParsedSpec; check?: CheckResult; links?: ViewData["links"] } = {},
): ViewData {
  const kinds: Record<string, number> = {};
  for (const s of store.sources) kinds[s.kind] = (kinds[s.kind] ?? 0) + 1;
  const quotes: ViewData["quotes"] = {};
  const sourcesUsed = new Set<string>();
  for (const q of store.quotes) {
    const src = store.source(q.sourceId);
    const text = src?.text ?? "";
    const before = text.slice(Math.max(0, q.start - 360), q.start);
    const after = text.slice(q.end, q.end + 360);
    quotes[q.id] = {
      t: q.text,
      k: q.kind,
      i: q.intensity,
      ...(q.segment ? { s: q.segment } : {}),
      ...(q.date ? { d: q.date.slice(0, 10) } : {}),
      c: q.customer,
      src: q.sourceId,
      b: q.start > 360 ? `…${before.replace(/^\S*\s/, "")}` : before,
      a: q.end + 360 < text.length ? `${after.replace(/\s\S*$/, "")}…` : after,
      l: q.line,
      v: quoteStatus(store, q).ok,
    };
    sourcesUsed.add(q.sourceId);
  }
  const sources: ViewData["sources"] = {};
  for (const id of sourcesUsed) {
    const s = store.source(id);
    if (!s) continue;
    sources[id] = { k: s.kind, t: s.title, o: s.origin, ...(typeof s.meta?.url === "string" ? { u: s.meta.url } : {}) };
  }
  // Map opportunities to spec requirements that cite mostly their quotes.
  const ridFor = new Map<string, string>();
  if (extra.spec) {
    for (const r of extra.spec.requirements) {
      const ids = new Set(r.because.map((c) => c.id));
      let best: { id: string; overlap: number } | undefined;
      for (const o of store.opportunities) {
        const overlap = o.quoteIds.filter((q) => ids.has(q)).length;
        if (overlap && (!best || overlap > best.overlap)) best = { id: o.id, overlap };
      }
      if (best && !ridFor.has(best.id)) ridFor.set(best.id, r.id);
    }
  }
  return {
    project: config.project,
    version: VERSION,
    generatedAt: new Date().toISOString(),
    asOf: asOf(config).toISOString().slice(0, 10),
    formula: config.score ? "custom formula (receipts.config)" : SCORE_FORMULA,
    ...(store.meta.lastRun ? { extractor: store.meta.lastRun.extractor } : {}),
    stats: {
      sources: store.sources.length,
      quotes: store.quotes.length,
      customers: store.customers(),
      opportunities: store.opportunities.length,
      kinds,
      redactions: store.sources.reduce((a, s) => a + s.redactions, 0),
    },
    opportunities: store.opportunities.map((o) => ({
      id: o.id,
      title: o.title,
      ...(o.job ? { job: o.job } : {}),
      theme: o.theme,
      keywords: o.keywords,
      score: o.score,
      breakdown: { ...o.breakdown },
      stats: { ...o.stats },
      quoteIds: o.quoteIds,
      ...(o.requirement ? { requirement: o.requirement } : {}),
      ...(ridFor.has(o.id) ? { rid: ridFor.get(o.id) } : {}),
    })),
    quotes,
    sources,
    ...(extra.spec && extra.check
      ? {
          spec: {
            path: extra.spec.path,
            summary: extra.check.summary,
            requirements: extra.spec.requirements.map((r) => ({
              id: r.id,
              title: r.title,
              because: r.because.map((c) => c.id),
              ...(r.bet ? { bet: r.bet.reason } : {}),
              ...(r.metric ? { metric: r.metric.text } : {}),
            })),
          },
        }
      : {}),
    ...(extra.links ? { links: extra.links } : {}),
  };
}

function safeJson(data: unknown): string {
  const LS = new RegExp(String.fromCharCode(0x2028), "g");
  const PS = new RegExp(String.fromCharCode(0x2029), "g");
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(LS, "\\u2028").replace(PS, "\\u2029");
}

export function renderView(data: ViewData): string {
  const title = data.links?.title ?? `${data.project} · Receipts`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/</g, "&lt;")}</title>
<meta name="description" content="An evidence map built by Receipts: customer opportunities ranked by a transparent formula, every one backed by verified customer quotes.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath d='M6 2h20v28l-3.3-2-3.4 2-3.3-2-3.3 2-3.4-2L6 30z' fill='%2334d399'/%3E%3Cpath d='M10 9h12M10 14h12M10 19h7' stroke='%230b0f0e' stroke-width='2.2' stroke-linecap='round'/%3E%3C/svg%3E">
<style>${CSS}</style>
</head>
<body>
<header class="top">
  <a class="brand" href="#" aria-label="Receipts home">
    <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><path d="M6 2h20v28l-3.3-2-3.4 2-3.3-2-3.3 2-3.4-2L6 30z" fill="var(--accent)"/><path d="M10 9h12M10 14h12M10 19h7" stroke="var(--bg)" stroke-width="2.2" stroke-linecap="round"/></svg>
    <span>Receipts</span>
  </a>
  <div class="project" id="project"></div>
  <label class="search"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input id="q" type="search" placeholder="Search what customers said…" autocomplete="off" aria-label="Search quotes"><kbd>/</kbd></label>
</header>
<section class="hero" id="hero"></section>
<main class="layout">
  <nav class="list" id="list" aria-label="Opportunities"></nav>
  <article class="detail" id="detail" aria-live="polite"></article>
</main>
<footer class="foot" id="foot"></footer>
<script id="data" type="application/json">${safeJson(data)}</script>
<script>${JS}</script>
</body>
</html>
`;
}

const CSS = `
:root{--bg:#0b0f0e;--panel:#111715;--panel2:#161e1b;--line:#23302b;--text:#e8efe9;--muted:#8fa39a;--faint:#5d6f67;--accent:#34d399;--accent2:#a7f3d0;--pain:#fb7185;--request:#60a5fa;--praise:#34d399;--question:#c4b5fd;--warn:#fbbf24;--paper:#f6f1e7;--ink:#1f2421;--qborder:transparent;--mono:ui-monospace,SFMono-Regular,"JetBrains Mono",Menlo,Consolas,monospace;--sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,Roboto,sans-serif;--serif:"Iowan Old Style","Charter","Georgia",serif;color-scheme:dark}
@media (prefers-color-scheme:light){:root{--bg:#f4f1ea;--panel:#fffdf8;--panel2:#f8f4ec;--line:#e4ddcf;--text:#1b211e;--muted:#5d6a63;--faint:#93a099;--accent:#0f9f6e;--accent2:#065f46;--pain:#e11d48;--request:#2563eb;--praise:#059669;--question:#7c3aed;--warn:#b45309;--paper:#fffefb;--qborder:#e6dfd0;color-scheme:light}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 var(--sans);-webkit-font-smoothing:antialiased}
a{color:inherit}button{font:inherit;color:inherit}
.top{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:16px;padding:12px 24px;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:8px;font-weight:700;letter-spacing:-.01em;text-decoration:none;font-size:17px}
.project{color:var(--muted);font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.project b{color:var(--text);font-weight:600}
.search{margin-left:auto;display:flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:6px 10px;color:var(--muted);width:min(380px,40vw)}
.search:focus-within{border-color:var(--accent)}
.search input{all:unset;flex:1;color:var(--text);font-size:14px}
kbd{font:11px var(--mono);border:1px solid var(--line);border-radius:5px;padding:1px 6px;color:var(--faint)}
.hero{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;margin:20px 24px 0;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--line)}
.stat{background:var(--panel);padding:14px 18px}
.stat .n{font:600 26px/1.1 var(--sans);letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.stat .l{color:var(--muted);font-size:12.5px;margin-top:4px}
.stat.ok .n{color:var(--accent)}
.layout{display:grid;grid-template-columns:minmax(300px,400px) 1fr;gap:20px;padding:20px 24px 40px;align-items:start}
.list{position:sticky;top:76px;max-height:calc(100vh - 96px);overflow:auto;border:1px solid var(--line);border-radius:14px;background:var(--panel)}
.filters{display:flex;flex-wrap:wrap;gap:6px;padding:12px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--panel);z-index:1}
.chip{border:1px solid var(--line);background:transparent;border-radius:999px;padding:2px 10px;font-size:12.5px;color:var(--muted);cursor:pointer}
.chip[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:var(--bg);font-weight:600}
.theme{padding:14px 14px 4px;font:600 11px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--faint);display:flex;justify-content:space-between}
.opp{display:grid;grid-template-columns:28px 1fr;gap:4px 10px;width:100%;text-align:left;padding:10px 14px;border:0;border-left:3px solid transparent;background:transparent;cursor:pointer}
.opp:hover{background:var(--panel2)}
.opp[aria-current=true]{background:var(--panel2);border-left-color:var(--accent)}
.opp .rank{font:600 12px var(--mono);color:var(--faint);padding-top:2px}
.opp .t{font-size:14px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.opp .m{grid-column:2;display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted)}
.meter{flex:0 0 72px;height:5px;border-radius:3px;background:var(--line);overflow:hidden}
.meter i{display:block;height:100%;background:var(--accent);border-radius:3px}
.rid{font:600 10.5px var(--mono);color:var(--bg);background:var(--accent);border-radius:4px;padding:0 5px}
.detail{min-width:0}
.eyebrow{font:500 12px var(--mono);color:var(--muted);display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.eyebrow .rid{font-size:12px;padding:1px 7px}
h1{font:600 clamp(24px,3vw,32px)/1.18 var(--sans);letter-spacing:-.025em;margin:10px 0 8px;text-wrap:balance}
.job{font:italic 17px/1.5 var(--serif);color:var(--muted);margin:0 0 6px;max-width:70ch}
.req{margin:14px 0 0;padding:12px 14px;border:1px dashed var(--line);border-radius:10px;font-size:14px;color:var(--muted)}
.req b{color:var(--text)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:20px 0}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.kpi .n{font:600 22px/1.1 var(--sans);font-variant-numeric:tabular-nums}
.kpi .l{font-size:12px;color:var(--muted);margin-top:3px}
.why{display:grid;grid-template-columns:1fr 1fr;gap:20px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:22px}
.why h3,.ev h3{font:600 11px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--faint);margin:0 0 10px}
.factor{display:grid;grid-template-columns:96px 1fr 46px;align-items:center;gap:10px;font-size:13px;margin:6px 0}
.factor .meter{flex:none;height:7px}
.factor span:last-child{text-align:right;font:12px var(--mono);color:var(--muted)}
.formula{font:12px var(--mono);color:var(--faint);margin-top:10px}
.segbar{display:flex;height:10px;border-radius:5px;overflow:hidden;background:var(--line);margin:4px 0 10px}
.segbar i{display:block;height:100%}
.legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;color:var(--muted)}
.legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;vertical-align:0}
.kw{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.kw span{font:12px var(--mono);color:var(--muted);background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:1px 7px}
.ev{margin-top:6px}
.quotes{display:grid;gap:14px}
.q{position:relative;border:1px solid var(--qborder);border-bottom:0;background:var(--paper);color:var(--ink);border-radius:4px 4px 0 0;padding:18px 20px 22px;box-shadow:0 1px 0 rgba(0,0,0,.04),0 8px 24px -16px rgba(0,0,0,.5)}
.q::after{content:"";position:absolute;left:0;right:0;bottom:-8px;height:8px;background:linear-gradient(-45deg,transparent 6px,var(--paper) 0) 0 0/12px 8px repeat-x,linear-gradient(45deg,transparent 6px,var(--paper) 0) 0 0/12px 8px repeat-x}
.q blockquote{margin:0;font:17px/1.5 var(--serif);text-wrap:pretty}
.q blockquote::before{content:"\\201C";color:#9aa59f}.q blockquote::after{content:"\\201D";color:#9aa59f}
.q .meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin-top:12px;font:12px var(--mono);color:#5b665f}
.q .id{font-weight:700;color:var(--ink)}
.pill{border-radius:4px;padding:0 6px;font-weight:600;color:#fff;text-transform:uppercase;font-size:10.5px;letter-spacing:.04em}
.pill.pain{background:#e11d48}.pill.request{background:#2563eb}.pill.praise{background:#059669}.pill.question{background:#7c3aed}.pill.other{background:#64748b}
.dots{letter-spacing:1px;color:#c2410c}
.ver{color:#047857;font-weight:700}.ver.bad{color:#be123c}
.q button.ctx{all:unset;cursor:pointer;text-decoration:underline;text-underline-offset:3px;color:#374151}
.context{margin-top:12px;padding:12px 14px;background:#ece5d6;border-radius:6px;font:13px/1.6 var(--mono);color:#4b5563;white-space:pre-wrap;word-break:break-word;max-height:320px;overflow:auto}
.context mark{background:#bbf7d0;color:#052e16;padding:1px 0;border-radius:2px}
.empty{color:var(--muted);padding:40px 0;text-align:center}
.foot{padding:0 24px 32px;color:var(--faint);font-size:12.5px;display:flex;gap:18px;flex-wrap:wrap}
.foot a{color:var(--muted)}
.results h2{font-size:15px;color:var(--muted);font-weight:500;margin:0 0 14px}
@media (max-width:860px){.layout{grid-template-columns:1fr}.list{position:static;max-height:46vh}.why{grid-template-columns:1fr}.top{flex-wrap:wrap}.search{width:100%;order:3}.project{display:none}}
`;

const JS = `
const D=JSON.parse(document.getElementById('data').textContent);
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SEG_COLORS=['#34d399','#60a5fa','#f472b6','#fbbf24','#a78bfa','#f87171','#2dd4bf','#fb923c'];
const segs=[...new Set(Object.values(D.quotes).map(q=>q.s||'unknown'))].sort();
const segColor=s=>SEG_COLORS[segs.indexOf(s)%SEG_COLORS.length];
const kinds=['pain','request','praise','question'];
const state={seg:null,kind:null,sel:null,q:''};
const maxScore=Math.max(1,...D.opportunities.map(o=>o.score));
const fmt=n=>n>=1000?(n/1000).toFixed(1).replace(/\\.0$/,'')+'k':String(n);
const ago=d=>{if(!d)return'undated';const days=Math.round((new Date(D.asOf)-new Date(d))/864e5);if(days<1)return'today';if(days<60)return days+'d ago';const m=Math.round(days/30.4);return m<24?m+' mo ago':Math.round(days/365)+' yr ago'};
function header(){
  $('#project').innerHTML='<b>'+esc(D.project)+'</b> · evidence map'+(D.links&&D.links.repo?' · <a href="https://github.com/'+esc(D.links.repo)+'" target="_blank" rel="noopener">'+esc(D.links.repo)+'</a>':'');
  const s=D.stats;const unver=Object.values(D.quotes).filter(q=>!q.v).length;
  const cells=[[fmt(s.quotes),'verified quotes',true],[fmt(s.customers),'customers'],[fmt(s.sources),'sources · '+Object.entries(s.kinds).map(([k,n])=>n+' '+k+(n>1?'s':'')).join(', ')],[s.opportunities,'opportunities'],[unver,'unverified quotes',unver===0]];
  if(D.spec)cells.push([D.spec.summary.cited+'/'+D.spec.summary.requirements,'requirements cited in '+D.spec.path]);
  $('#hero').innerHTML=cells.map(([n,l,ok])=>'<div class="stat'+(ok?' ok':'')+'"><div class="n">'+esc(n)+'</div><div class="l">'+esc(l)+'</div></div>').join('');
  $('#foot').innerHTML='<span>Built with <a href="https://github.com/akhsterminator/receipts">Receipts</a> v'+esc(D.version)+'</span><span>Every quote is checked word for word against its source.</span><span>Customer identities are pseudonymised; personal data was removed before analysis ('+fmt(s.redactions)+' redactions).</span><span>As of '+esc(D.asOf)+'</span>';
}
function matches(o){
  if(!state.seg&&!state.kind)return true;
  return o.quoteIds.some(id=>{const q=D.quotes[id];return(!state.seg||(q.s||'unknown')===state.seg)&&(!state.kind||q.k===state.kind)});
}
function list(){
  const f='<div class="filters">'+segs.map(s=>'<button class="chip" data-seg="'+esc(s)+'" aria-pressed="'+(state.seg===s)+'">'+esc(s)+'</button>').join('')+'<span style="flex-basis:100%;height:0"></span>'+kinds.map(k=>'<button class="chip" data-kind="'+k+'" aria-pressed="'+(state.kind===k)+'">'+k+'</button>').join('')+'</div>';
  const themes={};D.opportunities.forEach((o,i)=>{if(!matches(o))return;(themes[o.theme]=themes[o.theme]||[]).push([o,i])});
  const order=Object.entries(themes).sort((a,b)=>a[1][0][1]-b[1][0][1]);
  let h=f;
  if(!order.length)h+='<p class="empty">No opportunities match.</p>';
  for(const [t,items] of order){
    h+='<div class="theme"><span>'+esc(t)+'</span><span>'+items.length+'</span></div>';
    for(const [o,i] of items){
      h+='<button class="opp" data-id="'+o.id+'" aria-current="'+(state.sel===o.id)+'"><span class="rank">'+(i+1)+'</span><span class="t">'+esc(o.title)+'</span><span class="m"><span class="meter"><i style="width:'+(o.score/maxScore*100).toFixed(1)+'%"></i></span>'+o.score+' · '+o.stats.customers+' cust.'+(o.rid?' <span class="rid">'+esc(o.rid)+'</span>':'')+'</span></button>';
    }
  }
  $('#list').innerHTML=h;
}
function quoteCard(id,open){
  const q=D.quotes[id];if(!q)return'';const src=D.sources[q.src]||{};
  const dots='●'.repeat(Math.max(1,Math.round(q.i*5)))+'○'.repeat(5-Math.max(1,Math.round(q.i*5)));
  const link=src.u?'<a href="'+esc(src.u)+'" target="_blank" rel="noopener">'+esc(src.k)+' ↗</a>':esc(src.k);
  return '<div class="q" id="'+id+'"><blockquote>'+esc(q.t)+'</blockquote><div class="meta"><span class="id">'+id+'</span><span class="pill '+esc(q.k)+'">'+esc(q.k)+'</span><span class="dots" title="intensity '+q.i+'">'+dots+'</span><span>'+link+'</span>'+(q.s?'<span>'+esc(q.s)+'</span>':'')+'<span>'+ago(q.d)+'</span><span class="ver'+(q.v?'':' bad')+'">'+(q.v?'✓ verified':'✗ unverified')+'</span><button class="ctx" data-q="'+id+'">'+(open?'hide source':'show in source')+'</button></div>'+(open?'<div class="context">'+esc(q.b)+'<mark>'+esc(q.t)+'</mark>'+esc(q.a)+'</div>':'')+'</div>';
}
const opened=new Set();
function detail(){
  if(state.q){return search()}
  const o=D.opportunities.find(x=>x.id===state.sel)||D.opportunities[0];
  if(!o){$('#detail').innerHTML='<p class="empty">No opportunities yet. Add more feedback and run <code>receipts run</code>.</p>';return}
  state.sel=o.id;const st=o.stats,b=o.breakdown;const rank=D.opportunities.indexOf(o)+1;
  const segEntries=Object.entries(st.segments).sort((a,b)=>b[1]-a[1]);const segTotal=segEntries.reduce((a,[,n])=>a+n,0);
  const fac=(l,v,max,disp)=>'<div class="factor"><span>'+l+'</span><span class="meter"><i style="width:'+Math.min(100,v/max*100).toFixed(1)+'%"></i></span><span>'+disp+'</span></div>';
  const req=o.requirement&&o.requirement.title!==o.title?'<div class="req"><b>Requirement draft:</b> '+esc(o.requirement.title)+(o.requirement.metric?'<br><b>Metric:</b> '+esc(o.requirement.metric):'')+'</div>':'';
  $('#detail').innerHTML='<div class="eyebrow"><span>#'+rank+' · '+o.id+'</span><span>'+esc(o.theme)+'</span>'+(o.rid?'<span class="rid">in spec as '+esc(o.rid)+'</span>':'')+'</div><h1>'+esc(o.title)+'</h1>'+(o.job?'<p class="job">'+esc(o.job)+'</p>':'')+req+
  '<div class="kpis"><div class="kpi"><div class="n">'+o.score+'</div><div class="l">priority score</div></div><div class="kpi"><div class="n">'+st.customers+'</div><div class="l">customers</div></div><div class="kpi"><div class="n">'+st.quotes+'</div><div class="l">verified quotes</div></div>'+(st.votes?'<div class="kpi"><div class="n">'+fmt(st.votes)+'</div><div class="l">upvotes</div></div>':'')+'<div class="kpi"><div class="n">'+ago(st.lastSeen)+'</div><div class="l">last seen</div></div></div>'+
  '<div class="why"><div><h3>Why this score</h3>'+fac('Reach',b.reach,8,b.reach.toFixed(2))+fac('Intensity',b.intensity,1,b.intensity.toFixed(2))+fac('Segment wt.',b.segmentWeight,2,b.segmentWeight.toFixed(2))+fac('Recency',b.recency,1,b.recency.toFixed(2))+'<div class="formula">'+esc(D.formula)+'</div></div><div><h3>Who said it</h3><div class="segbar">'+segEntries.map(([s,n])=>'<i style="width:'+(n/segTotal*100)+'%;background:'+segColor(s)+'" title="'+esc(s)+': '+n+'"></i>').join('')+'</div><div class="legend">'+segEntries.map(([s,n])=>'<span><i style="background:'+segColor(s)+'"></i>'+esc(s)+' '+n+'</span>').join('')+'</div><div class="kw">'+o.keywords.slice(0,6).map(k=>'<span>'+esc(k)+'</span>').join('')+'</div></div></div>'+
  '<section class="ev"><h3>The receipts · '+o.quoteIds.length+' quotes</h3><div class="quotes">'+o.quoteIds.filter(id=>{const q=D.quotes[id];return q&&(!state.seg||(q.s||'unknown')===state.seg)&&(!state.kind||q.k===state.kind)}).map(id=>quoteCard(id,opened.has(id))).join('')+'</div></section>';
}
function search(){
  const terms=state.q.toLowerCase().split(/\\s+/).filter(Boolean);
  const hits=Object.entries(D.quotes).filter(([,q])=>terms.every(t=>q.t.toLowerCase().includes(t))).slice(0,80);
  $('#detail').innerHTML='<div class="results"><h2>'+hits.length+(hits.length===80?'+':'')+' quotes matching “'+esc(state.q)+'”</h2><div class="quotes">'+hits.map(([id])=>quoteCard(id,opened.has(id))).join('')+'</div></div>';
}
function render(){list();detail()}
document.addEventListener('click',e=>{
  const t=e.target.closest('button');if(!t)return;
  if(t.dataset.id){state.sel=t.dataset.id;state.q='';$('#q').value='';history.replaceState(null,'','#'+t.dataset.id);render();window.scrollTo({top:0,behavior:'smooth'})}
  else if(t.dataset.seg!==undefined){state.seg=state.seg===t.dataset.seg?null:t.dataset.seg;render()}
  else if(t.dataset.kind!==undefined){state.kind=state.kind===t.dataset.kind?null:t.dataset.kind;render()}
  else if(t.dataset.q){opened.has(t.dataset.q)?opened.delete(t.dataset.q):opened.add(t.dataset.q);detail()}
});
$('#q').addEventListener('input',e=>{state.q=e.target.value.trim();detail()});
document.addEventListener('keydown',e=>{if(e.key==='/'&&document.activeElement!==$('#q')){e.preventDefault();$('#q').focus()}if(e.key==='Escape'){$('#q').value='';state.q='';detail()}});
const h=location.hash.slice(1);
if(/^O-/.test(h))state.sel=h;
if(/^Q-/.test(h)){const o=D.opportunities.find(o=>o.quoteIds.includes(h));if(o)state.sel=o.id;opened.add(h)}
header();render();
if(/^Q-/.test(h))setTimeout(()=>{const el=document.getElementById(h);if(el)el.scrollIntoView({block:'center'})},50);
`;
