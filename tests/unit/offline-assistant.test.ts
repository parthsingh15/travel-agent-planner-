import { describe, it, expect } from "vitest";
import { answerOffline } from "@/lib/chat/offline-assistant";
import type { TripFacts } from "@/lib/chat/trip-context";

const facts: TripFacts = {
  tripId: "t1", title: "Manali Trip", destination: "Manali", origin: "Delhi",
  startDate: "2026-11-14", endDate: "2026-11-18", days: 5, travellers: 2,
  budget: 50000, currency: "INR", travelStyle: "MID_RANGE",
  interests: ["nature"],
  itinerary: {
    versionNumber: 1, title: "5 days in Manali", totalCost: 28430, isLegacy: false,
    breakdown: [
      { label: "Transportation", amount: 3560, confidence: "ESTIMATED" },
      { label: "Hotel", amount: 4200, confidence: "ESTIMATED" },
      { label: "Food", amount: 13560, confidence: "ESTIMATED" },
    ],
    days: [
      {
        day: 1, date: "2026-11-14", title: "Arrival", dayCost: 5610,
        stops: [
          { time: "19:32", title: "Delhi → Manali by bus", placeName: null, kind: "travel", cost: 1780, confidence: "ESTIMATED" },
          { time: "09:00", title: "Check in at Travelosic Junction", placeName: "Travelosic Junction", kind: "checkin", cost: 1050, confidence: "ESTIMATED" },
          { time: "09:50", title: "Visit Manali WLS", placeName: "Manali WLS", kind: "attraction", cost: 300, confidence: "ESTIMATED" },
          { time: "12:30", title: "Lunch at Southern Souls", placeName: "Southern Souls", kind: "meal", cost: 1040, confidence: "ESTIMATED" },
        ],
      },
      {
        day: 2, date: "2026-11-15", title: "Exploring", dayCost: 900,
        stops: [
          { time: "09:00", title: "Visit Studio Manali", placeName: "Studio Manali", kind: "attraction", cost: 100, confidence: "ESTIMATED" },
        ],
      },
    ],
  },
  spend: {
    totalSpent: 12000, remaining: 38000, percentUsed: 24, overBudget: false,
    byCategory: [{ category: "TRANSPORT", amount: 8000 }, { category: "FOOD", amount: 4000 }],
  },
};

const strip = (s: string) => s.split("_Answered directly")[0].trim();

describe("offline assistant", () => {
  it("answers remaining budget with the real numbers", () => {
    const a = strip(answerOffline("How much money do I have left?", facts));
    expect(a).toContain("₹50,000");
    expect(a).toContain("₹12,000");
    expect(a).toContain("₹38,000");
  });

  it("reports being over budget when that is the case", () => {
    const over = { ...facts, spend: { ...facts.spend, totalSpent: 60000, remaining: -10000, overBudget: true, percentUsed: 120 } };
    const a = strip(answerOffline("how much budget left", over));
    expect(a).toMatch(/over budget by ₹10,000/i);
  });

  it("names the real hotel from the itinerary", () => {
    expect(strip(answerOffline("Where am I staying?", facts))).toContain("Travelosic Junction");
  });

  it("lists real restaurants, never invented ones", () => {
    const a = strip(answerOffline("Replace this restaurant", facts));
    expect(a).toContain("Southern Souls");
  });

  it("lists real attractions", () => {
    const a = strip(answerOffline("what activities are planned", facts));
    expect(a).toContain("Manali WLS");
    expect(a).toContain("Studio Manali");
  });

  it("identifies the priciest items when asked to cut a day's cost", () => {
    const a = strip(answerOffline("Make day 1 cheaper", facts));
    expect(a).toContain("Day 1");
    expect(a).toContain("₹1,780");
    expect(a).toContain("Delhi → Manali by bus");
  });

  it("targets the specific day named in the question", () => {
    const a = strip(answerOffline("Can you make day 2 cheaper?", facts));
    expect(a).toContain("Day 2");
  });

  it("assesses pacing from the real stop count", () => {
    const a = strip(answerOffline("Is my itinerary too busy?", facts));
    expect(a).toMatch(/sights per day/);
  });

  it("gives the transport leg and its budget", () => {
    const a = strip(answerOffline("how do I get there", facts));
    expect(a).toContain("Delhi → Manali by bus");
    expect(a).toContain("₹3,560");
  });

  it("returns the full cost breakdown", () => {
    const a = strip(answerOffline("total cost breakdown", facts));
    expect(a).toContain("Transportation ₹3,560");
    expect(a).toContain("₹28,430");
  });

  it("always discloses that conversational AI is off", () => {
    expect(answerOffline("anything", facts)).toMatch(/Conversational AI is off/);
  });

  it("names the key for the configured provider", () => {
    const original = process.env.AI_PROVIDER;

    process.env.AI_PROVIDER = "gemini";
    expect(answerOffline("anything", facts)).toContain("GEMINI_API_KEY");

    process.env.AI_PROVIDER = "openai";
    expect(answerOffline("anything", facts)).toContain("OPENAI_API_KEY");

    process.env.AI_PROVIDER = original;
  });

  it("says what it can do rather than bluffing on an off-topic question", () => {
    const a = strip(answerOffline("Tell me a joke", facts));
    expect(a).toContain("I can answer questions about");
    expect(a).not.toMatch(/supervisor-recommended bundle/i);
  });

  it("handles having no trip selected", () => {
    expect(answerOffline("hello", null)).toMatch(/open a trip/i);
  });

  it("handles a trip with no itinerary yet", () => {
    const bare = { ...facts, itinerary: null };
    const a = strip(answerOffline("what activities", bare));
    expect(a).toMatch(/No itinerary has been generated/i);
  });

  it("never emits the old canned marketing copy", () => {
    for (const q of ["restaurants", "budget", "activities", "hotel", "random"]) {
      const a = answerOffline(q, facts);
      expect(a).not.toMatch(/supervisor-recommended bundle/i);
      expect(a).not.toMatch(/Great question about your trip/i);
    }
  });
});
