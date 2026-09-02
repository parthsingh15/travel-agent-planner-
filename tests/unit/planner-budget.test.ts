import { describe, it, expect } from "vitest";
import { costPlan, fitToBudget, type PlanSelection } from "@/lib/planner/budget";
import type { Poi } from "@/lib/research/overpass";
import type { TransportOption } from "@/lib/research";
import { estimated } from "@/lib/research/provenance";

const poi = (o: Partial<Poi>): Poi => ({
  id: "node/1", osmType: "node", osmId: 1, name: "Place", category: "attraction",
  kind: "attraction", lat: 32, lon: 77,
  osmUrl: "https://www.openstreetmap.org/node/1", ...o,
});

const transport = (mode: TransportOption["mode"], fare: number): TransportOption => ({
  mode,
  distanceKm: estimated(500, "test"),
  durationMin: estimated(600, "test"),
  fare: estimated(fare, "test"),
});

const ctx = { destination: "Manali", travellers: 2, nights: 4, days: 5, budget: 50000 };

const baseSelection = (): PlanSelection => ({
  stay: poi({ id: "node/h", name: "Hotel Snow", category: "stay", kind: "hotel", stars: 4 }),
  transport: transport("cab", 8000),
  attractions: [
    poi({ id: "node/a1", name: "Museum", kind: "museum" }),
    poi({ id: "node/a2", name: "Fort", kind: "fort" }),
  ],
  meals: [poi({ id: "node/f1", name: "Cafe", category: "food", kind: "restaurant" })],
  style: "LUXURY",
});

describe("cost breakdown", () => {
  it("includes every required category", () => {
    const b = costPlan(baseSelection(), ctx);
    const keys = b.lines.map((l) => l.key);
    for (const k of ["transport", "stay", "food", "activities", "localTransport", "misc"]) {
      expect(keys).toContain(k);
    }
  });

  it("totals the lines and computes the remainder", () => {
    const b = costPlan(baseSelection(), ctx);
    expect(b.total).toBe(b.lines.reduce((s, l) => s + l.amount.value, 0));
    expect(b.remaining).toBe(b.budget - b.total);
  });

  it("doubles a one-way fare but not an outstation cab", () => {
    const cab = costPlan(baseSelection(), ctx).lines.find((l) => l.key === "transport")!;
    expect(cab.amount.value).toBe(8000);

    const bus = costPlan(
      { ...baseSelection(), transport: transport("bus", 1000) }, ctx
    ).lines.find((l) => l.key === "transport")!;
    expect(bus.amount.value).toBe(2000);
  });

  it("scales the hotel by nights and rooms", () => {
    const one = costPlan(baseSelection(), { ...ctx, travellers: 2 })
      .lines.find((l) => l.key === "stay")!.amount.value;
    const four = costPlan(baseSelection(), { ...ctx, travellers: 4 })
      .lines.find((l) => l.key === "stay")!.amount.value;
    expect(four).toBe(one * 2); // 1 room -> 2 rooms
  });

  it("reports over-budget honestly rather than clamping", () => {
    const b = costPlan(baseSelection(), { ...ctx, budget: 1000 });
    expect(b.withinBudget).toBe(false);
    expect(b.remaining).toBeLessThan(0);
  });
});

describe("budget fitting", () => {
  const pools = {
    stays: [
      poi({ id: "node/h", name: "Hotel Snow", category: "stay", kind: "hotel", stars: 4 }),
      poi({ id: "node/g", name: "Guest House", category: "stay", kind: "guest_house" }),
      poi({ id: "node/hs", name: "Backpackers", category: "stay", kind: "hostel" }),
    ],
    food: [
      poi({ id: "node/f1", name: "Fine Dining", category: "food", kind: "restaurant" }),
      poi({ id: "node/f2", name: "Corner Cafe", category: "food", kind: "cafe" }),
    ],
    attractions: [
      poi({ id: "node/a1", name: "Museum", kind: "museum" }),
      poi({ id: "node/a2", name: "Fort", kind: "fort" }),
      poi({ id: "node/a3", name: "Free Viewpoint", kind: "viewpoint" }),
    ],
    transport: [transport("cab", 8000), transport("bus", 1200), transport("train", 800)],
  };

  it("leaves a comfortable plan untouched", () => {
    const r = fitToBudget(baseSelection(), { ...ctx, budget: 200000 }, pools);
    expect(r.downgrades).toHaveLength(0);
    expect(r.impossible).toBe(false);
  });

  it("applies downgrades to fit a tight budget", () => {
    const r = fitToBudget(baseSelection(), { ...ctx, budget: 25000 }, pools);
    expect(r.downgrades.length).toBeGreaterThan(0);
    expect(r.breakdown.total).toBeLessThanOrEqual(25000);
    expect(r.impossible).toBe(false);
  });

  it("switches to the cheapest researched transport first", () => {
    const r = fitToBudget(baseSelection(), { ...ctx, budget: 25000 }, pools);
    expect(r.selection.transport?.mode).toBe("train");
    expect(r.downgrades[0].step).toMatch(/train/);
  });

  it("never returns a plan above budget without flagging it", () => {
    const r = fitToBudget(baseSelection(), { ...ctx, budget: 3000 }, pools);
    expect(r.impossible).toBe(true);
    expect(r.shortfall).toBeGreaterThan(0);
    expect(r.breakdown.withinBudget).toBe(false);
  });

  it("reports a shortfall equal to the overrun", () => {
    const r = fitToBudget(baseSelection(), { ...ctx, budget: 3000 }, pools);
    expect(r.shortfall).toBe(r.breakdown.total - 3000);
  });

  it("each downgrade actually reduces the total", () => {
    const r = fitToBudget(baseSelection(), { ...ctx, budget: 5000 }, pools);
    for (const d of r.downgrades) expect(d.savedApprox).toBeGreaterThan(0);
  });

  it("only ever selects places from the researched pools", () => {
    const r = fitToBudget(baseSelection(), { ...ctx, budget: 5000 }, pools);
    const ids = new Set(pools.attractions.map((a) => a.id));
    for (const a of r.selection.attractions) expect(ids.has(a.id)).toBe(true);
    if (r.selection.stay) {
      expect(pools.stays.map((s) => s.id)).toContain(r.selection.stay.id);
    }
  });
});
