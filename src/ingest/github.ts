/**
 * GitHub issues as customer evidence. Uses the search API so the most-upvoted
 * issues come first; works unauthenticated for public repos (set GITHUB_TOKEN
 * for higher rate limits).
 */

export interface GitHubIssue {
  number: number;
  title: string;
  body?: string | null;
  html_url: string;
  created_at: string;
  updated_at?: string;
  state?: string;
  comments?: number;
  author_association?: string;
  user?: { login?: string } | null;
  labels?: (string | { name?: string })[];
  reactions?: Record<string, number | string>;
  pull_request?: unknown;
}

export function isGitHubIssue(value: unknown): value is GitHubIssue {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.number === "number" && typeof v.title === "string" && typeof v.html_url === "string";
}

export function issueVotes(issue: GitHubIssue): number {
  const r = issue.reactions ?? {};
  const n = (k: string) => Number(r[k] ?? 0) || 0;
  return n("+1") + n("heart") + n("hooray") + n("rocket") + n("eyes");
}

export function issueSegment(issue: GitHubIssue): string {
  switch ((issue.author_association ?? "NONE").toUpperCase()) {
    case "OWNER":
    case "MEMBER":
    case "COLLABORATOR":
      return "maintainer";
    case "CONTRIBUTOR":
      return "contributor";
    default:
      return "user";
  }
}

export function issueLabels(issue: GitHubIssue): string[] {
  return (issue.labels ?? [])
    .map((l) => (typeof l === "string" ? l : (l.name ?? "")))
    .filter(Boolean);
}

/** Remove noise that is never evidence: HTML comments from issue templates, images. */
export function cleanIssueBody(body: string): string {
  return body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[image]")
    .replace(/<img[^>]*>/gi, "[image]")
    .replace(/<details>[\s\S]*?<\/details>/gi, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface FetchOptions {
  limit?: number;
  state?: "open" | "closed" | "all";
  labels?: string[];
  token?: string;
  query?: string;
  onProgress?: (fetched: number) => void;
}

export async function fetchIssues(repo: string, options: FetchOptions = {}): Promise<GitHubIssue[]> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`Expected owner/repo, got "${repo}"`);
  const limit = Math.min(options.limit ?? 300, 1000);
  const parts = [`repo:${repo}`, "is:issue"];
  if (options.state !== "all") parts.push(`is:${options.state ?? "open"}`);
  for (const l of options.labels ?? []) parts.push(`label:"${l}"`);
  if (options.query) parts.push(options.query);
  const q = parts.join(" ");
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "receipts-cli",
  };
  const token = options.token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token) headers.authorization = `Bearer ${token}`;

  const out: GitHubIssue[] = [];
  for (let page = 1; out.length < limit; page++) {
    const perPage = Math.min(100, limit - out.length);
    const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&sort=reactions&order=desc&per_page=${perPage}&page=${page}`;
    const res = await fetch(url, { headers });
    if (res.status === 403 || res.status === 429) {
      const reset = res.headers.get("x-ratelimit-reset");
      const wait = reset ? Math.max(0, Number(reset) * 1000 - Date.now()) : 0;
      throw new Error(
        `GitHub rate limit hit after ${out.length} issues${wait ? ` (resets in ${Math.ceil(wait / 1000)}s)` : ""}. Set GITHUB_TOKEN to raise the limit.`,
      );
    }
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { items?: GitHubIssue[] };
    const items = (data.items ?? []).filter((i) => !i.pull_request);
    out.push(...items);
    options.onProgress?.(out.length);
    if ((data.items ?? []).length < perPage) break;
  }
  return out.slice(0, limit);
}
