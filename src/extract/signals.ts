/**
 * Lightweight linguistic signals for customer feedback. Used by the offline
 * extractor to find evidence-bearing sentences and by every extractor to
 * estimate intensity consistently.
 */
import type { QuoteKind } from "../types.js";
import { clamp } from "../util.js";

interface Signal {
  re: RegExp;
  kind: QuoteKind;
  weight: number;
}

const SIGNALS: Signal[] = [
  // Pain
  { re: /\b(can(?:no|')t|cannot|unable to|no way to|impossible|not possible)\b/i, kind: "pain", weight: 0.55 },
  { re: /\b(frustrat\w*|annoy\w*|infuriat\w*|irritat\w*|hate|awful|terrible|horrible|nightmare|painful|pain)\b/i, kind: "pain", weight: 0.6 },
  { re: /\b(confus\w*|unclear|hard to (find|use|understand)|difficult|complicated|clunky|cumbersome|tedious)\b/i, kind: "pain", weight: 0.5 },
  { re: /\b(broken|doesn'?t work|does not work|not working|stopped working|fails?|failed|failing|crash\w*|freez\w*|hangs?|bug(gy)?|glitch\w*|error)\b/i, kind: "pain", weight: 0.5 },
  { re: /\b(slow|sluggish|lag\w*|takes (forever|ages|too long))\b/i, kind: "pain", weight: 0.45 },
  { re: /\b(manual(ly)?|workaround|hack(y)?|copy[- ]paste|spreadsheet|by hand|every (single )?time)\b/i, kind: "pain", weight: 0.4 },
  { re: /\b(lost|lose|losing|wasted?|wasting)\b/i, kind: "pain", weight: 0.4 },
  { re: /\b(cancel\w*|churn\w*|switch(ing|ed)? to|leave|leaving|moving to|unsubscrib\w*|refund)\b/i, kind: "pain", weight: 0.55 },
  { re: /\b(too expensive|overpriced|pricey|can'?t afford|charged twice|double charged)\b/i, kind: "pain", weight: 0.5 },
  { re: /\b(blocker|blocking|blocked|deal[- ]?breaker|showstopper|critical)\b/i, kind: "pain", weight: 0.65 },
  { re: /\b(struggl\w*|stuck|gave up|give up)\b/i, kind: "pain", weight: 0.5 },
  // Requests
  { re: /\b(I|we) (really )?wish\b/i, kind: "request", weight: 0.6 },
  { re: /\b(would|I'd|we'd|I would|we would) (love|like|prefer|rather|happily)\b/i, kind: "request", weight: 0.55 },
  { re: /\b(would|'d) be (great|nice|awesome|amazing|helpful|useful|good|ideal|perfect)\b/i, kind: "request", weight: 0.55 },
  { re: /^(need|needs|want|add|allow|support|please)\b|\bplease\.?$|\bplease!?$/i, kind: "request", weight: 0.4 },
  { re: /\b(would make (it|this|that) (perfect|a no-brainer|so much better)|make this a no-brainer|would (solve|fix) (it|this|the whole thing)|would save)\b/i, kind: "request", weight: 0.55 },
  { re: /\b(please (add|support|allow|make|consider|let)|feature request|any plans|is there (any )?(way|plan)|on the roadmap)\b/i, kind: "request", weight: 0.6 },
  { re: /\b(it would be|it'd be)\b/i, kind: "request", weight: 0.45 },
  { re: /\b(should (be able to|have|support|allow|let)|needs? to (be able|support|have)|must (have|support))\b/i, kind: "request", weight: 0.5 },
  { re: /\b(I|we) (need|want) (a|an|to|the|some|more|better)\b/i, kind: "request", weight: 0.5 },
  { re: /\b(want to be able to|ability to|option to|way to|support for|integration with|ability for)\b/i, kind: "request", weight: 0.45 },
  { re: /\b(add (a|an|support|the ability)|allow (us|me|users|people)|let (us|me|users))\b/i, kind: "request", weight: 0.5 },
  { re: /\b(missing|lacks?|lacking|doesn'?t (have|support|let)|no (option|way|support))\b/i, kind: "request", weight: 0.45 },
  // Praise (kept as evidence of what to protect)
  { re: /\b(love(?! to)|loving|great|awesome|amazing|fantastic|excellent|brilliant|perfect|game[- ]changer|lifesaver|best)\b/i, kind: "praise", weight: 0.35 },
];

const INTENSIFIERS: RegExp[] = [
  /\b(really|very|extremely|incredibly|super|so|totally|absolutely|completely|seriously)\b/i,
  /\b(always|never|every (single )?(time|day|week)|constantly|all the time)\b/i,
  /\b(deal[- ]?breaker|showstopper|critical|urgent|asap|blocker)\b/i,
  /\b(cancel|switch(ing)? to|leave|leaving|churn)\b/i,
  /!{2,}|\?{2,}/,
  /\b[A-Z]{4,}\b/,
];

export interface Classification {
  kind: QuoteKind;
  /** 0..1 strength of the evidence signal. */
  signal: number;
  intensity: number;
}

export function classify(sentence: string): Classification {
  const scores: Record<QuoteKind, number> = { pain: 0, request: 0, praise: 0, question: 0, other: 0 };
  for (const s of SIGNALS) if (s.re.test(sentence)) scores[s.kind] = Math.max(scores[s.kind], s.weight) + 0.05;
  const isQuestion = /\?\s*["')\]]*\s*$/.test(sentence);
  if (isQuestion) scores.question = 0.3 + (scores.request > 0 ? 0.2 : 0);
  // Praise mixed with pain or request ("I love it but…") is really about the pain/request.
  if (scores.praise > 0 && (scores.pain > 0 || scores.request > 0)) scores.praise = 0;
  let kind: QuoteKind = "other";
  let best = 0;
  for (const k of ["pain", "request", "question", "praise"] as QuoteKind[]) {
    if (scores[k] > best) {
      best = scores[k];
      kind = k;
    }
  }
  if (isQuestion && scores.request > 0) kind = "request";
  return { kind, signal: clamp(best), intensity: intensityOf(sentence, kind) };
}

export function intensityOf(sentence: string, kind: QuoteKind): number {
  const base: Record<QuoteKind, number> = { pain: 0.5, request: 0.4, question: 0.25, praise: 0.2, other: 0.15 };
  let v = base[kind];
  for (const re of INTENSIFIERS) if (re.test(sentence)) v += 0.12;
  if (/\b(cancel|switch(ing)? to|refund|leaving)\b/i.test(sentence)) v += 0.1;
  return Math.round(clamp(v) * 100) / 100;
}

/* ---------- Sentence segmentation (offset-preserving) ---------- */

export interface Span {
  start: number;
  end: number;
  text: string;
}

const BOILERPLATE =
  /^(describe the (bug|problem|feature)|steps to reproduce|expected (behaviou?r|result)|actual (behaviou?r|result)|screenshots?|additional context|desktop|smartphone|environment|version|browser|os|to reproduce|is your feature request related to a problem|describe the solution you'?d like|describe alternatives you'?ve considered|system info|relevant log output|checklist|reproduction|what happened|what did you expect)\b/i;

/**
 * Split text into prose sentences with exact offsets. Skips code blocks,
 * tables, block quotes (someone else's words), headings, checklists and
 * template boilerplate.
 */
export function sentences(text: string, ranges?: { start: number; end: number }[]): Span[] {
  const out: Span[] = [];
  const windows = ranges ?? [{ start: 0, end: text.length }];
  for (const w of windows) {
    let inFence = false;
    let lineStart = w.start;
    const segment = text.slice(w.start, w.end);
    const lines = segment.split("\n");
    for (const line of lines) {
      const absStart = lineStart;
      lineStart += line.length + 1;
      const trimmed = line.trim();
      if (/^(```|~~~)/.test(trimmed)) {
        inFence = !inFence;
        continue;
      }
      if (inFence || !trimmed) continue;
      if (/^(>|\||#{1,6}\s|- \[[ x]\]|\* \[[ x]\]|<\/?\w+|\s{4,}\S)/.test(line) || /^\s{4}/.test(line)) continue;
      if (BOILERPLATE.test(trimmed.replace(/^[*_#\s]+/, ""))) continue;
      // Sentence boundaries within the line. Abbreviations ("e.g.", "Dr.") and
      // decimals ("v1.2", "3.5") are consumed as part of the sentence.
      const re = /(?:\b(?:e\.g|i\.e|etc|vs|approx|incl|cf|Mr|Mrs|Ms|Dr|St|No)\.(?!\s*$)|\d+(?:\.\d+)+|\.(?=\w)|[^.!?])+(?:[.!?]+["')\]]*|$)/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line))) {
        if (!m[0]) {
          re.lastIndex++;
          continue;
        }
        let s = m.index;
        let e = m.index + m[0].length;
        while (s < e && /[\s*_\-–—•·]/.test(line[s]!)) s++;
        while (e > s && /\s/.test(line[e - 1]!)) e--;
        // Strip a leading list marker like "1." or "a)".
        const marker = /^(\d{1,2}[.)]|[a-z][.)])\s+/.exec(line.slice(s, e));
        if (marker) s += marker[0].length;
        if (e - s < 2) continue;
        out.push({ start: absStart + s, end: absStart + e, text: line.slice(s, e) });
      }
    }
  }
  return out;
}

export function looksLikeProse(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 4) return false;
  const codey = (text.match(/[{}();=<>[\]`$\\]/g) ?? []).length;
  if (codey / text.length > 0.06) return false;
  if (/https?:\/\/\S+$/.test(text) && words.length < 8) return false;
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  return letters / text.length > 0.6;
}
