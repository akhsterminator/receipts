# Contributing

Thanks for helping. Receipts is small on purpose: a handful of dependencies, plain JSON storage, no build step for users.

## Setup

```bash
git clone https://github.com/akhsterminator/receipts && cd receipts
npm install
npm test            # vitest, ~1s
npm run typecheck
npm run build       # → dist/
node dist/cli.js demo
```

During development, `npm run dev -- <command>` runs the CLI from source with tsx.

## Where things are

| Path | What |
| --- | --- |
| `src/ingest/` | File formats → `Source` records. CSV, JSON, transcripts, `.docx`, GitHub issues |
| `src/privacy.ts` | PII redaction and pseudonyms |
| `src/verify.ts` | Word-for-word quote verification. **The trust anchor; changes here need tests** |
| `src/extract/` | Heuristic and model extractors. Both feed `verifyCandidates` |
| `src/synthesize/` | TF-IDF clustering, themes, scoring, optional model clustering |
| `src/spec/` | Spec grammar (`parse.ts`), the checker (`check.ts`), output formats, the spec writer |
| `src/view.ts` | The evidence map (one HTML file, no dependencies) |
| `src/mcp.ts` | MCP server |
| `examples/tempo/` | Fictional demo data. Regenerate with `python3 scripts/make-tempo-data.py`, then `node scripts/build-demo-spec.mjs` |
| `product/` | How Receipts itself is run as a product. Its spec is checked in CI |

## Ground rules

- **Never weaken verification.** A quote is either a span of its source or it isn't stored. If a model output can't be verified, drop it and report it.
- **Never store un-redacted text.** Redaction happens at ingestion, before anything touches disk.
- **Determinism:** the heuristic path must give identical output for identical input (tests rely on it).
- **New feature? Say which requirement in `product/spec.md` it serves, or argue for a new bet.** Yes, really.

## Releasing

1. Update `CHANGELOG.md` and the version in `package.json`.
2. `git tag v0.x.y && git push --tags`. The release workflow publishes to npm with provenance and moves the `v0` tag for the Action.
