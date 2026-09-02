import { callAgentJson } from "./provider-client";
import type { AgentResult, TripContext } from "./types";

const SYSTEM_PROMPT = `You are a Supervisor Agent that coordinates Flights, Stays, and Activities agents.
You receive their outputs and produce a unified travel plan recommendation.
Return JSON:
{
  "summary": "Executive summary of the coordinated plan",
  "coordinationNotes": "How flights, stays, and activities work together",
  "recommendedBundle": {
    "flightId": "flt-1",
    "stayId": "stay-1",
    "activityIds": ["act-1", "act-2"],
    "totalEstimatedCost": 2500,
    "savingsOpportunities": ["Book flight + stay bundle for 10% off"]
  },
  "schedule": [
    { "day": 1, "focus": "Arrival & check-in", "linkedItems": ["flt-1", "stay-1"] },
    { "day": 2, "focus": "City exploration", "linkedItems": ["act-1"] }
  ],
  "conflicts": [],
  "warnings": ["Allow 2h buffer after flight landing before check-in"],
  "approvalStatus": "approved|needs_review",
  "supervisorScore": 90
}
Return valid JSON only.`;

export async function runSupervisorAgent(
  trip: TripContext,
  agentOutputs: {
    flights?: Record<string, unknown>;
    stays?: Record<string, unknown>;
    activities?: Record<string, unknown>;
  }
): Promise<AgentResult> {
  const userPrompt = `Supervise and coordinate travel plan for ${trip.destination}
Dates: ${trip.startDate} to ${trip.endDate}
Travelers: ${trip.travelers}
Budget: ${trip.budget} ${trip.currency}

Flights Agent Output: ${JSON.stringify(agentOutputs.flights || {})}
Stays Agent Output: ${JSON.stringify(agentOutputs.stays || {})}
Activities Agent Output: ${JSON.stringify(agentOutputs.activities || {})}

Ensure flights align with check-in times, stays are near activity areas, and total cost fits budget.`;

  const { output, raw } = await callAgentJson(
    "supervisor",
    SYSTEM_PROMPT,
    userPrompt
  );
  return { agent: "supervisor", output, raw };
}
