import { describe, it, expect } from "vitest";
import { verifyItinerary } from "@/lib/planner/verify";
import type { PlannedDay, ScheduleEntry } from "@/lib/planner/assemble";
import type { CostBreakdown } from "@/lib/planner/budget";

const entry = (o: Partial<ScheduleEntry> = {}): ScheduleEntry => ({
  time: "09:00", endTime: "10:00", kind: "attraction",
  title: "Visit Hadimba Temple", placeName: "Hadimba Temple",
  location: "Hadimba Road", osmUrl: "https://www.openstreetmap.org/node/1",
  lat: 32.2, lon: 77.1, durationMin: 60, cost: null, ...o,
});

const day = (n: number, date: string, entries: ScheduleEntry[]): PlannedDay => ({
  day: n, date, title: `Day ${n}`, entries, dayCost: 0,
});

const breakdown = (o: Partial<CostBreakdown> = {}): CostBreakdown => ({
  lines: (["stay", "food", "localTransport", "misc"] as const).map((key) => ({
    key, label: key, detail: "",
    amount: { value: 100, confidence: "ESTIMATED", source: { method: "heuristic", label: "x", fetchedAt: "" } },
  })),
  total: 400, budget: 1000, remaining: 600, withinBudget: true, currency: "INR", ...o,
});

const ctx = { startDate: "2026-11-14", expectedDays: 1, travellers: 2 };

describe("verification agent", () => {
  it("approves a clean itinerary", () => {
    const r = verifyItinerary([day(1, "2026-11-14", [entry()])], breakdown(), ctx);
    expect(r.approved).toBe(true);
    expect(r.score).toBe(100);
  });

  it("rejects leftover placeholder text", () => {
    const r = verifyItinerary(
      [day(1, "2026-11-14", [entry({ title: "Morning activity", placeName: "Morning activity" })])],
      breakdown(), ctx
    );
    expect(r.approved).toBe(false);
    expect(r.issues.some((i) => i.code === "PLACEHOLDER_TEXT")).toBe(true);
  });

  it.each([
    "Coordinated by supervisor",
    "Afternoon activity",
    "Recommended",
    "[REAL HOTEL]",
    "TBD",
  ])("rejects the placeholder %s", (text) => {
    const r = verifyItinerary(
      [day(1, "2026-11-14", [entry({ title: text, placeName: text })])],
      breakdown(), ctx
    );
    expect(r.approved).toBe(false);
  });

  it("rejects a place with no OSM backing", () => {
    const r = verifyItinerary(
      [day(1, "2026-11-14", [entry({ osmUrl: null })])], breakdown(), ctx
    );
    expect(r.issues.some((i) => i.code === "UNVERIFIED_PLACE")).toBe(true);
    expect(r.approved).toBe(false);
  });

  it("rejects an over-budget trip", () => {
    const r = verifyItinerary(
      [day(1, "2026-11-14", [entry()])],
      breakdown({ total: 2000, budget: 1000, remaining: -1000, withinBudget: false }),
      ctx
    );
    expect(r.approved).toBe(false);
    expect(r.issues.some((i) => i.code === "OVER_BUDGET")).toBe(true);
  });

  it("rejects overlapping activities", () => {
    const r = verifyItinerary(
      [day(1, "2026-11-14", [
        entry({ time: "09:00", endTime: "11:00" }),
        entry({ time: "10:00", endTime: "12:00", placeName: "Other", title: "Visit Other" }),
      ])],
      breakdown(), ctx
    );
    expect(r.approved).toBe(false);
    expect(r.issues.some((i) => i.code === "OVERLAP")).toBe(true);
  });

  it("rejects a wrong date", () => {
    const r = verifyItinerary([day(1, "2026-12-25", [entry()])], breakdown(), ctx);
    expect(r.approved).toBe(false);
    expect(r.issues.some((i) => i.code === "WRONG_DATE")).toBe(true);
  });

  it("rejects an empty day", () => {
    const r = verifyItinerary([day(1, "2026-11-14", [])], breakdown(), ctx);
    expect(r.approved).toBe(false);
    expect(r.issues.some((i) => i.code === "EMPTY_DAY")).toBe(true);
  });

  it("warns about a duplicated attraction without failing", () => {
    const r = verifyItinerary(
      [
        day(1, "2026-11-14", [entry()]),
        day(2, "2026-11-15", [entry()]),
      ],
      breakdown(), { ...ctx, expectedDays: 2 }
    );
    expect(r.issues.some((i) => i.code === "DUPLICATE_PLACE")).toBe(true);
    expect(r.approved).toBe(true);
  });

  it("does not count the intercity leg as excessive local travel", () => {
    const r = verifyItinerary(
      [day(1, "2026-11-14", [
        entry({
          kind: "travel", placeName: null, osmUrl: null, title: "Delhi to Manali by bus",
          travelFromPrevious: { distanceKm: 532, durationMin: 808, confidence: "ESTIMATED" },
        }),
        entry({ time: "12:00", endTime: "13:00" }),
      ])],
      breakdown(), ctx
    );
    expect(r.issues.some((i) => i.code === "EXCESSIVE_TRAVEL")).toBe(false);
  });

  it("warns when a major cost category is missing", () => {
    const r = verifyItinerary(
      [day(1, "2026-11-14", [entry()])],
      breakdown({ lines: [] }), ctx
    );
    expect(r.issues.some((i) => i.code === "MISSING_COST")).toBe(true);
  });

  it("counts real places and cost confidence", () => {
    const r = verifyItinerary(
      [day(1, "2026-11-14", [
        entry({ cost: { value: 100, confidence: "VERIFIED", source: { method: "openstreetmap", label: "x", fetchedAt: "" } } }),
        entry({ time: "11:00", endTime: "12:00", placeName: "B", title: "Visit B",
          cost: { value: 50, confidence: "ESTIMATED", source: { method: "heuristic", label: "y", fetchedAt: "" } } }),
      ])],
      breakdown(), ctx
    );
    expect(r.stats.realPlaces).toBe(2);
    expect(r.stats.verifiedCosts).toBe(1);
    expect(r.stats.estimatedCosts).toBe(1);
  });
});
