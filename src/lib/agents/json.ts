/**
 * Tolerant JSON extraction for LLM agent output.
 *
 * Models occasionally wrap JSON in prose or markdown fences even when
 * `response_format: json_object` is requested. A single malformed response
 * should degrade one agent, not fail the whole generation pipeline.
 */

export class AgentJsonError extends Error {
  readonly agent: string;
  readonly raw: string;

  constructor(agent: string, raw: string, cause?: unknown) {
    super(
      `Agent "${agent}" returned unparseable JSON${
        cause instanceof Error ? `: ${cause.message}` : ""
      }`
    );
    this.name = "AgentJsonError";
    this.agent = agent;
    this.raw = raw;
  }
}

/** Strip ```json ... ``` fences and any prose surrounding the JSON body. */
function extractJsonBody(raw: string): string {
  const trimmed = raw.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstObject = trimmed.indexOf("{");
  const firstArray = trimmed.indexOf("[");
  const start =
    firstObject === -1
      ? firstArray
      : firstArray === -1
        ? firstObject
        : Math.min(firstObject, firstArray);

  if (start === -1) return trimmed;

  const closer = trimmed[start] === "{" ? "}" : "]";
  const end = trimmed.lastIndexOf(closer);
  if (end <= start) return trimmed;

  return trimmed.slice(start, end + 1);
}

/** Parse agent JSON, returning null instead of throwing when unrecoverable. */
export function tryParseAgentJson<T = Record<string, unknown>>(
  raw: string
): T | null {
  if (!raw?.trim()) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    // fall through to tolerant extraction
  }

  try {
    return JSON.parse(extractJsonBody(raw)) as T;
  } catch {
    return null;
  }
}

/** Parse agent JSON, throwing a descriptive AgentJsonError when unrecoverable. */
export function parseAgentJson<T = Record<string, unknown>>(
  agent: string,
  raw: string
): T {
  const parsed = tryParseAgentJson<T>(raw);
  if (parsed === null || typeof parsed !== "object") {
    throw new AgentJsonError(agent, raw);
  }
  return parsed;
}
