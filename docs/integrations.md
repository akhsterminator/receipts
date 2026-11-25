# Integrations

## Claude Code (MCP)

Let your coding agent read the customer evidence while it builds:

```bash
claude mcp add receipts -- npx -y @hashimua/receipts mcp --spec spec.md
```

Or in `.mcp.json`:

```json
{
  "mcpServers": {
    "receipts": { "command": "npx", "args": ["-y", "@hashimua/receipts", "mcp", "--spec", "spec.md"] }
  }
}
```

| Tool | What the agent gets |
| --- | --- |
| `why` | The verified quotes behind a requirement (`R3`), with segment, age and source |
| `search_evidence` | Full-text search over everything customers said ("did anyone ask for CSV export?") |
| `get_quote` | One quote in the context of its source |
| `list_opportunities` | Ranked opportunities |
| `check_spec` | The `receipts check` result as Markdown |

A useful line for `CLAUDE.md`:

```md
Before implementing a requirement from spec.md, call the receipts `why` tool and resolve ambiguity in favour of what customers actually said. If you add behaviour no requirement asks for, check `search_evidence` first.
```

Works the same way in Cursor, Windsurf and any MCP client that runs stdio servers.

## GitHub Actions

```yaml
# .github/workflows/receipts.yml
name: receipts
on:
  pull_request:
    paths: ["spec.md", ".receipts/**"]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: akhsterminator/receipts@v0
        with:
          spec: spec.md          # required
          # store: .receipts     # defaults to receipts.config
          # strict: true         # fail on warnings too
          # version: latest      # use the npm release instead of building from source
```

Findings appear as annotations on the spec's lines in the PR diff, and a summary table is added to the job summary. `npx @hashimua/receipts init --ci` writes this file for you.

Commit `.receipts/` (it's redacted; the salt is gitignored) so CI can verify quotes.

## GitHub Spec Kit

```bash
receipts export speckit --feature "Pause subscriptions"
# → specs/001-pause-subscriptions/spec.md
```

Each requirement becomes a prioritised user story with its evidence quoted, a functional requirement (`FR-001 … [Evidence: Q-0142, Q-0388]`) and a success criterion from its `metric:`. Bets become Assumptions. Continue with `/speckit.plan` as usual. With the MCP server connected, the agent can pull the full evidence during `/speckit.implement`.

## Linear

```bash
receipts export linear      # → receipts-linear.csv
```

Import in Linear under Settings → Import / Export → CSV. Each requirement becomes an issue with its metric and quotes in the description, priority from its rank, and a `receipts` / `evidence-backed` or `bet` label.

## GitHub issues

```bash
receipts export github      # → receipts-issues/R1-….md + create-issues.sh
bash receipts-issues/create-issues.sh   # uses the gh CLI; review the files first
```

## Ollama (fully local)

```bash
ollama pull llama3.1
receipts run feedback/ --extractor ollama
```

Set `ollama.model` and `ollama.host` in the config. Small models paraphrase more, so expect more quotes to be dropped by verification. That's the point.

## As a library

```ts
import { Store, loadConfig, parseSpec, checkSpec } from "@hashimua/receipts";

const { config } = await loadConfig();
const store = Store.open(".receipts");
const result = checkSpec(parseSpec(markdown, "spec.md"), store, config);
if (!result.ok) process.exit(1);
```
