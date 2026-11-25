/**
 * Interview transcripts: plain "Speaker: text" files, WebVTT (Zoom, Meet,
 * Teams) and SRT. Output is a canonical "Label: utterance" text where real
 * speaker names are replaced with roles, plus turn offsets so interviewer
 * turns are never mined for evidence.
 */
import type { SourceTurn } from "../types.js";

export interface RawTurn {
  speaker: string;
  text: string;
}

export interface FrontMatter {
  [key: string]: string;
}

export function splitFrontMatter(text: string): { meta: FrontMatter; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta: FrontMatter = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = /^([\w-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (kv) meta[kv[1]!.toLowerCase()] = kv[2]!.replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "").trim();
  }
  return { meta, body: text.slice(m[0].length) };
}

const TIMESTAMP = /^\[?\(?\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?\)?\]?\s*[-–]?\s*/;
const SPEAKER_LINE = /^([A-Z][\p{L}0-9 .'’-]{0,40}?|Q|A|Interviewer|Participant(?: \d+)?)\s*:\s+(.+)$/u;

/** Parse "Name: text" lines. Lines without a speaker continue the previous turn. */
export function parseSpeakerText(body: string): RawTurn[] | undefined {
  const lines = body.split(/\r?\n/);
  const turns: RawTurn[] = [];
  let speakerLines = 0;
  for (const raw of lines) {
    const line = raw.replace(TIMESTAMP, "").trim();
    if (!line) continue;
    const m = SPEAKER_LINE.exec(line);
    if (m && !/^(https?|note|notes|summary|date|segment)$/i.test(m[1]!)) {
      speakerLines++;
      const speaker = m[1]!.trim();
      const last = turns[turns.length - 1];
      if (last && last.speaker === speaker) last.text += ` ${m[2]!.trim()}`;
      else turns.push({ speaker, text: m[2]!.trim() });
    } else if (turns.length > 0) {
      turns[turns.length - 1]!.text += ` ${line}`;
    } else {
      turns.push({ speaker: "", text: line });
    }
  }
  const speakers = new Set(turns.map((t) => t.speaker).filter(Boolean));
  if (speakerLines < 3 || speakers.size < 2) return undefined;
  return turns.filter((t) => t.speaker);
}

/** WebVTT and SRT cues → turns. Handles `<v Name>` voice tags and "Name: text" cues. */
export function parseSubtitles(body: string): RawTurn[] {
  const blocks = body.replace(/\r/g, "").split(/\n{2,}/);
  const turns: RawTurn[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim());
    const timeIdx = lines.findIndex((l) => /-->/.test(l));
    if (timeIdx < 0) continue;
    let text = lines.slice(timeIdx + 1).join(" ").trim();
    if (!text) continue;
    let speaker = "Unknown";
    const voice = /^<v(?:\.[\w.]+)?\s+([^>]+)>/.exec(text);
    if (voice) {
      speaker = voice[1]!.trim();
      text = text.replace(/<v[^>]*>/g, "").replace(/<\/v>/g, "");
    } else {
      const m = SPEAKER_LINE.exec(text);
      if (m) {
        speaker = m[1]!.trim();
        text = m[2]!;
      }
    }
    text = text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const last = turns[turns.length - 1];
    if (last && last.speaker === speaker) last.text += ` ${text}`;
    else turns.push({ speaker, text });
  }
  return turns;
}

/**
 * Decide who the interviewer is. Explicit names win; otherwise the speaker
 * whose turns are most often questions.
 */
export function detectInterviewers(turns: RawTurn[], known: string[] = []): Set<string> {
  const speakers = [...new Set(turns.map((t) => t.speaker))];
  const knownLower = known.map((k) => k.toLowerCase());
  const explicit = speakers.filter((s) => {
    const l = s.toLowerCase();
    return (
      l === "interviewer" ||
      l === "q" ||
      knownLower.some((k) => l === k || l.split(/\s+/)[0] === k.split(/\s+/)[0])
    );
  });
  if (explicit.length) return new Set(explicit);
  if (speakers.length < 2) return new Set();
  const ratio = (s: string) => {
    const mine = turns.filter((t) => t.speaker === s);
    const questions = mine.filter((t) => /\?\s*$/.test(t.text)).length;
    return questions / Math.max(1, mine.length);
  };
  const ranked = speakers
    .map((s) => ({ s, r: ratio(s) }))
    .sort((a, b) => b.r - a.r || turns.findIndex((t) => t.speaker === a.s) - turns.findIndex((t) => t.speaker === b.s));
  return ranked[0] && ranked[0].r >= 0.3 ? new Set([ranked[0].s]) : new Set();
}

export interface BuiltTranscript {
  text: string;
  turns: SourceTurn[];
  /** Original speaker names, so callers can scrub them from the body too. */
  speakerNames: string[];
}

export function buildTranscript(turns: RawTurn[], interviewers: Set<string>): BuiltTranscript {
  const customers = [...new Set(turns.map((t) => t.speaker).filter((s) => !interviewers.has(s)))];
  const label = (speaker: string): string => {
    if (interviewers.has(speaker)) return "Interviewer";
    if (customers.length <= 1) return "Participant";
    return `Participant ${customers.indexOf(speaker) + 1}`;
  };
  let text = "";
  const out: SourceTurn[] = [];
  for (const t of turns) {
    const prefix = `${label(t.speaker)}: `;
    const start = text.length + prefix.length;
    text += prefix + t.text;
    out.push({
      start,
      end: text.length,
      speaker: label(t.speaker),
      role: interviewers.has(t.speaker) ? "interviewer" : "customer",
    });
    text += "\n";
  }
  const speakerNames = [...new Set(turns.map((t) => t.speaker))].filter(
    (s) => !/^(interviewer|participant( \d+)?|q|a|unknown)$/i.test(s),
  );
  return { text: text.trimEnd(), turns: out, speakerNames };
}
