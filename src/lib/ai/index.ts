/**
 * Single entry point for every AI call in the app.
 *
 * Provider is chosen by AI_PROVIDER (gemini | openai). If that provider has no
 * usable key but the other one does, the configured provider is still reported
 * honestly - the app never silently swaps providers behind the user's back;
 * callers decide how to degrade.
 */
import { geminiProvider } from "./gemini";
import { openaiProvider } from "./openai";
import {
  AIError,
  type AIMessage,
  type AIProvider,
  type AIProviderName,
  type GenerateOptions,
  type GenerateResult,
} from "./types";
import { tryParseAgentJson } from "@/lib/agents/json";

export * from "./types";
export { listGeminiModels } from "./gemini";

const PROVIDERS: Record<AIProviderName, AIProvider> = {
  gemini: geminiProvider,
  openai: openaiProvider,
};

export function configuredProviderName(): AIProviderName {
  const raw = (process.env.AI_PROVIDER ?? "gemini").trim().toLowerCase();
  return raw === "openai" ? "openai" : "gemini";
}

export function getAIProvider(): AIProvider {
  return PROVIDERS[configuredProviderName()];
}

/** Is the selected provider ready to serve requests? */
export function isAIConfigured(): boolean {
  return getAIProvider().isConfigured();
}

export type AIStatus = {
  provider: AIProviderName;
  model: string;
  configured: boolean;
  /** Other providers that do have a key, to help the user fix configuration. */
  alternativesConfigured: AIProviderName[];
};

export function aiStatus(): AIStatus {
  const provider = getAIProvider();
  return {
    provider: provider.name,
    model: provider.model,
    configured: provider.isConfigured(),
    alternativesConfigured: (Object.keys(PROVIDERS) as AIProviderName[]).filter(
      (n) => n !== provider.name && PROVIDERS[n].isConfigured()
    ),
  };
}

const RETRYABLE_DELAYS_MS = [700, 1800];

/**
 * Generate text through the configured provider, retrying transient failures
 * (rate limits, 5xx) with a short backoff.
 */
export async function generateText(
  options: GenerateOptions
): Promise<GenerateResult> {
  const provider = getAIProvider();
  let lastError: AIError | null = null;

  for (let attempt = 0; attempt <= RETRYABLE_DELAYS_MS.length; attempt++) {
    try {
      return await provider.generate(options);
    } catch (error) {
      const aiError =
        error instanceof AIError
          ? error
          : new AIError("bad_request", String(error), { provider: provider.name });

      if (!aiError.retryable || attempt === RETRYABLE_DELAYS_MS.length) throw aiError;

      lastError = aiError;
      await new Promise((r) => setTimeout(r, RETRYABLE_DELAYS_MS[attempt]));
    }
  }

  throw lastError ?? new AIError("unavailable", "AI request failed");
}

/**
 * Generate a JSON object. Asks the provider for JSON mode and parses
 * tolerantly, retrying once with a repair instruction if the reply is not JSON.
 */
export async function generateJson<T = Record<string, unknown>>(
  options: GenerateOptions
): Promise<T> {
  const first = await generateText({ ...options, json: true });
  const parsed = tryParseAgentJson<T>(first.text);
  if (parsed && typeof parsed === "object") return parsed;

  const repairMessages: AIMessage[] = [
    ...options.messages,
    { role: "assistant", content: first.text },
    {
      role: "user",
      content:
        "That was not valid JSON. Reply with a single valid JSON object and nothing else — no prose, no markdown fences.",
    },
  ];

  const second = await generateText({
    ...options,
    messages: repairMessages,
    json: true,
  });

  const retry = tryParseAgentJson<T>(second.text);
  if (retry && typeof retry === "object") return retry;

  throw new AIError(
    "empty_response",
    "The AI did not return valid JSON after a repair attempt",
    { provider: getAIProvider().name }
  );
}
