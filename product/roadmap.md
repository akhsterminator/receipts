# Roadmap

Now / next / later. Each item names the bet in [spec.md](spec.md) it serves, so the roadmap can't drift from the evidence either.

## Now: v0.1, launch (Nov–Dec 2026)

- [x] Ingest CSV, JSON, transcripts (`.txt` `.md` `.vtt` `.srt` `.docx`) and GitHub issues, with local PII removal (R6)
- [x] Quote extraction (Claude, Ollama, or offline) with word-for-word verification (R5)
- [x] Clustering, transparent scoring, cited spec, `receipts check` with GitHub annotations (R1, R3)
- [x] Evidence map viewer, Spec Kit / Linear / GitHub exports (R2, R4)
- [x] MCP server with `why`, `search_evidence`, `check_spec` (R8)
- [x] `npx @hashimua/receipts github owner/repo` (R7)
- [ ] Publish to npm, tag `v0.1.0`, deploy the demo site
- [ ] 10 discovery interviews ([guide](interviews/README.md))
- [ ] Show HN and launch posts ([launch.md](launch.md))

## Next: v0.2, learn from real use (Jan–Feb 2027)

Ordered by what the interviews will most likely change.

- **Intercom, Zendesk and Gong connectors** (pull instead of export) if interviews show export friction is the main drop-off
- **`receipts diff`:** what changed in the evidence since the spec was written ("12 new quotes support R3; R5's evidence is now 14 months old")
- **PR comment bot:** post the check summary as a comment, not only annotations
- **Contradictions:** flag requirements where some customers asked for the opposite
- **Redaction test set** with measured recall, published in the README (R6 metric)
- **Spec Kit extension:** `/speckit.receipts` so the check runs inside the Spec Kit workflow

## Later

- Linear and Jira sync that updates issue descriptions when evidence changes
- Multi-repo evidence stores for product orgs
- Hosted read-only evidence map for sharing with stakeholders (R4), if interviews ask for it
- Partnership or integration with Keel Discovery for hypothesis-led interviews

## Not doing

- **A SaaS dashboard.** Local-first is the point. A hosted viewer only if stakeholders need it, and read-only.
- **Telemetry.** See [decisions.md](decisions.md).
- **Auto-writing the whole spec with no human edit.** Receipts drafts; the PM decides. The check exists because the PM edits.
