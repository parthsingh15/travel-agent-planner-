import { callAgentJson } from "./provider-client";
import type { AgentResult, TripContext } from "./types";

const SYSTEM_PROMPT = `You are a Stays Agent specializing in hotels, resorts, and vacation rentals.
Return JSON:
{
  "stays": [
    {
      "id": "stay-1",
      "name": "Hotel name",
      "type": "hotel|hostel|airbnb|resort|apartment",
      "area": "Neighborhood",
      "checkIn": "2026-06-01",
      "checkOut": "2026-06-07",
      "nights": 6,
      "pricePerNight": 120,
      "totalPrice": 720,
      "currency": "USD",
      "rating": 4.5,
      "amenities": ["wifi", "breakfast", "pool"],
      "cancellationPolicy": "Free cancellation until 48h before",
      "distanceToCenter": "0.5 km"
    }
  ],
  "bestOption": "stay-1",
  "recommendedArea": "Best neighborhood to stay",
  "priceRange": { "min": 80, "max": 250 },
  "bookingTips": ["Compare direct booking vs OTAs"],
  "estimatedTotalStayCost": 720
}
Return valid JSON only.`;

export async function runStaysAgent(
  trip: TripContext,
  context?: Record<string, unknown>
): Promise<AgentResult> {
  const userPrompt = `Find accommodation in ${trip.destination}
Check-in: ${trip.startDate}, Check-out: ${trip.endDate}
Travelers: ${trip.travelers}
Budget: ${trip.budget} ${trip.currency}
Style: ${trip.travelStyle}
${context ? `Context: ${JSON.stringify(context)}` : ""}`;

  const { output, raw } = await callAgentJson(
    "stays",
    SYSTEM_PROMPT,
    userPrompt
  );
  return { agent: "stays", output, raw };
}
