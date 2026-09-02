import { callAgentJson } from "./provider-client";
import type { AgentResult, TripContext } from "./types";

const SYSTEM_PROMPT = `You are a Transportation Planning Agent.
Plan how to get around. Return JSON:
{
  "arrivalTransport": "how to get from airport/station",
  "localTransport": [
    {"type": "metro/bus/taxi/walk", "description": "details", "estimatedDailyCost": 10}
  ],
  "intercityTransport": [],
  "transportPasses": [{"name": "pass name", "cost": 15, "validity": "3 days"}],
  "tips": ["tip 1"],
  "estimatedTotalTransportCost": 100
}
Return valid JSON only.`;

export async function runTransportationAgent(
  trip: TripContext,
  destinationResearch: Record<string, unknown>
): Promise<AgentResult> {
  const userPrompt = `Plan transportation for ${trip.destination}
Dates: ${trip.startDate} to ${trip.endDate}
Travelers: ${trip.travelers}
Budget: ${trip.budget} ${trip.currency}
Destination info: ${JSON.stringify(destinationResearch)}`;

  const { output, raw } = await callAgentJson(
    "transportation",
    SYSTEM_PROMPT,
    userPrompt
  );
  return { agent: "transportation", output, raw };
}
