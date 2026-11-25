/**
 * Model providers. Both return schema-validated JSON; neither is ever trusted
 * for facts: every quote a model returns is re-verified against the source.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ReceiptsConfig } from "./config.js";

export interface JsonRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
}

export interface LLM {
  readonly name: "claude" | "ollama";
  readonly model: string;
  json<T>(req: JsonRequest<T>): Promise<T>;
}

function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const s = z.toJSONSchema(schema) as Record<string, unknown>;
  delete s.$schema;
  return s;
}

export class LLMError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
function supportsServerFallback(model: string): boolean {
  return /^claude-(opus-5|fable-5|sonnet-5-5|mythos-5)/.test(model);
}

export class ClaudeLLM implements LLM {
  readonly name = "claude" as const;
  private client: Anthropic;

  constructor(
    readonly model: string,
    private effort: ReceiptsConfig["claude"]["effort"],
    client?: Anthropic,
  ) {
    this.client = client ?? new Anthropic();
  }

  async json<T>(req: JsonRequest<T>): Promise<T> {
    const fallback = supportsServerFallback(this.model);
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: req.maxTokens ?? 16000,
        ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        thinking: { type: "adaptive" },
        output_config: {
          effort: this.effort,
          format: { type: "json_schema", schema: jsonSchemaOf(req.schema) },
        },
        // The system prompt is identical across calls in a run, so cache it.
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: req.prompt }],
      });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        throw new LLMError("Anthropic rejected the API key. Check ANTHROPIC_API_KEY, or run with --extractor heuristic.");
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new LLMError("Anthropic rate limit reached. Try again shortly or lower concurrency with --concurrency 1.", true);
      }
      if (err instanceof Anthropic.BadRequestError) {
        throw new LLMError(`Anthropic rejected the request: ${err.message}`);
      }
      if (err instanceof Anthropic.APIConnectionError) {
        throw new LLMError(`Could not reach the Anthropic API: ${err.message}`, true);
      }
      if (err instanceof Anthropic.APIError) {
        throw new LLMError(`Anthropic API error ${err.status ?? ""}: ${err.message}`, (err.status ?? 0) >= 500);
      }
      throw err;
    }
    if (response.stop_reason === "refusal") {
      throw new LLMError("The model declined this request. The source was skipped.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new LLMError("The model's answer was cut off (max_tokens). Try a smaller batch with --batch-chars.", false);
    }
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return parseJson(text, req.schema);
  }
}

export class OllamaLLM implements LLM {
  readonly name = "ollama" as const;

  constructor(
    readonly model: string,
    private host: string,
  ) {}

  async json<T>(req: JsonRequest<T>): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.host.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: jsonSchemaOf(req.schema),
          options: { temperature: 0 },
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.prompt },
          ],
        }),
      });
    } catch (err) {
      throw new LLMError(`Could not reach Ollama at ${this.host} (${(err as Error).message}). Is \`ollama serve\` running?`);
    }
    if (!res.ok) throw new LLMError(`Ollama error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { message?: { content?: string } };
    return parseJson(data.message?.content ?? "", req.schema);
  }
}

function parseJson<T>(text: string, schema: z.ZodType<T>): T {
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "");
  let raw: unknown;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    throw new LLMError(`Model returned invalid JSON: ${cleaned.slice(0, 120)}…`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new LLMError(`Model output did not match the schema: ${parsed.error.message.slice(0, 200)}`);
  return parsed.data;
}

export function hasAnthropicCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function createLLM(
  choice: "claude" | "ollama" | "heuristic" | "auto",
  config: ReceiptsConfig,
): LLM | undefined {
  if (choice === "heuristic") return undefined;
  if (choice === "ollama") return new OllamaLLM(config.ollama.model, config.ollama.host);
  if (choice === "claude") return new ClaudeLLM(config.claude.model, config.claude.effort);
  return hasAnthropicCredentials() ? new ClaudeLLM(config.claude.model, config.claude.effort) : undefined;
}

/** Run async tasks with bounded concurrency, preserving order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}
