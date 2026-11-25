/**
 * The evidence store: a folder of plain JSON, designed to be committed.
 *
 *   .receipts/
 *     sources.jsonl        one redacted source per line
 *     quotes.json          verified quotes with offsets and hashes
 *     opportunities.json   scored clusters
 *     meta.json            stable-ID indexes and run info
 *     .salt                pseudonym salt (gitignored, never commit)
 *
 * Plain files instead of a database so that evidence shows up in pull-request
 * diffs, works with `git blame`, and needs no native modules.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Opportunity, Quote, Source, StoreMeta } from "./types.js";
import { formatOpportunityId, formatQuoteId } from "./util.js";

export class Store {
  readonly dir: string;
  sources: Source[] = [];
  quotes: Quote[] = [];
  opportunities: Opportunity[] = [];
  meta: StoreMeta;
  private sourceById = new Map<string, Source>();
  private quoteById = new Map<string, Quote>();

  constructor(dir: string) {
    this.dir = resolve(dir);
    const now = new Date().toISOString();
    this.meta = {
      version: 1,
      createdAt: now,
      updatedAt: now,
      quoteIndex: {},
      nextQuote: 1,
      opportunityIndex: {},
      nextOpportunity: 1,
    };
  }

  static open(dir: string): Store {
    const store = new Store(dir);
    store.load();
    return store;
  }

  exists(): boolean {
    return existsSync(join(this.dir, "meta.json"));
  }

  load(): void {
    const read = <T>(name: string, fallback: T): T => {
      const file = join(this.dir, name);
      if (!existsSync(file)) return fallback;
      return JSON.parse(readFileSync(file, "utf8")) as T;
    };
    this.meta = read("meta.json", this.meta);
    const sourcesFile = join(this.dir, "sources.jsonl");
    this.sources = existsSync(sourcesFile)
      ? readFileSync(sourcesFile, "utf8")
          .split("\n")
          .filter((l) => l.trim())
          .map((l) => JSON.parse(l) as Source)
      : [];
    this.quotes = read("quotes.json", [] as Quote[]);
    this.opportunities = read("opportunities.json", [] as Opportunity[]);
    this.reindex();
  }

  private reindex(): void {
    this.sourceById = new Map(this.sources.map((s) => [s.id, s]));
    this.quoteById = new Map(this.quotes.map((q) => [q.id, q]));
  }

  save(): void {
    mkdirSync(this.dir, { recursive: true });
    this.meta.updatedAt = new Date().toISOString();
    const sorted = [...this.sources].sort((a, b) => a.id.localeCompare(b.id));
    writeFileSync(join(this.dir, "sources.jsonl"), sorted.map((s) => JSON.stringify(s)).join("\n") + "\n");
    writeFileSync(join(this.dir, "quotes.json"), JSON.stringify(this.quotes, null, 1) + "\n");
    writeFileSync(join(this.dir, "opportunities.json"), JSON.stringify(this.opportunities, null, 1) + "\n");
    writeFileSync(join(this.dir, "meta.json"), JSON.stringify(this.meta, null, 1) + "\n");
    const gi = join(this.dir, ".gitignore");
    if (!existsSync(gi)) writeFileSync(gi, ".salt\nview/\n");
    this.reindex();
  }

  /** Add or replace sources. Returns how many were new. */
  upsertSources(incoming: Source[]): { added: number; updated: number; unchanged: number } {
    let added = 0;
    let updated = 0;
    let unchanged = 0;
    for (const s of incoming) {
      const existing = this.sourceById.get(s.id);
      if (!existing) {
        this.sources.push(s);
        added++;
      } else if (existing.sha256 !== s.sha256) {
        Object.assign(existing, s);
        updated++;
      } else {
        unchanged++;
      }
      this.sourceById.set(s.id, this.sourceById.get(s.id) ?? s);
    }
    this.reindex();
    return { added, updated, unchanged };
  }

  source(id: string): Source | undefined {
    return this.sourceById.get(id);
  }

  quote(id: string): Quote | undefined {
    return this.quoteById.get(id.toUpperCase());
  }

  /** Stable quote ID for a given source + text. Reuses IDs across runs. */
  quoteId(sourceId: string, textHash: string): string {
    const key = `${sourceId}:${textHash.slice(0, 16)}`;
    const existing = this.meta.quoteIndex[key];
    if (existing) return existing;
    const id = formatQuoteId(this.meta.nextQuote++);
    this.meta.quoteIndex[key] = id;
    return id;
  }

  /** Stable opportunity ID keyed by its most representative quotes. */
  opportunityId(fingerprint: string): string {
    const existing = this.meta.opportunityIndex[fingerprint];
    if (existing) return existing;
    const id = formatOpportunityId(this.meta.nextOpportunity++);
    this.meta.opportunityIndex[fingerprint] = id;
    return id;
  }

  setQuotes(quotes: Quote[]): void {
    this.quotes = [...quotes].sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
    this.reindex();
  }

  setOpportunities(opps: Opportunity[]): void {
    this.opportunities = opps;
  }

  customers(): number {
    return new Set(this.quotes.map((q) => q.customer)).size;
  }
}

export function findStoreDir(root: string, configured: string): string {
  return resolve(root, configured);
}
