import { callAgentJson } from "./provider-client";
import type { AgentResult, TripContext } from "./types";

const SYSTEM_PROMPT = `You are a Budget Planning Agent.
Create a detailed budget breakdown. Return JSON:
{
  "totalBudget": 2000,
  "breakdown": {
    "accommodation": {"amount": 600, "percentage": 30},
    "food": {"amount": 400, "percentage": 20},
    "activities": {"amount": 500, "percentage": 25},
    "transportation": {"amount": 300, "percentage": 15},
    "miscellaneous": {"amount": 200, "percentage": 10}
  },
  "dailyBudget": 200,
  "savingsTips": ["tip 1"],
  "splurgeRecommendations": ["where to splurge"],
  "emergencyFund": 200,
  "withinBudget": true
}
Return valid JSON only.`;

export async function runBudgetAgent(
  trip: TripContext,
  agentOutputs: Record<string, unknown>
): Promise<AgentResult> {
  const userPrompt = `Create budget plan for ${trip.destination}
Total budget: ${trip.budget} ${trip.currency}
Travelers: ${trip.travelers}
Dates: ${trip.startDate} to ${trip.endDate}
Agent outputs: ${JSON.stringify(agentOutputs)}`;

  const { output, raw } = await callAgentJson(
    "budget",
    SYSTEM_PROMPT,
    userPrompt
  );
  return { agent: "budget", output, raw };
}
