# Receipts, run as a product

This folder is how Receipts is managed: the problem, the evidence, the decisions and the numbers, in public and in version control. It uses Receipts on itself.

| File | What it's for | Updated |
| --- | --- | --- |
| [problem.md](problem.md) | Who it's for, the job, why now, what would make this wrong | When the strategy changes |
| [spec.md](spec.md) | Receipts' own spec, every requirement cited or marked `bet:`, checked in CI | Every release |
| [interviews/](interviews/) | Discovery plan, interview guide, consent and anonymisation protocol | After each interview |
| [evidence/](evidence/) | Public evidence (GitHub issues) behind the spec | When evidence is added |
| [competitive.md](competitive.md) | The landscape and where Receipts is different | Monthly |
| [decisions.md](decisions.md) | Dated log of trade-offs and why | As decisions are made |
| [metrics.md](metrics.md) | Stars, installs, activation; updated weekly by a workflow | Weekly (automatic) |
| [roadmap.md](roadmap.md) | Now / next / later, tied to the bets in the spec | Every release |
| [launch.md](launch.md) | Launch plan and the posts | Before launch |

## How the loop works

```
interviews/raw/  ──(receipts ingest, PII removed)──▶  .receipts/  ◀── evidence/ (public issues)
                                                          │
                                   receipts run / receipts why / receipts view
                                                          ▼
                                                      spec.md ──▶ CI: receipts check
```

1. Every discovery interview is recorded with consent, transcribed, and dropped into `interviews/raw/` (gitignored, never committed).
2. `npx @hashimua/receipts ingest interviews/raw --store product/.receipts --segment pm` removes personal data and stores the redacted transcript.
3. New evidence either moves a `bet:` in `spec.md` to a cited `because:`, or kills it. Either outcome goes in `decisions.md`.
4. CI runs `receipts check product/spec.md` on every pull request, so the spec can't drift from its evidence.

## Where things stand (25 Nov 2026)

- **Evidence:** 11 public GitHub issues from Spec Kit users, 33 verified quotes. **0 of 10** PM interviews done.
- **Spec:** 4 of 8 requirements cited, 4 explicit bets. The core thesis (R5: verified quotes matter to PMs) is still a bet.
- **Biggest risk:** PMs may not care where a quote came from as long as the summary looks right. Interviews test this first.
- **Biggest surprise:** [Keel Discovery](competitive.md#keel-discovery), a Spec Kit extension with a similar evidence-gate idea, already exists. See the decision log entry for 25 Nov.
