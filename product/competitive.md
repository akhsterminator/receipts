# Competitive landscape

*Last reviewed 25 Nov 2026. Based on public information only; corrections welcome.*

## The chain nobody else owns

Receipts' bet is the whole chain, not any one link:

**verified quotes → ranked opportunities → cited spec → automated check in CI → hand-off to the agent**

| | Ingest feedback at volume | Verifies quotes word for word | Ranks opportunities | Writes a cited spec | Checks specs in CI | Agent hand-off (Spec Kit / MCP) | Open source, local-first |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Receipts** | ✓ tickets, reviews, issues, transcripts | ✓ deterministic | ✓ editable formula | ✓ | ✓ GitHub Action | ✓ both | ✓ MIT, offline mode |
| Keel Discovery | Interviews, one at a time | Claims with provenance (model-extracted) | Assumption confidence | Brief with `keel:` markers | Gate script inside Spec Kit | ✓ Spec Kit | ✓ Apache-2.0 |
| Verbatim | Transcripts | No | Opportunity tree | No | No | No | No (paid web app) |
| feedback-synthesis-mcp | Feedback text | No | Ranked pain clusters | No | No | MCP | Client only; backend paid |
| Dovetail / Condens / EnjoyHQ | ✓ | Highlights link to source | Tags, themes | No | No | No | No |
| Productboard / Canny / Quackback | ✓ feature requests | Links to notes | Votes, scores | Feature docs | No | Limited | Quackback only |
| GitHub Spec Kit | — | — | — | Spec templates | `/analyze` (internal consistency) | ✓ | ✓ |
| ChatGPT / Claude, by hand | Paste | No | Ad hoc | Ad hoc | No | No | — |

## Keel Discovery

[Keel Discovery](https://github.com/keeldiscovery/spec-kit-keel) (submitted to the Spec Kit extension catalogue in [spec-kit#4026](https://github.com/github/spec-kit/issues/4026), Aug 2026) is the closest thing to Receipts. It "puts customer evidence upstream of `/speckit.specify`, and audits what you shipped against it afterwards." It has a gate that blocks when evidence is thin or comes from a single participant role, which is very close to Receipts' loudest-voice check.

**What this means:** the problem is real enough that someone else built for it. That's validation, not a reason to stop. The products start from opposite ends:

| | Keel Discovery | Receipts |
| --- | --- | --- |
| Starting point | A hypothesis, then interviews to test it | The feedback you already have, at volume |
| Typical input | One interview at a time | Thousands of tickets, reviews and issues, plus interviews |
| How evidence is checked | Model extracts attributable claims | Every quote is a byte-offset span of the source, re-checked on every CI run |
| Where it runs | Inside Spec Kit, as agent commands | Any Markdown spec, CLI, GitHub Action, MCP; Spec Kit is one export |
| Privacy | Inherits the agent's data handling | PII removed locally before storage or model calls; offline mode |

**Positioning response:** Receipts is evidence-first and volume-first ("what are customers already telling us?"), Keel is hypothesis-first ("is my idea right?"). They could be complementary: a Keel interview could be one Receipts source. Logged in [decisions.md](decisions.md) on 25 Nov 2026. Worth reaching out to the author.

## Others

- **Verbatim:** paid web app turning transcripts into an opportunity tree. No spec output, no citations.
- **feedback-synthesis-mcp:** groups feedback into ranked pain points through MCP; backend is private and paid per call.
- **Quackback:** open-source feedback board with an MCP server. Collects requests; doesn't write or check specs.
- **Dovetail, Condens:** research repositories. Strong at tagging and highlights for research teams; not aimed at specs that agents build from, and not local-first.
- **Productboard, Canny:** roadmap and feedback tools for larger PM teams. Insight links exist but nothing checks a spec against them.
- **Spec Kit `/speckit.analyze`:** checks internal consistency between spec, plan and tasks. It doesn't look outside the repo at customers.

## Where Receipts could lose

1. **Platform absorption.** Spec Kit or Claude Code adds "cite your sources" natively. *Mitigation:* be the reference implementation they integrate with, so the MCP server and Action are the integration surface.
2. **"Good enough" summaries.** PMs accept unverified LLM themes. This is the core risk; spec R5 is a bet until interviews say otherwise.
3. **Research tools move down-market** and add a spec export. *Mitigation:* open source and local-first are hard for SaaS incumbents to match.
