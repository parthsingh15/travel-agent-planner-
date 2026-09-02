/**
 * Provider-agnostic AI interface.
 *
 * Everything in the app that talks to a language model goes through this, so
 * switching between Gemini and OpenAI is an environment variable rather than a
 * code change. Keys are read from the environment inside provider modules and
 * never leave the server.
 */

export type AIMessage = {
  role: "user" | "assistant";
  content: string;
};

export type GenerateOptions = {
  system?: string;
  messages: AIMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  /** Ask the provider for a strict JSON object response. */
  json?: boolean;
  signal?: AbortSignal;
};

export type GenerateResult = {
  text: string;
  provider: AIProviderName;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
};

export type AIProviderName = "gemini" | "openai";

export interface AIProvider {
  readonly name: AIProviderName;
  readonly model: string;
  /** True when a usable API key is configured. */
  isConfigured(): boolean;
  generate(options: GenerateOptions): Promise<GenerateResult>;
}

// ─── Error taxonomy ─────────────────────────────────────────────────────────
// Distinct classes so callers can react differently: a missing key is a setup
// problem, a rate limit is worth retrying, an empty response is a bad response.

export type AIErrorKind =
  | "missing_key"
  | "invalid_key"
  | "rate_limit"
  | "quota_exceeded"
  | "unavailable"
  | "empty_response"
  | "bad_request"
  | "blocked";

export class AIError extends Error {
  readonly kind: AIErrorKind;
  readonly provider: AIProviderName | "none";
  readonly status?: number;
  /** Whether retrying the same request could plausibly succeed. */
  readonly retryable: boolean;

  constructor(
    kind: AIErrorKind,
    message: string,
    opts: {
      provider?: AIProviderName | "none";
      status?: number;
      retryable?: boolean;
      cause?: unknown;
    } = {}
  ) {
    super(message, { cause: opts.cause });
    this.name = "AIError";
    this.kind = kind;
    this.provider = opts.provider ?? "none";
    this.status = opts.status;
    this.retryable =
      opts.retryable ?? (kind === "rate_limit" || kind === "unavailable");
  }

  /** Message safe to show a user - never contains key material. */
  get userMessage(): string {
    switch (this.kind) {
      case "missing_key":
        return "The AI assistant is not configured yet. Add an API key for your chosen provider to .env.";
      case "invalid_key":
        return "The configured AI API key was rejected. Check the key in .env.";
      case "rate_limit":
        return "The AI provider is rate limiting requests. Please try again in a moment.";
      case "quota_exceeded":
        return "The AI provider's free-tier quota has been used up. Try again later or check your provider quota.";
      case "unavailable":
        return "The AI service is temporarily unavailable.";
      case "empty_response":
        return "The AI returned an empty response. Try rephrasing your question.";
      case "blocked":
        return "The AI provider blocked this request as unsafe. Try rephrasing your question.";
      default:
        return "The AI request could not be completed.";
    }
  }
}
