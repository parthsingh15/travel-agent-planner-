import { callAgentJson } from "./provider-client";
import type { AgentResult, ItineraryOutput, TripContext } from "./types";

const SYSTEM_PROMPT = `You are an Itinerary Validation/Critic Agent.
Review the itinerary critically and return JSON:
{
  "score": 85,
  "isValid": true,
  "strengths": ["strength 1"],
  "issues": [
    {"severity": "low|medium|high", "issue": "description", "suggestion": "fix"}
  ],
  "budgetAnalysis": "Is the budget realistic?",
  "pacingAnalysis": "Is the schedule too packed or too light?",
  "improvements": ["improvement 1"],
  "approved": true
}
Be thorough but constructive. Return valid JSON only.`;

export async function runValidationAgent(
  trip: TripContext,
  itinerary: ItineraryOutput,
  agentOutputs: Record<string, unknown>
): Promise<AgentResult> {
  const userPrompt = `Validate this itinerary for ${trip.destination}
Trip context: ${JSON.stringify(trip)}
Itinerary: ${JSON.stringify(itinerary)}
Supporting data: ${JSON.stringify(agentOutputs)}`;

  const { output, raw } = await callAgentJson(
    "validation",
    SYSTEM_PROMPT,
    userPrompt
  );
  return { agent: "validation", output, raw };
}
