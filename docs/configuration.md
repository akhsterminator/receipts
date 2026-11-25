# Configuration

`npx @hashimua/receipts init` writes a commented `receipts.config.ts`. Every field is optional. Receipts looks for `receipts.config.ts`, `.mts`, `.js`, `.mjs` or `.json` in the working directory, or use `--config <file>`.

> TypeScript configs use Node's built-in type stripping (Node 22.18+). On Node 20, name the file `receipts.config.mjs`; the content is the same.

```ts
export default {
  project: "Tempo",                 // shown in specs and the evidence map; also ignored when clustering
  store: ".receipts",               // evidence store, relative to the config file

  extractor: "auto",                // auto | claude | ollama | heuristic
  clusterer: "auto",                // auto | claude | heuristic
  claude: { model: "claude-opus-5-5", effort: "medium", maxQuotesPerSource: 12 },
  ollama: { host: "http://127.0.0.1:11434", model: "llama3.1" },

  privacy: {
    redact: true,
    patterns: ["ACME-\\d{6}"],      // extra regexes to scrub as [REDACTED]
    allow: ["Tempo", "Garmin"],     // capitalised words that are not names
  },

  interviewers: ["Alex", "Sam"],    // your team; their transcript turns are never quoted

  segments: {
    weights: { enterprise: 1.5, team: 1.2, pro: 1, free: 0.6 },
    default: 1,
  },

  scoring: {
    halfLifeDays: 120,              // evidence this old counts half as much
    minQuotes: 2,                   // smallest cluster that counts as an opportunity
    similarity: 0.2,                // heuristic clustering threshold (higher = tighter clusters)
    ignore: ["app"],                // extra words to ignore when clustering
  },

  // Your priority formula. Return a number; higher is more important.
  score: ({ breakdown: b, opportunity }) =>
    10 * b.reach * (0.5 + b.intensity) * b.segmentWeight * (0.5 + 0.5 * b.recency),

  check: {
    minCustomers: 2,
    staleAfterDays: 365,
    requireMetric: true,
    maxBetShare: 0.5,
    strict: false,
  },

  asOf: "2026-11-20",               // pin "today" for reproducible output
};
```

## Engines

| `extractor` | What happens | Data leaves your machine? |
| --- | --- | --- |
| `auto` (default) | Claude if `ANTHROPIC_API_KEY` (or `ANTHROPIC_AUTH_TOKEN`) is set, otherwise heuristic | Only with a key |
| `claude` | Claude via the official SDK, structured JSON output, server-side refusal fallback; small sources are batched to keep cost down | Redacted text, to Anthropic |
| `ollama` | Any local model with JSON-schema output | No |
| `heuristic` | Deterministic sentence scoring with linguistic signals. Instant and free, but cruder: it can't tell "freeze my membership" from "the app freezes" | No |

Whatever the engine, every quote goes through the same [verification](verification.md).

## Score factors

| Factor | Definition |
| --- | --- |
| `reach` | `log2(1 + distinct customers) + 0.5 · log2(1 + upvotes)`. Upvotes count fully only when the opportunity contains the issue itself |
| `intensity` | 0–1. Each customer's strongest quote (pain words, "deal-breaker", threats to churn, caps, `!!`), averaged across customers so repetition doesn't inflate it |
| `segmentWeight` | Average of `segments.weights` over customers |
| `recency` | Mean of `0.5^(age / halfLifeDays)` over dated quotes; 1 if undated. For open GitHub issues, age is from the last activity |

## Ingestion flags

Column detection handles common Zendesk, Intercom, app-store, survey and GitHub exports, and most others with a recognisable "body", "message", "review" or "comment" column. When it guesses wrong:

```bash
receipts ingest export.csv --text-col "Message,Notes" --customer-col "Account ID" \
  --segment-col "Plan" --date-col "Opened" --kind ticket
receipts ingest calls/ --segment enterprise      # tag a whole batch
```

Transcripts can carry front matter (`.txt`, `.md`) or a `NOTE` block (`.vtt`):

```
---
participant: P7
segment: Enterprise
date: 2026-09-01
interviewer: Alex
---
Alex: Tell me about the last time…
```

A date in the file name (`p07-2026-09-01.vtt`) is used when there's no `date:`.
