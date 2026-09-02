import { callAgentJson } from "./provider-client";
import type { AgentResult, TripContext } from "./types";

const SYSTEM_PROMPT = `You are a Destination Research Agent for a travel planning system.
Research the destination thoroughly and return a JSON object with:
{
  "overview": "Brief destination overview",
  "bestTimeToVisit": "When to visit",
  "climate": "Climate info for travel dates",
  "culture": "Cultural highlights and etiquette",
  "safety": "Safety tips",
  "highlights": ["top attraction 1", "top attraction 2"],
  "neighborhoods": [{"name": "area", "description": "why visit"}],
  "localCustoms": ["custom 1"],
  "visaInfo": "Visa requirements if applicable"
}
Be specific to the destination and travel dates. Return valid JSON only.`;

export async function runDestinationAgent(
  trip: TripContext
): Promise<AgentResult> {
  const userPrompt = `Research destination: ${trip.destination}
Travel dates: ${trip.startDate} to ${trip.endDate}
Travelers: ${trip.travelers}
Travel style: ${trip.travelStyle}
Interests: ${trip.interests.join(", ") || "general tourism"}
${trip.notes ? `Notes: ${trip.notes}` : ""}`;

  const { output, raw } = await callAgentJson(
    "destination",
    SYSTEM_PROMPT,
    userPrompt
  );
  return { agent: "destination", output, raw };
}
