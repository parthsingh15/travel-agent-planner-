import { callAgentJson } from "./provider-client";
import type { AgentResult, TripContext } from "./types";

const SYSTEM_PROMPT = `You are an Activities Planning Agent for a travel planning system.
Suggest activities and attractions. Return JSON:
{
  "activities": [
    {
      "name": "activity name",
      "description": "description",
      "duration": "2-3 hours",
      "cost": 25,
      "category": "culture|adventure|food|nature|shopping|nightlife",
      "bestTime": "morning|afternoon|evening",
      "location": "area/neighborhood"
    }
  ],
  "dayThemes": ["Day 1 theme", "Day 2 theme"],
  "mustDo": ["must do 1", "must do 2"],
  "freeActivities": ["free activity 1"]
}
Return valid JSON only.`;

export async function runActivitiesAgent(
  trip: TripContext,
  destinationResearch: Record<string, unknown>
): Promise<AgentResult> {
  const userPrompt = `Plan activities for ${trip.destination}
Dates: ${trip.startDate} to ${trip.endDate}
Budget: ${trip.budget} ${trip.currency}
Travelers: ${trip.travelers}
Style: ${trip.travelStyle}
Interests: ${trip.interests.join(", ") || "general"}
Destination research: ${JSON.stringify(destinationResearch)}`;

  const { output, raw } = await callAgentJson(
    "activities",
    SYSTEM_PROMPT,
    userPrompt
  );
  return { agent: "activities", output, raw };
}
