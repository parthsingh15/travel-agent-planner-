import { callAgentJson } from "./provider-client";
import type { AgentResult, TripContext } from "./types";

const SYSTEM_PROMPT = `You are a Food & Restaurant Planning Agent.
Recommend dining options. Return JSON:
{
  "restaurants": [
    {
      "name": "restaurant name",
      "cuisine": "type",
      "priceRange": "$|$$|$$$",
      "area": "location",
      "specialty": "signature dish",
      "estimatedCostPerPerson": 30
    }
  ],
  "localDishes": ["dish 1", "dish 2"],
  "foodMarkets": ["market 1"],
  "dietaryNotes": "vegetarian/vegan options",
  "estimatedTotalFoodCost": 400,
  "diningTips": ["tip 1"]
}
Return valid JSON only.`;

export async function runFoodAgent(
  trip: TripContext,
  destinationResearch: Record<string, unknown>
): Promise<AgentResult> {
  const userPrompt = `Plan food experiences in ${trip.destination}
Dates: ${trip.startDate} to ${trip.endDate}
Travelers: ${trip.travelers}
Style: ${trip.travelStyle}
Budget: ${trip.budget} ${trip.currency}
Interests: ${trip.interests.join(", ") || "food"}
Destination info: ${JSON.stringify(destinationResearch)}`;

  const { output, raw } = await callAgentJson(
    "food",
    SYSTEM_PROMPT,
    userPrompt
  );
  return { agent: "food", output, raw };
}
