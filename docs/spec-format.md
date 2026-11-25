# Spec format

Receipts adds two lines to an ordinary Markdown spec. Everything else is yours.

## Requirements

A requirement is a heading with an ID, followed by its evidence:

```md
## R3. Let users pause a subscription for up to 3 months
because: [Q-0142, Q-0388, Q-0911]   # 23 customers · 4 segments · last seen 6 days ago
metric: Monthly-plan churn −10% within 90 days
```

- **Heading:** `##`, `###` or `####`, then an ID: `R3`, `R-3`, `REQ-3` or `FR-003`, then `.`, `:` or `)` and a title.
- **`because:`** lists quote IDs. Brackets and commas are optional. Anything after ` # ` is a comment.
- **`metric:`** is how you'll know it worked. Missing or `TODO` → warning (turn off with `check.requireMetric: false`).
- **`owner:`** is optional and informational.
- Fields can be list items or bold: `- **because:** Q-0142, Q-0388` works too.

## Bets

To build something without evidence, say so and say why:

```md
## R7. Public API for gym partners
bet: Two gym chains asked in sales calls (not in the store). We'll run 5 partner interviews before building more than a prototype.
metric: 2 signed partners by end of Q2
```

A bet passes the check. It's counted in the summary (`· 1 bet`), and a warning appears if bets are more than half the spec.

## Inline quotes

Quote customers directly under a requirement, attributed by ID:

```md
> "I'd rather pause than cancel, but there's no button for that." — Q-0142 · ticket · smb
```

`receipts check` compares the quoted text with the store and fails on any difference.

## What `receipts check` reports

| Rule | Severity | When |
| --- | --- | --- |
| `no-evidence` | error | No `because:` and no `bet:` |
| `empty-because` | error | `because:` with no quote IDs |
| `empty-bet` | error | `bet:` with no reason (or `TODO`) |
| `unknown-quote` | error | A cited ID isn't in the store |
| `unverified-quote` | error | A cited quote no longer matches its source, or was edited |
| `misquote` | error | Inline quote text differs from what the customer said |
| `duplicate-id` | error | Two requirements share an ID |
| `no-requirements` | error | No requirement headings found |
| `loudest-voice` | warning | Fewer than `check.minCustomers` distinct customers (default 2) |
| `stale-quote` | warning | A cited quote is older than `check.staleAfterDays` (default 365) |
| `stale-evidence` | warning | *All* of a requirement's evidence is stale |
| `no-metric` | warning | No `metric:` |
| `too-many-bets` | warning | Bets exceed `check.maxBetShare` (default 50%) |
| `uncited-inline-quote` | info | A quote is shown but not listed in `because:` (`--verbose`) |

Exit code is 1 when there are errors, or warnings with `--strict`. Code blocks and HTML comments are ignored, so you can document the format inside a spec.
