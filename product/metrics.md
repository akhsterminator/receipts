# Metrics

Updated every Monday by [`.github/workflows/metrics.yml`](../.github/workflows/metrics.yml), which runs [`scripts/metrics.mjs`](../scripts/metrics.mjs) and commits the new row. Receipts has no telemetry ([why](decisions.md#2026-11-25--no-telemetry-measure-activation-by-proxy)), so activation is measured by public proxies.

## Definitions

| Metric | Definition | Source |
| --- | --- | --- |
| **Stars** | GitHub stargazers | GitHub API |
| **Weekly installs** | npm downloads of `@hashimua/receipts`, last 7 days | npm downloads API |
| **Action users** | Public repos whose workflows use `akhsterminator/receipts` | GitHub code search |
| **Activation (proxy)** | Public repos with a committed `.receipts/quotes.json`, i.e. someone got as far as a verified evidence store | GitHub code search |
| **Interviews** | Discovery interviews in the evidence store | `product/interviews/` |
| **Spec health** | Cited / total requirements in [spec.md](spec.md) | `receipts check --format json` |

## North star

**Repos with a cited spec checked in CI.** It's the only number that means someone trusted Receipts enough to put it between their spec and their build.

## Targets

| | 30 days after launch | 90 days | 6 months |
| --- | --- | --- | --- |
| Stars | 300 | 600 | 1,000 |
| Weekly installs | 100 | 200 | 300 |
| Action users | 5 | 12 | 20 |
| Interviews | 10 | 15 | 20 |

## Weekly log

<!-- metrics:table:start -->
| Week | Stars | Weekly installs | Action users | Activation (proxy) | Spec health | Note |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-23 | 0 | 0 | 0 | 0 | 4/8 cited | Pre-launch baseline: v0.1 built, not yet published to npm |
<!-- metrics:table:end -->
