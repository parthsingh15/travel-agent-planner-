import { describe, it, expect } from "vitest";
import { AGENTS, getAgentStatus } from "@/lib/agents/constants";

/** The agents the research pipeline actually runs, in order. */
const SPEC_AGENTS = [
  "research",
  "stays",
  "activities",
  "food",
  "transportation",
  "budget",
  "itinerary",
  "verification",
];

describe("agent registry", () => {
  it("registers every agent required by the spec", () => {
    const ids = AGENTS.map((a) => a.id);
    for (const id of SPEC_AGENTS) {
      expect(ids).toContain(id);
    }
  });

  it("starts with research, so nothing is planned before facts are gathered", () => {
    expect(AGENTS[0].id).toBe("research");
  });

  it("ends with verification, so nothing is saved unchecked", () => {
    expect(AGENTS[AGENTS.length - 1].id).toBe("verification");
  });

  it("has no duplicate agent ids or output fields", () => {
    const ids = AGENTS.map((a) => a.id);
    const fields = AGENTS.map((a) => a.field);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it("orders phases monotonically so the UI renders execution order", () => {
    const phases = AGENTS.map((a) => a.phase);
    expect([...phases].sort((a, b) => a - b)).toEqual(phases);
  });
});

describe("getAgentStatus", () => {
  it("reports the currently running agent", () => {
    expect(
      getAgentStatus("stays", { status: "IN_PROGRESS", currentAgent: "stays" })
    ).toBe("running");
  });

  it("reports agents that have produced output as completed", () => {
    expect(
      getAgentStatus("stays", {
        status: "IN_PROGRESS",
        currentAgent: "activities",
        staysOutput: { selected: "Hotel" },
      })
    ).toBe("completed");
  });

  it("reports not-yet-reached agents as pending", () => {
    expect(
      getAgentStatus("verification", {
        status: "IN_PROGRESS",
        currentAgent: "stays",
      })
    ).toBe("pending");
  });

  it("reports a degraded agent on a completed run as skipped, not completed", () => {
    expect(
      getAgentStatus("food", {
        status: "COMPLETED",
        currentAgent: "validation",
        itineraryOutput: { title: "Trip" },
      })
    ).toBe("skipped");
  });

  it("marks the agent that broke a failed run", () => {
    expect(
      getAgentStatus("itinerary", { status: "FAILED", currentAgent: "itinerary" })
    ).toBe("failed");
  });

  it("still credits work completed before a run failed", () => {
    expect(
      getAgentStatus("stays", {
        status: "FAILED",
        currentAgent: "itinerary",
        staysOutput: { selected: "Hotel" },
      })
    ).toBe("completed");
  });
});
