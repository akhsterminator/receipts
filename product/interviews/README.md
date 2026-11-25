# Discovery interviews

**Status: 0 of 10 done.** This folder holds the plan. Redacted transcripts go into the evidence store (`product/.receipts`), never into git as raw files.

## What we need to learn

Ranked by how much each answer could change the product:

1. **Do PMs care where a quote came from?** (spec R5, the core thesis) If a confident summary is enough, verification is a feature nobody pays attention to.
2. **Where does feedback actually live, and can they get it out?** Decides which connectors matter (R2, roadmap "Next").
3. **Would they put a check between the spec and the build?** Or is CI the wrong place for a PM tool? (R1)
4. **Who has to approve customer data leaving their machine?** (R6)
5. **Do stakeholders ever ask "why are we building this?"**, and what do PMs show them? (R4)

## Who

| # | Profile | Why | Where to find them |
| --- | --- | --- | --- |
| 1–4 | PM at a 10–200 person SaaS company, writes specs weekly | Primary user | LinkedIn 2nd-degree, Lenny's community, Mind the Product |
| 5–6 | Founder or tech lead doing PM work, builds with Claude Code or Cursor | Writes specs agents build from | r/ClaudeAI, Spec Kit discussions, indie hacker communities |
| 7–8 | PM who has used Dovetail, Productboard or similar | Knows the alternatives, can say what's missing | LinkedIn, ProductHunt reviewers |
| 9 | Engineer who has implemented a spec they disagreed with | The "why does R4 exist?" pain from the builder's side | Personal network |
| 10 | Spec Kit extension author (e.g. Keel Discovery) | Adjacent builder; possible partner | GitHub |

**Screener (all must be yes for 1–8):** wrote or edited a product spec in the last month; has access to raw customer feedback (tickets, calls, reviews); not a current Receipts contributor.

## Protocol

- 30 minutes, video, recorded with explicit consent (script below). Notes if recording is declined.
- Ask about **past behaviour**, not opinions about Receipts. Show the tool only in the last 8 minutes.
- Transcribe (Zoom/Meet `.vtt` export is fine), save as `raw/P01-YYYY-MM-DD.vtt`. `raw/` is gitignored.
- Ingest immediately, then delete the raw file once checked:

  ```bash
  npx @hashimua/receipts ingest product/interviews/raw/P01-2026-12-02.vtt \
    --store product/.receipts --segment pm   # or founder, engineer…
  npx @hashimua/receipts extract --store product/.receipts
  npx @hashimua/receipts synthesize --store product/.receipts
  ```

  Speaker names become "Interviewer" / "Participant"; emails, phones and names are removed before anything is written. Check with `receipts sources --store product/.receipts`.
- After each interview: update the bets in [`../spec.md`](../spec.md) (cite or keep as bet), and log anything surprising in [`../decisions.md`](../decisions.md).

### Consent script

> "Thanks for doing this. I'd like to record so I can quote you accurately. The recording stays on my machine; I'll keep a transcript with your name, company and any personal details removed, and it may be quoted, anonymously, in Receipts' public product docs. You can stop or withdraw at any point, including afterwards. Is that OK?"

## Interview guide

**Warm-up (3 min)**
1. What are you working on right now, and what's the next thing your team will build?

**How specs get written (10 min)**
2. Tell me about the last spec or PRD you wrote. Walk me through how it came together, from the first idea to the version engineers built from.
3. Where did the customer input for it come from? Can you show me (screen-share) where that feedback lives?
4. When you wrote a requirement, how did you decide it belonged in the spec? What did you look at?
5. Has a requirement ever been challenged ("why are we building this?")? What happened? What did you show them?

**Trust in evidence (8 min)**
6. Have you used ChatGPT, Claude or a tool's AI feature to summarise feedback? What did you do with the output? Did you check any of it? *(R5: listen for whether provenance matters unprompted.)*
7. Tell me about a time a decision was driven by one loud customer. How did you find out?
8. If you wanted to run a tool over your support tickets, who would need to approve that? *(R6)*

**Building with agents (4 min)**
9. Does anyone on your team build directly from specs with Claude Code, Cursor, Copilot or Spec Kit? How has that changed how much detail goes in the spec?
10. When an engineer or agent hits something the spec doesn't cover, what happens?

**Reaction (5 min, only now show Receipts)**
11. Show `receipts check` output on the demo spec. "What's your first reaction? What would you do next?"
12. "If this ran on every spec PR, what would annoy you?"
13. "Who else should I talk to?"

**Don't ask:** "Would you use this?", "Would you pay for this?", or any question that describes the solution before question 11.

## Synthesis

Synthesis is Receipts itself: interview quotes become evidence, cluster into opportunities, and either cite a requirement or don't. A 2×2 of "pain frequency × willingness to change workflow" goes in `synthesis.md` after interview 5 and again after interview 10.
