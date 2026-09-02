/**
 * Agent-facing wrapper over the shared AI provider.
 *
 * Replaces the old direct-to-OpenAI client so every agent goes through the
 * AI_PROVIDER abstraction (Gemini by default, OpenAI optional).
 */
import { generateJson, generateText, getAIProvider } from "@/lib/ai";

export function getModel(): string {
  return getAIProvider().model;
}

/** Free-text completion through the configured provider. */
export async function callAgent(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const result = await generateText({
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    temperature: 0.7,
  });
  return result.text;
}

/** JSON completion with provider-side JSON mode and a repair retry. */
export async function callAgentJson<T = Record<string, unknown>>(
  agent: string,
  systemPrompt: string,
  userPrompt: string
): Promise<{ output: T; raw: string }> {
  const output = await generateJson<T>({
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    temperature: 0.7,
    maxOutputTokens: 2048,
  });

  return { output, raw: JSON.stringify(output) };
}
