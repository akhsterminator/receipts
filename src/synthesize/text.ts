/** Tokenising, stemming and TF-IDF vectors for clustering and search. */

const STOPWORDS = new Set(
  `a about above after again against all almost also although always am among an and another any anyone anything are aren't around as at
  be because been before being below between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during
  each either else even ever every few for from further get gets getting got had hadn't has hasn't have haven't having he her here hers him his how
  i i'd i'll i'm i've if in into is isn't it it's its itself just let let's like likely lot lots made make makes making many may maybe me might mine more
  most much must my myself need needs no nor not now of off often on once one only or other others otherwise our ours out over own
  per please pretty quite rather really same see seem seems she should shouldn't since so some something sometimes still such sure
  than that that's the their theirs them then there there's these they they'd they'll they're they've thing things think this those though through
  thus to too try trying under until up upon us use used uses using very via want wanted wants was wasn't way ways we we'd we'll we're we've well
  were weren't what what's when where whether which while who whom whose why will with within without won't would wouldn't yes yet you you'd you'll
  you're you've your yours yourself able actually anyway etc eg ie ok okay oh hi hello thanks thank cheers great good nice love awesome amazing
  issue issues problem problems feature features request requests support supported app application product tool option options
  add added adding allow allowing want wish hope know go going goes gonna kind sort bit already currently instead able unable every
  keep keeps kept frustrating frustrated frustration annoying annoyed confusing confused terrible awful horrible sneaky painful pain
  honestly genuinely seriously absolutely totally completely literally basically whole couple ideal perfect brilliant fantastic excellent
  time times ages forever day days week weeks month year years today yesterday tomorrow ago
  leave leaves leaving left come came back away start started end ended put take took give gave say said tell told ask asked
  happen happened happens find found look looking need needed needs thing stuff someone something anyone everyone nothing
  wait waiting help helps helpful annoyingly frustratingly constantly always never ever
  work works worked user users people person new old current possible possibly simply simple easy easily better best lot`
    .split(/\s+/)
    .filter(Boolean),
);

const PLACEHOLDER = /^\[(email|name|phone|card|iban|id|ip|postcode|address|handle|secret|redacted|image)\]$/i;

/** A conservative English stemmer: enough to merge "exports/exporting/exported". */
export function stem(word: string): string {
  let w = word;
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) w = w.slice(0, -1);
  if (w.endsWith("ing") && w.length > 5) {
    w = w.slice(0, -3);
    if (/(.)\1$/.test(w) && !/[lsz]$/.test(w)) w = w.slice(0, -1);
  } else if (w.endsWith("ed") && w.length > 4) {
    w = w.slice(0, -2);
    if (/(.)\1$/.test(w) && !/[lsz]$/.test(w)) w = w.slice(0, -1);
  }
  if (w.endsWith("ly") && w.length > 5) w = w.slice(0, -2);
  if (w.endsWith("ation") && w.length > 7) w = w.slice(0, -5);
  else if (w.endsWith("ment") && w.length > 7) w = w.slice(0, -4);
  if (w.endsWith("e") && w.length > 4) w = w.slice(0, -1);
  return w;
}

export interface Tokens {
  stems: string[];
  /** stem → a surface form seen in the text, for readable labels. */
  surface: Map<string, string>;
}

/** Words to ignore for this run only (e.g. the product's own name, which is in every quote). */
let extraStop = new Set<string>();
export function setIgnoredWords(words: string[]): void {
  extraStop = new Set(words.flatMap((w) => w.toLowerCase().split(/[^\p{L}\p{N}]+/u)).filter((w) => w.length > 1).flatMap((w) => [w, stem(w)]));
}

export function tokenize(text: string): Tokens {
  const surface = new Map<string, string>();
  const stems: string[] = [];
  const words = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/`[^`]*`/g, " ")
    .toLowerCase()
    .match(/\[[a-z]+\]|[\p{L}][\p{L}\p{N}'’-]*/gu) ?? [];
  for (const raw of words) {
    if (PLACEHOLDER.test(raw)) continue;
    const word = raw.replace(/['’]s$/, "").replace(/['’-]+$/, "");
    if (word.length < 2 || STOPWORDS.has(word) || extraStop.has(word) || /^\d+$/.test(word)) continue;
    const s = stem(word);
    if (s.length < 2 || STOPWORDS.has(s) || extraStop.has(s)) continue;
    stems.push(s);
    if (!surface.has(s) || word.length < surface.get(s)!.length) surface.set(s, word);
  }
  return { stems, surface };
}

export type Vector = Map<string, number>;

/** Unigrams plus adjacent bigrams ("dark_mode"), which carry most topic signal. */
export function features(stems: string[]): string[] {
  const out = [...stems];
  for (let i = 0; i + 1 < stems.length; i++) out.push(`${stems[i]}_${stems[i + 1]}`);
  return out;
}

export class Tfidf {
  private df = new Map<string, number>();
  private n = 0;

  constructor(docs: string[][]) {
    for (const d of docs) this.add(d);
  }

  add(doc: string[]): void {
    this.n++;
    for (const t of new Set(doc)) this.df.set(t, (this.df.get(t) ?? 0) + 1);
  }

  idf(term: string): number {
    return Math.log((1 + this.n) / (1 + (this.df.get(term) ?? 0))) + 1;
  }

  vector(doc: string[], weight = 1, into: Vector = new Map()): Vector {
    const tf = new Map<string, number>();
    for (const t of doc) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [t, c] of tf) {
      // Terms seen in a single document can't link documents; drop them.
      if ((this.df.get(t) ?? 0) < 2) continue;
      const w = (1 + Math.log(c)) * this.idf(t) * (t.includes("_") ? 1.4 : 1) * weight;
      into.set(t, (into.get(t) ?? 0) + w);
    }
    return into;
  }
}

export function normalizeVector(v: Vector): Vector {
  let norm = 0;
  for (const w of v.values()) norm += w * w;
  norm = Math.sqrt(norm);
  if (norm === 0) return v;
  for (const [k, w] of v) v.set(k, w / norm);
  return v;
}

export function cosine(a: Vector, b: Vector): number {
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [k, w] of small) {
    const o = large.get(k);
    if (o !== undefined) dot += w * o;
  }
  return dot;
}

export function addInto(target: Vector, v: Vector, scale = 1): void {
  for (const [k, w] of v) target.set(k, (target.get(k) ?? 0) + w * scale);
}

export function topTerms(v: Vector, n: number): string[] {
  return [...v.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([k]) => k);
}
