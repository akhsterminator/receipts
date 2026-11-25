# How quotes are verified

Receipts' whole promise rests on one rule: **a quote is stored only if it appears, word for word, in its source.** This page explains exactly what that means, so you can decide whether to trust it.

## The pipeline

```
feedback file ──▶ redact PII ──▶ Source.text (stored) ──▶ extractor proposes quotes ──▶ verify ──▶ Quote (stored)
                                        ▲                                                │
                                        └──────────── re-verified on every `check` ◀─────┘
```

1. **Ingestion** removes personal data and stores the redacted text as the source, with a SHA-256 hash of that text. Nothing un-redacted is ever written.
2. **An extractor proposes candidate quotes.** The offline extractor proposes literal sentence spans. Claude and Ollama propose text that the model *says* is verbatim. Either way, a proposal is only a proposal.
3. **Verification** searches for the candidate inside the source text. If it isn't there, it's dropped and reported (`dropped 3 quotes that did not appear word for word`; set `RECEIPTS_DEBUG=1` to list them).
4. **What gets stored** is the *exact* original substring, its character offsets, its line number and its own SHA-256 hash. The model's version of the text is discarded.
5. **Every `receipts check` re-verifies** each cited quote: the source's hash must match its text, the quote's hash must match its text, and the text must still sit at its offsets (or, if a source was re-ingested, still appear in it).

## What counts as "word for word"

Verification ignores three kinds of difference. None of them changes what someone said:

| Allowed | Example |
| --- | --- |
| Whitespace runs, including line breaks | `export to Excel —⏎which` matches `export to Excel — which` |
| Typographic variants | curly vs straight quotes (`“fine”` / `"fine"`), en/em dashes vs hyphens, `…` vs `...`, non-breaking spaces |
| Unicode compatibility forms (NFKC) | full-width `Ｅｘｃｅｌ` matches `Excel` |

Everything else must match exactly:

| Rejected | Why |
| --- | --- |
| `I cannot export` for `I can't export` | Paraphrase |
| `i can't export to excel` | Capitalisation differs (reported separately, since models often do this) |
| `I can't export to Excel... every Friday` | An ellipsis stitching distant words together changes meaning |
| Fixing a typo the customer made | It's their words, typos included |
| A sentence the interviewer said | Interviewer turns are excluded from evidence, even if the text matches |
| A span crossing two speakers' turns | One quote, one speaker |

## In specs

Inline quotes in a spec are checked too:

```md
> "Downloading a few classes the night before would be perfect." — Q-0092
```

If the text doesn't match what Q-0092 actually says, `receipts check` fails with the real wording:

```
✗ R4 misquotes Q-0092. The customer said: "Downloading a few classes the night before would be ideal."
```

## What verification does *not* guarantee

- **That the quote means what the requirement says it means.** A real quote can still be cited for the wrong reason. That's what `receipts why` and code review are for.
- **That the source is genuine.** Receipts proves a quote is in the file you gave it, not that the file is honest.
- **That a cluster is right.** Clustering groups quotes by similarity; a PM should read the evidence before citing it.

## Tamper evidence

Because sources and quotes carry hashes, editing `.receipts/quotes.json` or `sources.jsonl` by hand shows up immediately:

```
✗ Q-0031 cannot be verified: the quote text was edited after verification
✗ Q-0040 cannot be verified: its source src_1ea7… was edited after ingestion
```

Run `receipts verify` to re-check the whole store; CI runs it on Receipts' own evidence.
