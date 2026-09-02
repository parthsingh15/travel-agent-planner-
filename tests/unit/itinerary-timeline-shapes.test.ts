import { describe, it, expect } from "vitest";
import {
  normalizeDay,
  isLegacyDay,
  type AnyDay,
} from "@/components/travel/itinerary-timeline";

/**
 * Regression guard: itineraries generated before the research pipeline store
 * days as { activities, meals }. Rendering those must never throw - a crash
 * here took down every existing trip page.
 */
const legacyDay: AnyDay = {
  day: 1,
  date: "2026-11-14",
  title: "Arrival & Amber Fort",
  activities: [
    { time: "10:00", title: "Amber Fort", description: "Hilltop fort", estimatedCost: 200 },
    { time: "14:30", title: "City Palace", description: "Royal residence", estimatedCost: 300 },
  ],
  meals: [{ type: "dinner", restaurant: "Johari Bazaar", estimatedCost: 300 }],
  dailyBudget: 5500,
};

const modernDay: AnyDay = {
  day: 1,
  date: "2026-11-14",
  title: "Arrival in Manali",
  dayCost: 1350,
  entries: [
    {
      time: "09:00", endTime: "09:45", kind: "checkin",
      title: "Check in at Travelosic Junction", placeName: "Travelosic Junction",
      location: "Manu Mandir Road", osmUrl: "https://www.openstreetmap.org/node/1",
      durationMin: 45, cost: { value: 1050, confidence: "ESTIMATED" },
    },
  ],
};

describe("itinerary shape handling", () => {
  it("detects the legacy shape", () => {
    expect(isLegacyDay(legacyDay)).toBe(true);
    expect(isLegacyDay(modernDay)).toBe(false);
  });

  it("adapts legacy activities and meals into entries", () => {
    const d = normalizeDay(legacyDay);
    expect(d.entries).toHaveLength(3);
    expect(d.entries.map((e) => e.title)).toEqual([
      "Amber Fort",
      "City Palace",
      "dinner at Johari Bazaar",
    ]);
  });

  it("keeps legacy costs but marks them estimated", () => {
    const d = normalizeDay(legacyDay);
    expect(d.entries[0].cost).toMatchObject({ value: 200, confidence: "ESTIMATED" });
  });

  it("gives legacy entries no source link, since they have none", () => {
    const d = normalizeDay(legacyDay);
    expect(d.entries.every((e) => e.osmUrl === null)).toBe(true);
  });

  it("uses the legacy daily budget as the day cost", () => {
    expect(normalizeDay(legacyDay).dayCost).toBe(5500);
  });

  it("passes a modern day through unchanged", () => {
    const d = normalizeDay(modernDay);
    expect(d.entries).toHaveLength(1);
    expect(d.entries[0].osmUrl).toContain("openstreetmap.org");
    expect(d.dayCost).toBe(1350);
  });

  it("survives a day with no activities or meals at all", () => {
    const d = normalizeDay({ day: 2, date: "2026-11-15", title: "Free day" });
    expect(d.entries).toEqual([]);
    expect(d.dayCost).toBe(0);
  });

  it("survives malformed legacy entries missing time and title", () => {
    const d = normalizeDay({
      day: 3, date: "2026-11-16", title: "Odd day",
      activities: [{ description: "no time or title" }],
      meals: [{}],
    });
    expect(d.entries).toHaveLength(2);
    expect(d.entries[0].time).toBe("09:00");
    expect(d.entries[0].title).toBe("Activity");
    expect(d.entries[1].title).toBe("Meal");
  });

  it("computes a day cost when the legacy budget is absent", () => {
    const d = normalizeDay({
      day: 4, date: "2026-11-17", title: "x",
      activities: [{ time: "09:00", title: "A", estimatedCost: 100 }],
      meals: [{ type: "lunch", restaurant: "B", estimatedCost: 50 }],
    });
    expect(d.dayCost).toBe(150);
  });
});
