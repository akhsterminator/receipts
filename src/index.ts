/**
 * Programmatic API. The CLI is a thin layer over these functions.
 *
 *   import { Store, checkSpec, parseSpec, loadConfig } from "@hashimua/receipts";
 */
export { defineConfig, loadConfig, DEFAULT_CONFIG, type ReceiptsConfig, type PartialConfig } from "./config.js";
export { Store } from "./store.js";
export { redact, pseudonym } from "./privacy.js";
export { verifyQuote, verifyStored, normalize } from "./verify.js";
export { ingestPaths, ingestFile, ingestRecords, issueToSource } from "./ingest/index.js";
export { fetchIssues } from "./ingest/github.js";
export { extractAll, verifyCandidates } from "./extract/index.js";
export { heuristicExtract } from "./extract/heuristic.js";
export { synthesize } from "./synthesize/index.js";
export { defaultScore, SCORE_FORMULA } from "./synthesize/score.js";
export { parseSpec } from "./spec/parse.js";
export { checkSpec, quoteStatus } from "./spec/check.js";
export { renderSpec } from "./spec/write.js";
export { formatPretty, formatGithub, formatMarkdown, formatJson } from "./spec/report.js";
export { requirementEvidence, quoteEvidence, findRequirement } from "./evidence.js";
export { toSpecKit, toLinearCsv, writeGithubIssues, toJson } from "./export.js";
export { buildViewData, renderView } from "./view.js";
export { searchQuotes } from "./search.js";
export { ClaudeLLM, OllamaLLM, createLLM, type LLM } from "./llm.js";
export type * from "./types.js";
