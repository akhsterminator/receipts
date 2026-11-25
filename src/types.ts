/**
 * Core data model.
 *
 * The pipeline is: Source → Quote → Opportunity → Requirement.
 * Every arrow is traceable: a requirement cites quote IDs, a quote stores the
 * exact character offsets of its text inside a (redacted) source, and the
 * source stores a hash of that text so tampering is detectable.
 */

export type SourceKind = "interview" | "ticket" | "review" | "issue" | "survey" | "note";

export interface SourceTurn {
  /** Character offset (inclusive) in `Source.text`. */
  start: number;
  /** Character offset (exclusive) in `Source.text`. */
  end: number;
  /** Pseudonymised speaker label, e.g. "Interviewer" or "Participant". */
  speaker: string;
  /** Interviewer turns are never mined for evidence. */
  role: "interviewer" | "customer";
}

export interface Source {
  /** Stable, content-independent ID derived from where the source came from. */
  id: string;
  kind: SourceKind;
  title: string;
  /** Where it came from: a relative path (optionally `#row`) or a URL. */
  origin: string;
  /** Pseudonymous customer ID (salted hash). Never a real identifier. */
  customer: string;
  segment?: string;
  /** ISO-8601 date the feedback was given. */
  date?: string;
  /** The redacted text. Quotes are verified against exactly this string. */
  text: string;
  /** sha256 of `text`. */
  sha256: string;
  /** Number of PII spans removed during ingestion. */
  redactions: number;
  /** For transcripts: who said what. Absent means the whole text is the customer's. */
  turns?: SourceTurn[];
  meta?: {
    url?: string;
    votes?: number;
    labels?: string[];
    rating?: number;
    [key: string]: unknown;
  };
}

export type QuoteKind = "pain" | "request" | "praise" | "question" | "other";

export type Extractor = "heuristic" | "claude" | "ollama";

export interface Quote {
  /** Stable, human-friendly ID such as `Q-0142`. */
  id: string;
  sourceId: string;
  /** Verbatim text, exactly as it appears in `Source.text[start:end]`. */
  text: string;
  start: number;
  end: number;
  /** 1-based line number in the source, for humans. */
  line: number;
  kind: QuoteKind;
  /** 0..1. How strongly the customer feels about this. */
  intensity: number;
  customer: string;
  segment?: string;
  date?: string;
  /** sha256 of the quote text, so a citation can be checked without the source. */
  sha256: string;
  extractor: Extractor;
}

export interface ScoreBreakdown {
  reach: number;
  intensity: number;
  segmentWeight: number;
  recency: number;
}

export interface OpportunityStats {
  quotes: number;
  customers: number;
  segments: Record<string, number>;
  kinds: Partial<Record<QuoteKind, number>>;
  votes: number;
  firstSeen?: string;
  lastSeen?: string;
}

export interface Opportunity {
  /** Stable ID such as `O-07`. */
  id: string;
  title: string;
  /** Jobs-to-be-done framing: "When …, I want to …, so I can …". */
  job?: string;
  theme: string;
  keywords: string[];
  quoteIds: string[];
  /** The single quote that best represents the cluster. */
  representativeQuoteId: string;
  stats: OpportunityStats;
  score: number;
  breakdown: ScoreBreakdown;
  /** Written requirement suggestion (from an LLM, or a heuristic draft). */
  requirement?: { title: string; metric?: string; rationale?: string };
}

export interface StoreMeta {
  version: 1;
  createdAt: string;
  updatedAt: string;
  /** `${sourceId}:${sha256(text)}` → quote ID. Keeps IDs stable across re-runs. */
  quoteIndex: Record<string, string>;
  nextQuote: number;
  /** Opportunity key (sorted representative-quote fingerprint) → ID. */
  opportunityIndex: Record<string, string>;
  nextOpportunity: number;
  /** sourceId → `${extractor}:${sourceSha}` of the last extraction, for incremental runs. */
  extracted?: Record<string, string>;
  lastRun?: {
    at: string;
    extractor: Extractor;
    clusterer: "heuristic" | "claude";
    dropped: number;
  };
}

/* ---------- Spec model ---------- */

export interface Citation {
  id: string;
  line: number;
}

export interface InlineQuote {
  id: string;
  text: string;
  line: number;
}

export interface Requirement {
  id: string;
  title: string;
  line: number;
  because: Citation[];
  /** Raw `because:` line was present (even if empty). */
  hasBecause: boolean;
  bet?: { reason: string; line: number };
  metric?: { text: string; line: number };
  owner?: string;
  /** Blockquotes of the form `> "…" — Q-0142` found under this requirement. */
  inlineQuotes: InlineQuote[];
}

export interface ParsedSpec {
  path: string;
  title?: string;
  requirements: Requirement[];
}

export type Severity = "error" | "warning" | "info";

export interface Finding {
  severity: Severity;
  rule: string;
  message: string;
  requirement?: string;
  quote?: string;
  line?: number;
}

export interface CheckResult {
  spec: string;
  findings: Finding[];
  summary: {
    requirements: number;
    cited: number;
    bets: number;
    uncited: number;
    citedQuotes: number;
    verifiedQuotes: number;
    unverifiedQuotes: number;
    customers: number;
  };
  ok: boolean;
}
