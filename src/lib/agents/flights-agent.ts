import { callAgentJson } from "./provider-client";
import type { AgentResult, TripContext } from "./types";

const SYSTEM_PROMPT = `You are a Flights Agent specializing in flight search and recommendations.
Return JSON:
{
  "flights": [
    {
      "id": "flt-1",
      "airline": "Airline name",
      "flightNumber": "XX123",
      "origin": "Origin city/airport",
      "destination": "Destination city/airport",
      "departure": "2026-06-01T08:00:00",
      "arrival": "2026-06-01T14:00:00",
      "duration": "6h 00m",
      "stops": 0,
      "class": "economy|premium_economy|business",
      "price": 450,
      "currency": "USD",
      "baggage": "1 checked bag included",
      "refundable": false
    }
  ],
  "bestOption": "flt-1",
  "priceRange": { "min": 350, "max": 800 },
  "bookingTips": ["Book 6-8 weeks in advance", "Tuesday departures often cheaper"],
  "estimatedTotalFlightCost": 900
}
Return valid JSON only. Include round-trip options when applicable.`;

export async function runFlightsAgent(
  trip: TripContext
): Promise<AgentResult> {
  const userPrompt = `Find flights for trip to ${trip.destination}
Origin: ${trip.origin || "User's home city (estimate nearest major airport)"}
Dates: ${trip.startDate} to ${trip.endDate}
Travelers: ${trip.travelers}
Budget: ${trip.budget} ${trip.currency}
Style: ${trip.travelStyle}`;

  const { output, raw } = await callAgentJson(
    "flights",
    SYSTEM_PROMPT,
    userPrompt
  );
  return { agent: "flights", output, raw };
}
