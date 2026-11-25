import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Opportunity, ScoreBreakdown } from "./types.js";

export type ExtractorChoice = "auto" | "claude" | "ollama" | "heuristic";

export interface ScoreInput {
  opportunity: Pick<Opportunity, "id" | "title" | "stats">;
  breakdown: ScoreBreakdown;
}

export interface ReceiptsConfig {
  /** Shown in generated specs and the viewer. */
  project: string;
  /** Where the evidence store lives, relative to the config file. */
  store: string;
  /** Which engine mines quotes. `auto` = Claude if a key is set, else heuristic. */
  extractor: ExtractorChoice;
  /** Which engine groups quotes into opportunities. */
  clusterer: "auto" | "claude" | "heuristic";
  claude: {
    model: string;
    effort: "low" | "medium" | "high" | "xhigh" | "max";
    /** Max quotes per source the model may return. */
    maxQuotesPerSource: number;
  };
  ollama: {
    host: string;
    model: string;
  };
  privacy: {
    /** Remove emails, phones, card numbers, names, etc. before anything is stored. */
    redact: boolean;
    /** Extra regexes (as strings) to redact as [REDACTED]. */
    patterns: string[];
    /** Words that look like names but must not be redacted (product names, etc.). */
    allow: string[];
  };
  /** Transcript speaker names that belong to your team. Their turns are never quoted. */
  interviewers: string[];
  segments: {
    /** Relative importance of each customer segment. Unlisted segments get `default`. */
    weights: Record<string, number>;
    default: number;
  };
  scoring: {
    /** Recency half-life: evidence this old counts half as much. */
    halfLifeDays: number;
    /** Minimum quotes for something to count as an opportunity. */
    minQuotes: number;
    /** Cosine similarity needed to join a cluster (heuristic clusterer). */
    similarity: number;
    /** Words to ignore when clustering (your product name is ignored automatically). */
    ignore?: string[];
  };
  /**
   * Optional custom priority formula. Receives the normalised factors and
   * returns a number; higher means more important. Overrides the default.
   */
  score?: (input: ScoreInput) => number;
  check: {
    /** Warn when a requirement rests on fewer distinct customers than this. */
    minCustomers: number;
    /** Warn when a cited quote is older than this. */
    staleAfterDays: number;
    /** Warn when a requirement has no `metric:` line. */
    requireMetric: boolean;
    /** Warn when the share of `bet:` requirements is above this (0..1). */
    maxBetShare: number;
    /** Treat warnings as failures (exit code 1). */
    strict: boolean;
  };
  /** Fixed "today" for reproducible runs, ISO date. Defaults to the real date. */
  asOf?: string;
}

export const DEFAULT_CONFIG: ReceiptsConfig = {
  project: "My product",
  store: ".receipts",
  extractor: "auto",
  clusterer: "auto",
  claude: {
    model: "claude-opus-5-5",
    effort: "medium",
    maxQuotesPerSource: 12,
  },
  ollama: {
    host: "http://127.0.0.1:11434",
    model: "llama3.1",
  },
  privacy: {
    redact: true,
    patterns: [],
    allow: [],
  },
  interviewers: [],
  segments: {
    weights: {},
    default: 1,
  },
  scoring: {
    halfLifeDays: 120,
    minQuotes: 2,
    similarity: 0.2,
  },
  check: {
    minCustomers: 2,
    staleAfterDays: 365,
    requireMetric: true,
    maxBetShare: 0.5,
    strict: false,
  },
};

export const CONFIG_FILES = [
  "receipts.config.ts",
  "receipts.config.mts",
  "receipts.config.js",
  "receipts.config.mjs",
  "receipts.config.json",
];

export type PartialConfig = {
  [K in keyof ReceiptsConfig]?: ReceiptsConfig[K] extends (...args: never[]) => unknown
    ? ReceiptsConfig[K]
    : ReceiptsConfig[K] extends object
      ? Partial<ReceiptsConfig[K]>
      : ReceiptsConfig[K];
};

/** Identity helper so config files get type checking and autocomplete. */
export function defineConfig(config: PartialConfig): PartialConfig {
  return config;
}

export function mergeConfig(base: ReceiptsConfig, override: PartialConfig): ReceiptsConfig {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const current = (base as unknown as Record<string, unknown>)[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current &&
      typeof current === "object" &&
      !Array.isArray(current)
    ) {
      out[key] = { ...(current as object), ...(value as object) };
    } else {
      out[key] = value;
    }
  }
  return out as unknown as ReceiptsConfig;
}

export interface LoadedConfig {
  config: ReceiptsConfig;
  /** Absolute path of the file it was loaded from, if any. */
  file?: string;
  /** Directory relative paths are resolved against. */
  root: string;
}

export async function loadConfig(
  cwd: string = process.cwd(),
  explicit?: string,
): Promise<LoadedConfig> {
  const candidates = explicit ? [resolve(cwd, explicit)] : CONFIG_FILES.map((f) => resolve(cwd, f));
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    let loaded: PartialConfig;
    if (file.endsWith(".json")) {
      loaded = JSON.parse(readFileSync(file, "utf8")) as PartialConfig;
    } else {
      try {
        const mod = (await import(pathToFileURL(file).href)) as { default?: PartialConfig };
        loaded = mod.default ?? (mod as PartialConfig);
      } catch (err) {
        const hint = /\.m?ts$/.test(file)
          ? " TypeScript configs need Node 22.18+ (built-in type stripping). Rename it to receipts.config.mjs on older Node versions."
          : "";
        throw new Error(`Could not load ${file}: ${(err as Error).message}.${hint}`);
      }
    }
    return { config: mergeConfig(DEFAULT_CONFIG, loaded), file, root: resolve(file, "..") };
  }
  if (explicit) throw new Error(`Config file not found: ${explicit}`);
  return { config: DEFAULT_CONFIG, root: cwd };
}

export function asOf(config: ReceiptsConfig): Date {
  if (config.asOf) {
    const d = new Date(config.asOf);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

export const CONFIG_TEMPLATE = `// Receipts configuration. Everything here is optional; these are the defaults
// unless noted. Docs: https://github.com/akhsterminator/receipts#configuration
export default {
  project: "__PROJECT__",

  // Where verified evidence is stored. Commit it (it is redacted) so CI can check specs.
  store: ".receipts",

  // "auto" uses Claude when ANTHROPIC_API_KEY is set, otherwise the offline heuristic.
  // "ollama" keeps everything on your machine.
  extractor: "auto",
  clusterer: "auto",
  claude: { model: "claude-opus-5-5", effort: "medium" },
  ollama: { host: "http://127.0.0.1:11434", model: "llama3.1" },

  privacy: {
    redact: true,
    patterns: [],          // extra regexes to scrub, e.g. "ACME-\\\\d{6}"
    allow: [],             // capitalised words that are NOT names, e.g. your product name
  },

  // Your team's names in transcripts. Their turns are never quoted as evidence.
  interviewers: [],

  // How much each customer segment matters. Unlisted segments get \`default\`.
  segments: {
    weights: { enterprise: 1.5, team: 1.2, pro: 1, free: 0.6 },
    default: 1,
  },

  scoring: { halfLifeDays: 120, minQuotes: 2, similarity: 0.2 },

  // The priority formula is yours to edit. Factors:
  //   reach          log2(1 + distinct customers) + 0.5 · log2(1 + upvotes)
  //   intensity      0..1, how strongly people feel (pain words, "deal-breaker", caps…)
  //   segmentWeight  average weight of the customers' segments
  //   recency        0..1, exponential decay with halfLifeDays
  score: ({ breakdown: b }) =>
    10 * b.reach * (0.5 + b.intensity) * b.segmentWeight * (0.5 + 0.5 * b.recency),

  check: {
    minCustomers: 2,       // "loudest voice" warning below this
    staleAfterDays: 365,
    requireMetric: true,
    maxBetShare: 0.5,
    strict: false,         // true = warnings fail CI too
  },
};
`;
