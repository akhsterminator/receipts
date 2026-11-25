# Problem

## In one sentence

AI coding agents now build directly from specs, and nothing checks that what's in a spec came from customers.

## Who it's for

**Primary: the product manager at a 10–200 person software company who writes specs that engineers or coding agents build from.** They have plenty of customer feedback (support tickets, sales notes, app reviews, interview recordings, GitHub issues) and not enough time to read it. Their spec is the last document anyone reads before code gets written.

**Secondary:**
- **Founders and tech leads who do the PM job without the title.** They write the spec in Claude Code or Cursor themselves and want proof they aren't building for one loud customer.
- **Engineers and agents implementing a spec.** They need to know *why* a requirement exists to make good calls on the 50 details the spec doesn't cover.

**Not for (yet):** research teams with a dedicated repository tool (Dovetail, Condens) and a mature synthesis practice. They have the evidence; their problem is distribution, not provenance.

## The job

> When I'm writing a spec that will be built quickly, possibly by an agent, I want each requirement tied to what customers actually said, so I can defend priorities, catch my own bias, and give the builder the context to make good decisions.

## What happens today

1. Feedback lives in five tools. The PM skims some of it, remembers the vivid bits, and writes the spec from memory.
2. Some teams paste feedback into ChatGPT or Claude and ask for themes. The summary reads well, but there's no way to check if a quote is real, how many customers said it, or whether it was the interviewer talking.
3. The spec goes into Spec Kit, Linear or a coding agent. The link back to customers is gone. Six weeks later nobody can say why R4 exists.

The failure modes are well known to anyone who has done the job:
- **Loudest voice:** one big customer's request becomes a roadmap item.
- **Stale evidence:** "customers want X" was true 18 months ago.
- **Invented certainty:** an LLM summary turns a passing remark into a theme, or a paraphrase into a quote.
- **Untraceable decisions:** requirements nobody can justify, so they never get cut.

## Why now

- **Specs became executable.** GitHub Spec Kit, Claude Code, Cursor and Kiro turn a Markdown spec into code in an afternoon. A wrong requirement used to cost a sprint of review; now it ships before anyone notices.
- **LLMs made synthesis cheap, and unverifiable.** Anyone can generate "top 10 customer themes". Nobody can check them. Verification, not generation, is the scarce part.
- **The spec-driven ecosystem is asking for it.** Spec Kit users ask for evidence gates, PRD import and traceability (see [spec.md](spec.md) R1–R3), and at least one extension ([Keel Discovery](competitive.md#keel-discovery)) has started on discovery evidence.

## What Receipts believes (and how we'd know we're wrong)

| Belief | Status | What would prove it wrong |
| --- | --- | --- |
| PMs want each requirement linked to customer evidence | Partly evidenced (spec R3) | Interviewed PMs say linking is busywork they'd skip |
| Verified, word-for-word quotes matter more than a good summary | **Bet** (spec R5) | PMs accept paraphrased "quotes" from LLMs without concern |
| A CI check on specs is welcome, not annoying | Partly evidenced (spec R1) | Teams disable the Action within 2 weeks |
| Local-first PII removal is required to get real data in | **Bet** (spec R6) | PMs happily paste tickets into cloud tools today without approval |
| A zero-setup GitHub demo drives adoption | **Bet** (spec R7) | Show HN post gets < 50 stars |

## Success, six months out

- 10 discovery interviews done and in the evidence store; the spec has fewer bets than citations.
- 1,000 GitHub stars, 300 weekly npm downloads.
- 20 public repos running the `receipts check` Action.
- 3 teams using it on real customer feedback who would be "very disappointed" if it went away (Sean Ellis test).
