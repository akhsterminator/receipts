# Decision log

Newest first. Each entry: what we decided, what we gave up, and what would make us revisit it.

---

### 2026-11-25 · Keel Discovery exists; position Receipts as evidence-first, not hypothesis-first

**Context:** While mining Spec Kit issues for evidence, found [Keel Discovery](competitive.md#keel-discovery), an extension that gates specs on interview evidence, including single-source evidence. The original competitive scan missed it.
**Decision:** Keep building. Position Receipts on the feedback teams *already have* at volume (tickets, reviews, issues), deterministic quote verification and CI, rather than on running new interviews. Treat Keel as a possible partner, not only a competitor.
**Trade-off:** We give up the "first evidence gate for Spec Kit" story.
**Revisit if:** Keel adds bulk ingestion and deterministic verification, or interviewed PMs say they start from hypotheses, not from existing feedback.

### 2026-11-25 · Cite only customer-voiced evidence in our own spec

**Context:** Several matching Spec Kit issues were extension *submissions*: authors describing their own product ("Missing or inconsistent required evidence fails closed").
**Decision:** Those are not customer needs, so they aren't cited. Only issues where someone asks for something, or describes a problem they have, count as evidence.
**Trade-off:** Fewer citations; R4 rests on one person and shows a loudest-voice warning in CI.
**Revisit if:** Never. This is the standard the product asks of its users.

### 2026-11-25 · No telemetry. Measure activation by proxy

**Context:** The activation metric ("share of installs that reach a cited spec") would normally come from product analytics.
**Decision:** Receipts sends nothing anywhere. Activation is estimated from public signals: repos using the Action (code search), `receipts.config.ts` files on GitHub, and a voluntary one-question survey link printed after the first successful run.
**Trade-off:** Noisy, lagging metrics. We will not know about private usage.
**Revisit if:** Users ask for opt-in usage stats, or the proxies diverge badly from what interviews tell us.

### 2026-11-25 · Evidence store is plain JSON files, not SQLite

**Context:** The original plan used SQLite.
**Decision:** `.receipts/` is JSONL and JSON, sorted and pretty-printed so it can be committed.
**Why:** The store must be committed for the CI check to verify quotes. Text files diff in pull requests ("this PR adds 14 quotes from the October tickets"), need no native modules (so `npx` works everywhere), and are readable by anyone.
**Trade-off:** Slower above ~50k quotes; no ad hoc SQL.
**Revisit if:** A real user's store exceeds 50k quotes or 50 MB.

### 2026-11-25 · Ship an offline extractor alongside Claude

**Context:** Model-based extraction is better, but needs an API key, costs money, and sends data out.
**Decision:** Default is `auto`: Claude (`claude-opus-5-5`) when `ANTHROPIC_API_KEY` is set, otherwise a deterministic heuristic extractor. Ollama is supported for local models.
**Why:** The zero-setup demo (`npx … demo`, `npx … github`) must work in 10 seconds with no key. Deterministic output also makes tests and CI reproducible.
**Trade-off:** Heuristic clusters are cruder (it can't tell "freeze my membership" from "the app freezes"). The README says so.
**Revisit if:** A small local model gets good enough to bundle.

### 2026-11-25 · `bet:` is a first-class citizen, not a failure

**Context:** A strict "every requirement must cite evidence" rule would push PMs to cite weak evidence just to pass CI.
**Decision:** A requirement can be marked `bet: <reason>`. Bets pass the check, are counted in the summary, and trigger a warning only when they exceed 50% of the spec.
**Why:** Good PMs make deliberate bets. The tool should make them visible and owned, not forbidden.
**Trade-off:** Someone can mark everything a bet. The share warning and the summary line make that visible in review.

### 2026-11-25 · Priority formula lives in user config

**Decision:** `score = 10 × reach × (0.5 + intensity) × segmentWeight × (0.5 + 0.5 × recency)`, overridable as a function in `receipts.config.ts`. Every factor is shown next to every score.
**Why:** Prioritisation arguments should happen in a code review of a formula, not in a meeting about a black box.
**Trade-off:** Users can make the formula say anything. That's their call, and it's visible in git history.

### 2026-11-25 · Quotes are verified against the redacted text

**Decision:** PII is removed at ingestion; quotes are verified against the redacted source, never the original.
**Why:** Nothing un-redacted is ever stored, so nothing un-redacted can leak through the store, the viewer or a model call.
**Trade-off:** A quote containing a redacted name reads "[NAME] said…". Acceptable.
