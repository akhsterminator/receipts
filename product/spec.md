# Receipts: product spec

<!-- This spec is checked on every pull request: `receipts check product/spec.md --store product/.receipts`.
     Evidence lives in product/.receipts, built from product/evidence/ (public GitHub issues) and,
     as discovery interviews happen, product/interviews/. -->

> **Status, 25 Nov 2026:** 4 requirements cite public evidence, 4 are explicit bets.
> The evidence so far comes from public GitHub issues on Spec Kit, written by people building with spec-driven development. They are adjacent users, not yet the PMs Receipts is for. The 10 discovery interviews in [`interviews/`](interviews/) exist to turn the bets below into receipts, or to kill them.
>
> Read the evidence for any requirement with `npx @hashimua/receipts why R1 --spec product/spec.md --store product/.receipts`.

## R1. Check a spec in CI and block it when a requirement has no evidence

because: [Q-0032, Q-0003]  # 2 people · Spec Kit issues #4290, #385
metric: 50% of repos that add the GitHub Action still run it 30 days later (measured by public workflow search)

People building with coding agents want a gate between "spec written" and "agent builds", and want it to stop rather than guess when the evidence is thin.

> "when evidence is insufficient, an evaluator should be able to request clarification, evidence gathering, abstention, escalation, iteration, or blocking rather than inventing certainty;" — Q-0032

## R2. Hand an evidence-backed spec to Spec Kit without retyping it

because: [Q-0010, Q-0012, Q-0025, Q-0026, Q-0028]  # 3 people · issues #1527, #1116, #1047
metric: 30% of people who reach a cited spec also export it (asked in the post-run survey; Receipts has no telemetry)

Teams already have product documents and want them to flow into spec-driven tools instead of being copied by hand.

> "Users manually find features in their PRD, then run" — Q-0012

## R3. Trace every requirement to the evidence behind it, so specs and code don't drift from intent

because: [Q-0001, Q-0006, Q-0008, Q-0018, Q-0021]  # 4 people · issues #4383, #2176, #4156, #4031
metric: In 5 usability sessions, PMs answer "why does R3 exist?" in under 30 seconds with `receipts why`

> "Before modifying a spec, there's no way to preview the downstream impact." — Q-0006

## R4. Let non-technical stakeholders read the evidence behind a spec

because: [Q-0023, Q-0024]  # 1 person · issue #1692
metric: 3 of 5 interviewed PMs say they would send the evidence map to a stakeholder

Only one person has asked for this, so `receipts check` flags it as a loudest-voice risk. It stays in because the evidence map is cheap (it is a by-product of the pipeline) and the interviews will test it directly. If no interviewed PM wants it, it gets cut.

> "Currently no way to generate customer-facing or management-facing documentation from specs" — Q-0024

## R5. Verify every quote word for word against its source, and drop anything that doesn't match

bet: The core thesis. PMs will not trust AI synthesis that can invent a quote, and one invented quote in a spec discredits the whole document. No customer has said this to us yet. Interview question 6 tests it; if PMs don't care where quotes come from, Receipts is a feature, not a product.
metric: 0 unverified quotes in any shipped evidence store (enforced by `receipts verify` in CI)

## R6. Remove personal data on the user's machine before anything is stored or sent to a model

bet: Nobody can put real support tickets into a tool that leaks customer emails, so this is table stakes. To validate: interview question 8 (who would need to approve this?) and a security review by one outside engineer before 1.0.
metric: 0 personal-data leaks reported; redaction recall ≥ 95% on a labelled test set

## R7. Build a cited roadmap from any public repo with one command

bet: `npx @hashimua/receipts github owner/repo` is the acquisition channel: zero setup, instantly shareable, and every famous repo is a post. To validate: launch posts in [launch.md](launch.md); success is the metric below.
metric: 300 GitHub stars and 100 weekly npm downloads within 60 days of Show HN

## R8. Let coding agents ask why a requirement exists while they build

bet: An agent that can read the customer evidence (MCP `why`, `search_evidence`) resolves ambiguity in the customer's favour instead of guessing, which addresses the drift in R3. To validate: run the same spec with and without the MCP server on 3 tasks and compare what gets built.
metric: In 2 of 3 paired tasks, reviewers prefer the build made with evidence access
