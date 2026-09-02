/**
 * Google Gemini provider (Generative Language REST API).
 *
 * Uses fetch directly rather than the SDK: one less dependency, and it lets us
 * map Gemini's specific error shapes onto the app's error taxonomy.
 *
 * The key is read from the environment here, on the server only. It is sent in
 * the x-goog-api-key header rather than the query string so it does not end up
 * in request logs.
 */
import {
  AIError,
  type AIProvider,
  type GenerateOptions,
  type GenerateResult,
} from "./types";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
// Verified working against the live API. Gemini retires models periodically —
// if this one goes, the client auto-falls back (see RETIRED_FALLBACK) and logs
// a warning telling the operator to update GEMINI_MODEL.
// Benchmarked against the live API: flash-lite answers in ~1s where the full
// flash model takes 10-19s, because Gemini 3.x "thinking" dominates latency.
// Quality is comparable for this workload, where the model reasons over data we
// supply rather than recalling facts. Set GEMINI_MODEL=gemini-3.6-flash for
// deeper reasoning at the cost of much slower replies.
const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const RETIRED_FALLBACK = "gemini-flash-latest";

/**
 * Gemini 3.x models reason before answering, and those "thinking" tokens are
 * drawn from maxOutputTokens. A small budget gets consumed entirely by thinking
 * and returns a truncated or empty answer, so every request gets a floor.
 * Thinking cannot simply be disabled: thinkingConfig.thinkingBudget = 0 is
 * rejected with HTTP 400 on these models.
 */
const MIN_OUTPUT_TOKENS = 1600;

/** Placeholder values that should be treated as "not configured". */
function isPlaceholder(key: string): boolean {
  return (
    key.length < 20 ||
    /your[-_]?gemini|your[-_]?api[-_]?key|xxx|changeme|placeholder/i.test(key)
  );
}

export function geminiKey(): string | null {
  const key = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!key || isPlaceholder(key)) return null;
  return key;
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

type GeminiPart = { text?: string; thought?: boolean; thoughtSignature?: string };
type GeminiResponse = {
  candidates?: {
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  error?: { code?: number; message?: string; status?: string };
};

let retirementWarned = false;

export const geminiProvider: AIProvider = {
  name: "gemini",
  get model() {
    return geminiModel();
  },

  isConfigured() {
    return geminiKey() !== null;
  },

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const key = geminiKey();
    if (!key) {
      throw new AIError(
        "missing_key",
        "GEMINI_API_KEY is not set (or is still a placeholder) in .env",
        { provider: "gemini" }
      );
    }

    const model =
      (options as GenerateOptions & { _forceModel?: string })._forceModel ??
      geminiModel();

    // Gemini uses "model" where the app uses "assistant".
    const contents = options.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.4,
        maxOutputTokens: Math.max(
          options.maxOutputTokens ?? 1024,
          MIN_OUTPUT_TOKENS
        ),
        ...(options.json ? { responseMimeType: "application/json" } : {}),
      },
    };

    if (options.system) {
      body.systemInstruction = { parts: [{ text: options.system }] };
    }

    let res: Response;
    try {
      res = await fetch(`${API_BASE}/models/${model}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify(body),
        signal: options.signal ?? AbortSignal.timeout(90000),
      });
    } catch (cause) {
      throw new AIError("unavailable", "Could not reach the Gemini API", {
        provider: "gemini",
        retryable: true,
        cause,
      });
    }

    if (!res.ok) {
      let detail = "";
      try {
        const payload = (await res.json()) as GeminiResponse;
        detail = payload.error?.message ?? "";
      } catch {
        detail = await res.text().catch(() => "");
      }

      const mapped = mapHttpError(res.status, detail);

      // A retired model is a configuration problem, not a dead end: retry once
      // with the rolling alias so the app keeps working.
      const retired =
        res.status === 404 && /no longer available|not found/i.test(detail);

      if (retired && model !== RETIRED_FALLBACK) {
        if (!retirementWarned) {
          retirementWarned = true;
          console.warn(
            `[gemini] Model "${model}" is retired. Falling back to ` +
              `"${RETIRED_FALLBACK}". Update GEMINI_MODEL in .env to silence this.`
          );
        }
        return this.generate({
          ...options,
          // Signal the fallback through the env-independent path.
          _forceModel: RETIRED_FALLBACK,
        } as GenerateOptions);
      }

      throw mapped;
    }

    let data: GeminiResponse;
    try {
      data = (await res.json()) as GeminiResponse;
    } catch (cause) {
      throw new AIError("empty_response", "Gemini returned an unreadable body", {
        provider: "gemini",
        cause,
      });
    }

    if (data.promptFeedback?.blockReason) {
      throw new AIError(
        "blocked",
        `Gemini blocked the prompt: ${data.promptFeedback.blockReason}`,
        { provider: "gemini" }
      );
    }

    const candidate = data.candidates?.[0];
    // Reasoning parts are marked `thought: true`; they must never surface.
    const text = (candidate?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("")
      .trim();

    if (!text) {
      const reason = candidate?.finishReason;
      throw new AIError(
        "empty_response",
        reason === "SAFETY"
          ? "Gemini stopped generating for safety reasons"
          : reason === "MAX_TOKENS"
            ? "Gemini hit the output token limit before producing any text"
            : "Gemini returned an empty response",
        { provider: "gemini" }
      );
    }

    return {
      text,
      provider: "gemini",
      model,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount,
        outputTokens: data.usageMetadata?.candidatesTokenCount,
      },
    };
  },
};

function mapHttpError(status: number, detail: string): AIError {
  const suffix = detail ? `: ${detail}` : "";

  if (status === 400 && /API key not valid/i.test(detail)) {
    return new AIError("invalid_key", `Gemini rejected the API key${suffix}`, {
      provider: "gemini",
      status,
    });
  }
  if (status === 401 || status === 403) {
    return new AIError(
      "invalid_key",
      `Gemini rejected the API key or denied access${suffix}`,
      { provider: "gemini", status }
    );
  }
  if (status === 429) {
    // Gemini uses 429 for both per-minute rate limits and free-tier quota.
    const quota = /quota/i.test(detail);
    return new AIError(
      quota ? "quota_exceeded" : "rate_limit",
      `Gemini rate limit or quota reached${suffix}`,
      { provider: "gemini", status, retryable: !quota }
    );
  }
  if (status === 404) {
    return new AIError(
      "bad_request",
      `Gemini model not found — check GEMINI_MODEL${suffix}`,
      { provider: "gemini", status }
    );
  }
  if (status >= 500) {
    return new AIError("unavailable", `Gemini server error${suffix}`, {
      provider: "gemini",
      status,
      retryable: true,
    });
  }

  return new AIError("bad_request", `Gemini request failed${suffix}`, {
    provider: "gemini",
    status,
  });
}

/** Ask Gemini which models the configured key can actually use. */
export async function listGeminiModels(): Promise<string[]> {
  const key = geminiKey();
  if (!key) throw new AIError("missing_key", "GEMINI_API_KEY is not set");

  const res = await fetch(`${API_BASE}/models`, {
    headers: { "x-goog-api-key": key },
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) throw mapHttpError(res.status, await res.text().catch(() => ""));

  const data = (await res.json()) as {
    models?: { name?: string; supportedGenerationMethods?: string[] }[];
  };

  return (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => (m.name ?? "").replace(/^models\//, ""))
    .filter(Boolean);
}
