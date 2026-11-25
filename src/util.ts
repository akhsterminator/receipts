import { createHash } from "node:crypto";

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function shortHash(text: string, length = 10): string {
  return sha256(text).slice(0, length);
}

export function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

export function formatQuoteId(n: number): string {
  return `Q-${pad(n, 4)}`;
}

export function formatOpportunityId(n: number): string {
  return `O-${pad(n, 2)}`;
}

/** 1-based line number of a character offset. */
export function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / 86_400_000);
}

export function parseDate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") {
    // Unix seconds or milliseconds.
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  const s = String(value).trim();
  if (/^\d{10}(\d{3})?$/.test(s)) return parseDate(Number(s));
  // DD/MM/YYYY is ambiguous; we only accept ISO-like and RFC-2822-like strings.
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function humanAge(iso: string | undefined, now: Date): string {
  if (!iso) return "undated";
  const days = Math.round(daysBetween(new Date(iso), now));
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  if (days < 60) return `${days} days ago`;
  const months = Math.round(days / 30.4);
  if (months < 24) return `${months} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

export function monthsOld(iso: string, now: Date): number {
  return Math.round(daysBetween(new Date(iso), now) / 30.4);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:—-]+$/, "")}…`;
}

export function slugify(text: string, max = 48): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, max)
    .replace(/-+$/, "");
}

export function uniq<T>(items: Iterable<T>): T[] {
  return [...new Set(items)];
}

export function countBy<T>(items: T[], key: (item: T) => string | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    if (k === undefined) continue;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function clamp(n: number, lo = 0, hi = 1): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Escape text for safe inclusion in HTML. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
