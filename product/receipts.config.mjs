// Receipts runs on its own product evidence. See product/README.md.
export default {
  project: "Receipts",
  store: ".receipts",
  extractor: "heuristic",
  clusterer: "heuristic",
  segments: { weights: { user: 1, contributor: 1, maintainer: 0.6, pm: 1.5, founder: 1.3 }, default: 1 },
  check: { minCustomers: 2, staleAfterDays: 365, requireMetric: true, maxBetShare: 0.5 },
};
