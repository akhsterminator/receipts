# Launch plan

**Goal:** 300 stars and 100 weekly installs in 30 days, and 10 PMs willing to do a discovery interview.
**Hook:** run Receipts on a famous repo's issues and publish what users actually want, with every claim linked to a real issue.

## Before launch

- [ ] `npm publish --access public` (`@hashimua/receipts`), tag `v0.1.0`, create the GitHub release
- [ ] Deploy `site/` to Vercel (see README), point the repo's website field at it
- [ ] Upload `.github/social-preview.png` in repo Settings → Social preview
- [ ] Set the repo description and topics (README → "Repo setup")
- [ ] Run `receipts github` on 5 famous repos; pick the 2 most surprising results for posts
- [ ] Ask 3 people to try `npx @hashimua/receipts demo` cold and watch where they get stuck

## Sequence

| Day | Channel | Post |
| --- | --- | --- |
| Tue | Hacker News (Show HN), 8–9am US Eastern | Post A |
| Tue | r/ProductManagement, r/ClaudeAI | Post C (PM angle), Post A (builder angle) |
| Wed | LinkedIn | Post B |
| Thu | Lenny's community, Mind the Product Slack | Post C, shortened |
| Fri | PRs to awesome lists: awesome-mcp-servers, Spec Kit community extensions, awesome-product-management | — |
| Week 2 | "I ran Receipts on N famous repos" follow-up | Post D |

## Post A: Show HN

> **Show HN: Receipts – every requirement in a spec cites a verified customer quote**
>
> Coding agents now build straight from specs (Spec Kit, Claude Code, Cursor), so the spec is the most important thing a PM writes. Nothing checks that a requirement came from customers.
>
> Receipts takes customer feedback (tickets, reviews, interview transcripts, GitHub issues), extracts quotes, and checks every quote appears word for word in its source. A model can propose quotes but can't invent them; anything that doesn't match is dropped. It clusters quotes into opportunities with a scoring formula you can edit, writes a Markdown spec where each requirement cites quote IDs, and `receipts check` lints any spec in CI: no evidence → error, one customer → "loudest-voice" warning, 14-month-old quote → stale warning, misquote → error. You can mark a requirement `bet:` to build it deliberately without evidence.
>
> Try it without setup: `npx @hashimua/receipts github excalidraw/excalidraw` gives a ranked, cited roadmap from the repo's issues in a few seconds. PII is removed locally before anything is stored; it runs offline, with Claude, or with Ollama. MIT.
>
> My background is social anthropology, where "show me the fieldnote" is the standard for any claim about people. Would love feedback, especially from PMs: would you trust this more than a ChatGPT summary of your tickets?

## Post B: LinkedIn

> I ran 300 of Excalidraw's most-upvoted GitHub issues through a tool I built. Here's what users actually want, with receipts. 🧾
>
> [screenshot of the evidence map]
>
> 1. [top opportunity] — [n] people, [votes] upvotes
> 2. …
>
> Every line links to the exact words a real user wrote. Nothing paraphrased, nothing invented: the tool checks each quote against its source and drops anything that doesn't match.
>
> Why I built it: AI agents now build software straight from specs. That makes the spec the most important thing a PM writes, and nothing checks that what's in it came from customers.
>
> Receipts is open source. Try it on any public repo: `npx @hashimua/receipts github owner/repo`
>
> Which repo should I run next?

## Post C: r/ProductManagement

> **I built an open-source tool that makes every requirement in a spec cite a real customer quote. Would you use this?**
>
> The problem I kept hitting: specs written from memory of feedback, one loud customer turning into a roadmap item, and LLM summaries of tickets that sound great but can't be checked.
>
> Receipts takes your tickets/reviews/transcripts, removes personal data on your machine, pulls out quotes and *verifies each one word for word* against the source. Then it ranks opportunities with a formula you can see and edit, writes a cited spec, and has a `check` command that flags requirements with no evidence, one-customer evidence, or stale evidence.
>
> Genuinely looking for PMs to tell me where this is wrong. I'm doing 30-minute interviews this month (link). Happy to run it on your public feedback in return.

## Post D: follow-up

> "I ran Receipts on 5,000 Next.js issues. Here's what users actually want." Table of the top 10 across 5 repos, what surprised the maintainers, and what the tool got wrong (heuristic mode merges "freeze" the verb with "freeze" the bug, so here's the Claude run instead).

## What would make this launch a failure, and what we'd do

- **< 50 stars on Show HN:** the hook doesn't land. Next: lead with the PM angle (Post C) and the Spec Kit community rather than HN.
- **Stars but no Action users after 30 days:** people like the demo but don't adopt the workflow. Next: interviews focus on what stops them putting it in CI.
- **PMs say "I'd just use ChatGPT":** the verification thesis (spec R5) is wrong. Next: pivot positioning to the CI check for agent-built specs.
