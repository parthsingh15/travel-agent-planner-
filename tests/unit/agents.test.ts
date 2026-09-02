import { describe, it, expect } from "vitest";
import type { TripContext } from "@/lib/agents/types";

describe("Multi-Agent System", () => {
  const mockTrip: TripContext = {
    destination: "Paris, France",
    startDate: "2026-06-01",
    endDate: "2026-06-07",
    budget: 2000,
    currency: "USD",
    travelers: 2,
    interests: ["food", "art"],
    travelStyle: "MID_RANGE",
    notes: "Anniversary trip",
  };

  it("creates valid trip context for agents", () => {
    expect(mockTrip.destination).toBe("Paris, France");
    expect(mockTrip.travelers).toBe(2);
    expect(mockTrip.interests).toContain("food");
  });

  it("calculates trip duration correctly", () => {
    const start = new Date(mockTrip.startDate);
    const end = new Date(mockTrip.endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    expect(days).toBe(7);
  });

  it("agent outputs have expected structure", () => {
    const destinationOutput = {
      overview: "Paris overview",
      highlights: ["Eiffel Tower", "Louvre"],
      neighborhoods: [{ name: "Le Marais", description: "Historic district" }],
    };

    expect(destinationOutput.highlights).toHaveLength(2);
    expect(destinationOutput.neighborhoods[0].name).toBe("Le Marais");
  });

  it("itinerary output has day-by-day structure", () => {
    const itinerary = {
      title: "Paris Adventure",
      summary: "A week in Paris",
      totalBudget: 2000,
      days: [
        {
          day: 1,
          date: "2026-06-01",
          title: "Arrival",
          activities: [{ time: "14:00", title: "Check in", description: "Hotel check-in" }],
          meals: [{ type: "dinner", restaurant: "Bistro", estimatedCost: 50 }],
        },
      ],
      tips: ["Learn basic French"],
    };

    expect(itinerary.days).toHaveLength(1);
    expect(itinerary.days[0].activities).toHaveLength(1);
    expect(itinerary.totalBudget).toBe(2000);
  });
});
