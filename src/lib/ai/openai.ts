/**
 * OpenAI provider, kept so the app can switch back with AI_PROVIDER=openai.
 * Wraps the existing `openai` SDK client and maps its errors onto the shared
 * error taxonomy.
 */
import OpenAI from "openai";
import {
  AIError,
  type AIProvider,
  type GenerateOptions,
  type GenerateResult,
} from "./types";

const DEFAULT_MODEL = "gpt-4o-mini";

function isPlaceholder(key: string): boolean {
  return key.includes("your-openai") || key.includes("sk-your") || key.length < 20;
}

export function openaiKey(): string | null {
  const key = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!key || isPlaceholder(key)) return null;
  return key;
}

export function openaiModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

let client: OpenAI | null = null;
let clientKey: string | null = null;

function getClient(key: string): OpenAI {
  // Rebuild if the key changed (e.g. .env edited during dev).
  if (!client || clientKey !== key) {
    client = new OpenAI({ apiKey: key });
    clientKey = key;
  }
  return client;
}

export const openaiProvider: AIProvider = {
  name: "openai",
  get model() {
    return openaiModel();
  },

  isConfigured() {
    return openaiKey() !== null;
  },

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const key = openaiKey();
    if (!key) {
      throw new AIError(
        "missing_key",
        "OPENAI_API_KEY is not set (or is still a placeholder) in .env",
        { provider: "openai" }
      );
    }

    const model = openaiModel();

    try {
      const response = await getClient(key).chat.completions.create(
        {
          model,
          messages: [
            ...(options.system
              ? [{ role: "system" as const, content: options.system }]
              : []),
            ...options.messages.map((m) => ({
              role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
              content: m.content,
            })),
          ],
          temperature: options.temperature ?? 0.4,
          max_tokens: options.maxOutputTokens ?? 1024,
          ...(options.json ? { response_format: { type: "json_object" as const } } : {}),
        },
        { signal: options.signal }
      );

      const text = response.choices[0]?.message?.content?.trim() ?? "";
      if (!text) {
        throw new AIError("empty_response", "OpenAI returned an empty response", {
          provider: "openai",
        });
      }

      return {
        text,
        provider: "openai",
        model,
        usage: {
          inputTokens: response.usage?.prompt_tokens,
          outputTokens: response.usage?.completion_tokens,
        },
      };
    } catch (error) {
      if (error instanceof AIError) throw error;
      throw mapOpenAIError(error);
    }
  },
};

function mapOpenAIError(error: unknown): AIError {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: number }).status)
      : undefined;
  const message = error instanceof Error ? error.message : String(error);

  if (status === 401 || /invalid_api_key|Incorrect API key/i.test(message)) {
    return new AIError("invalid_key", `OpenAI rejected the API key: ${message}`, {
      provider: "openai",
      status,
    });
  }
  if (status === 429) {
    const quota = /quota|billing/i.test(message);
    return new AIError(
      quota ? "quota_exceeded" : "rate_limit",
      `OpenAI rate limit or quota reached: ${message}`,
      { provider: "openai", status, retryable: !quota }
    );
  }
  if (status && status >= 500) {
    return new AIError("unavailable", `OpenAI server error: ${message}`, {
      provider: "openai",
      status,
      retryable: true,
    });
  }

  return new AIError("bad_request", `OpenAI request failed: ${message}`, {
    provider: "openai",
    status,
    cause: error,
  });
}
