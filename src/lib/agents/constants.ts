export const AGENTS = [
  {
    id: "research",
    name: "Research Agent",
    description: "Finds real places, distances and travel times from OpenStreetMap and OSRM",
    icon: "🔎",
    field: "destinationResearch" as const,
    phase: 1,
  },
  {
    id: "stays",
    name: "Hotel Agent",
    description: "Picks a real property that fits the budget and travel style",
    icon: "🏨",
    field: "staysOutput" as const,
    phase: 2,
  },
  {
    id: "activities",
    name: "Activity Agent",
    description: "Selects real attractions matching the traveller's interests",
    icon: "🎯",
    field: "activitiesOutput" as const,
    phase: 2,
  },
  {
    id: "food",
    name: "Food Agent",
    description: "Selects real restaurants and cafes near the day's route",
    icon: "🍴",
    field: "foodOutput" as const,
    phase: 2,
  },
  {
    id: "transportation",
    name: "Transport Agent",
    description: "Costs the intercity journey and local getting-around",
    icon: "🚌",
    field: "transportationOutput" as const,
    phase: 2,
  },
  {
    id: "budget",
    name: "Budget Agent",
    description: "Enforces the ₹ budget, downgrading choices until the trip fits",
    icon: "💰",
    field: "budgetOutput" as const,
    phase: 3,
  },
  {
    id: "itinerary",
    name: "Itinerary Agent",
    description: "Builds the day-by-day schedule around real opening hours and travel legs",
    icon: "📅",
    field: "itineraryOutput" as const,
    phase: 4,
  },
  {
    id: "verification",
    name: "Verification Agent",
    description: "Checks places are real, budget holds, dates line up and nothing overlaps",
    icon: "✅",
    field: "validationOutput" as const,
    phase: 5,
  },
] as const;

export type AgentId = (typeof AGENTS)[number]["id"];

export type GenerationFields = {
  currentAgent?: string | null;
  status: string;
  staysOutput?: unknown;
  activitiesOutput?: unknown;
  foodOutput?: unknown;
  transportationOutput?: unknown;
  destinationResearch?: unknown;
  budgetOutput?: unknown;
  itineraryOutput?: unknown;
  validationOutput?: unknown;
};

export type AgentStatus =
  | "pending"
  | "running"
  | "completed"
  | "skipped"
  | "failed";

export function getAgentStatus(
  agentId: string,
  generation: GenerationFields
): AgentStatus {
  const agent = AGENTS.find((a) => a.id === agentId);
  if (!agent) return "pending";

  const output = generation[agent.field];
  if (output) return "completed";

  if (generation.status === "FAILED") {
    return generation.currentAgent === agentId ? "failed" : "pending";
  }

  if (generation.currentAgent === agentId) return "running";

  // The pipeline finished but this agent produced nothing: it degraded.
  if (generation.status === "COMPLETED") return "skipped";

  const agentIndex = AGENTS.findIndex((a) => a.id === agentId);
  const currentIndex = AGENTS.findIndex((a) => a.id === generation.currentAgent);
  if (currentIndex > agentIndex) return "skipped";

  return "pending";
}
