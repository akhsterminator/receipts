# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [semantic versioning](https://semver.org/).

## [0.1.0] - unreleased

First public version.

### Added
- `receipts run`: ingest → extract → cluster → cited spec → evidence map in one command.
- `receipts github owner/repo`: a ranked, cited roadmap from any public repo's issues.
- `receipts demo`: the whole pipeline on bundled sample data, no setup.
- Ingestion of CSV/TSV, JSON/JSONL, `.txt`/`.md` transcripts, WebVTT, SRT, `.docx` and GitHub issues, with automatic column detection for Zendesk, Intercom and app-store exports.
- Local PII removal (emails, phones, cards, IBANs, IPs, addresses, names, handles, secrets) and salted pseudonyms, before anything is stored.
- Quote extraction with Claude (`claude-opus-5-5`, structured outputs), Ollama, or an offline heuristic. Every quote is verified word for word against its source; anything else is dropped.
- Deterministic clustering into opportunities with themes, and a transparent, configurable priority score.
- `receipts check`: errors for missing evidence, unknown or unverifiable quotes, misquotes; warnings for loudest-voice, stale evidence, missing metrics and too many bets. Pretty, JSON, GitHub-annotation and Markdown output.
- `receipts why`, `quote`, `search`, `opportunities`, `sources`, `verify`.
- Evidence map: a single self-contained HTML file.
- Exports to GitHub Spec Kit, Linear CSV, GitHub issues and JSON.
- MCP server (`receipts mcp`) with `why`, `search_evidence`, `get_quote`, `list_opportunities`, `check_spec`.
- GitHub Action (`akhsterminator/receipts@v0`).
