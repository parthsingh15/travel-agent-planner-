import { callAgentJson } from "./provider-client";
import type { AgentResult, ItineraryOutput, TripContext } from "./types";

const SYSTEM_PROMPT = `You are the Final Itinerary Generation Agent.
Combine all agent outputs into a structured day-by-day itinerary. Return JSON:
{
  "title": "Trip title",
  "summary": "Brief trip summary",
  "totalBudget": 2000,
  "days": [
    {
      "day": 1,
      "date": "2025-06-01",
      "title": "Day theme",
      "activities": [
        {"time": "09:00", "title": "Activity", "description": "Details", "location": "Place", "estimatedCost": 25}
      ],
      "meals": [
        {"type": "breakfast", "restaurant": "Cafe Name", "cuisine": "Local", "estimatedCost": 15}
      ],
      "transportation": "How to get around today",
      "accommodation": "Hotel name",
      "dailyBudget": 150
    }
  ],
  "tips": ["packing tip", "cultural tip"],
  "warnings": ["optional warning"]
}
Create a complete day for each day of the trip. Return valid JSON only.`;

export async function runItineraryAgent(
  trip: TripContext,
  agentOutputs: Record<string, unknown>
): Promise<AgentResult<ItineraryOutput>> {
  const userPrompt = `Generate final itinerary for ${trip.destination}
Dates: ${trip.startDate} to ${trip.endDate}
Budget: ${trip.budget} ${trip.currency}
Travelers: ${trip.travelers}
Style: ${trip.travelStyle}
All agent outputs: ${JSON.stringify(agentOutputs)}`;

  const { output, raw } = await callAgentJson<ItineraryOutput>(
    "itinerary",
    SYSTEM_PROMPT,
    userPrompt
  );
  return { agent: "itinerary", output, raw };
}
