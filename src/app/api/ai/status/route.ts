import { requireVerifiedAuth } from "@/lib/auth";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { aiStatus } from "@/lib/ai";

/**
 * Configuration diagnostics for the AI layer.
 *
 * Reports which provider is selected and whether a key is present — never the
 * key itself, and never any part of it.
 */
export async function GET() {
  try {
    await requireVerifiedAuth();
    const status = aiStatus();

    return apiSuccess({
      provider: status.provider,
      model: status.model,
      configured: status.configured,
      alternativesConfigured: status.alternativesConfigured,
      hint: status.configured
        ? null
        : status.provider === "gemini"
          ? "Set GEMINI_API_KEY in .env (free tier: https://aistudio.google.com/apikey), then restart the dev server."
          : "Set OPENAI_API_KEY in .env, then restart the dev server.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
