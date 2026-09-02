// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    trip: { findFirst: vi.fn(), update: vi.fn() },
    itineraryGeneration: { update: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
    itineraryVersion: { findFirst: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
  createAuditLog: vi.fn(),
  planTrip: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.db }));
vi.mock("@/lib/audit", () => ({ createAuditLog: mocks.createAuditLog }));
vi.mock("@/lib/planner", () => ({ planTrip: mocks.planTrip }));

import { runResearchPipeline } from "@/lib/agents/research-pipeline";

const TRIP = {
  id: "trip-1",
  destination: "Manali",
  origin: "Delhi",
  startDate: new Date("2026-11-14"),
  endDate: new Date("2026-11-16"),
  budget: 50000,
  currency: "INR",
  travelers: 2,
  interests: ["nature"],
  travelStyle: "MID_RANGE",
  notes: null,
};

function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    destination: "Manali",
    days: [
      {
        day: 1,
        date: "2026-11-14",
        title: "Arrival in Manali",
        dayCost: 2000,
        entries: [
          {
            time: "09:00", endTime: "09:45", kind: "checkin",
            title: "Check in at Travelosic Junction",
            placeName: "Travelosic Junction",
            location: "Manu Mandir Road",
            osmUrl: "https://www.openstreetmap.org/node/1",
            lat: 32.2, lon: 77.1, durationMin: 45, cost: null,
          },
        ],
      },
    ],
    breakdown: {
      lines: [
        { key: "stay", label: "Hotel", detail: "x", amount: { value: 4200, confidence: "ESTIMATED", source: {}, } },
      ],
      total: 28430, budget: 50000, remaining: 21570,
      withinBudget: true, currency: "INR",
    },
    downgrades: [],
    verification: { approved: true, score: 100, issues: [], checks: [], stats: {} },
    research: { staysFound: 196, foodFound: 170, attractionsFound: 126, warnings: [] },
    selection: {
      stayName: "Travelosic Junction", transportMode: "bus",
      attractionNames: ["Manali WLS"], restaurantNames: ["Southern Souls"],
    },
    sources: [{ method: "openstreetmap", label: "OSM data", fetchedAt: "2026-09-02" }],
    budgetShortfall: null,
    ...overrides,
  };
}

/** Merge every field written across all generation updates. */
const written = () =>
  Object.assign({}, ...mocks.db.itineraryGeneration.update.mock.calls.map((c) => c[0].data));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.db.trip.findFirst.mockResolvedValue(TRIP);
  mocks.db.itineraryVersion.findFirst.mockResolvedValue({ versionNumber: 1 });
  mocks.db.itineraryVersion.create.mockResolvedValue({ id: "ver-2" });
  mocks.db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      itineraryGeneration: { update: mocks.db.itineraryGeneration.update },
      itineraryVersion: { create: mocks.db.itineraryVersion.create },
      trip: { update: mocks.db.trip.update },
    })
  );
  mocks.planTrip.mockResolvedValue({ ok: true, plan: makePlan() });
});

describe("research pipeline", () => {
  it("passes the trip's real parameters to the planner", async () => {
    await runResearchPipeline("gen-1", "trip-1", "user-1");

    expect(mocks.planTrip).toHaveBeenCalledWith({
      destination: "Manali",
      origin: "Delhi",
      startDate: "2026-11-14",
      endDate: "2026-11-16",
      travellers: 2,
      budget: 50000,
      travelStyle: "MID_RANGE",
      interests: ["nature"],
    });
  });

  it("persists every agent's researched output", async () => {
    await runResearchPipeline("gen-1", "trip-1", "user-1");
    const fields = written();

    for (const key of [
      "destinationResearch", "staysOutput", "activitiesOutput",
      "foodOutput", "transportationOutput", "budgetOutput",
      "itineraryOutput", "validationOutput",
    ]) {
      expect(fields[key], `${key} should be persisted`).toBeDefined();
    }
  });

  it("stores real researched place names, not placeholders", async () => {
    await runResearchPipeline("gen-1", "trip-1", "user-1");
    const fields = written();

    expect(fields.staysOutput.selected).toBe("Travelosic Junction");
    expect(fields.activitiesOutput.selected).toEqual(["Manali WLS"]);
    expect(fields.foodOutput.selected).toEqual(["Southern Souls"]);
  });

  it("creates the next version without overwriting history", async () => {
    await runResearchPipeline("gen-1", "trip-1", "user-1");

    const data = mocks.db.itineraryVersion.create.mock.calls[0][0].data;
    expect(data.versionNumber).toBe(2);
    expect(data.totalBudget).toBe(28430);
  });

  it("saves the cost breakdown, sources and verification as metadata", async () => {
    await runResearchPipeline("gen-1", "trip-1", "user-1");

    const meta = mocks.db.itineraryVersion.create.mock.calls[0][0].data.metadata;
    expect(meta.breakdown.total).toBe(28430);
    expect(meta.sources).toHaveLength(1);
    expect(meta.verification.score).toBe(100);
  });

  it("marks the trip PLANNED on success", async () => {
    await runResearchPipeline("gen-1", "trip-1", "user-1");
    expect(mocks.db.trip.update).toHaveBeenCalledWith({
      where: { id: "trip-1" },
      data: { status: "PLANNED" },
    });
  });

  it("refuses to save an itinerary that fails verification", async () => {
    mocks.planTrip.mockResolvedValue({
      ok: true,
      plan: makePlan({
        verification: {
          approved: false,
          score: 40,
          checks: [],
          stats: {},
          issues: [{ severity: "error", code: "PLACEHOLDER_TEXT", message: "Placeholder content" }],
        },
      }),
    });

    await expect(runResearchPipeline("gen-1", "trip-1", "user-1")).rejects.toThrow(
      /failed verification/i
    );
    expect(mocks.db.itineraryVersion.create).not.toHaveBeenCalled();
    expect(written().status).toBe("FAILED");
  });

  it("fails loudly when the destination cannot be researched", async () => {
    mocks.planTrip.mockResolvedValue({ ok: false, reason: 'Could not locate "Xyzzy".' });

    await expect(runResearchPipeline("gen-1", "trip-1", "user-1")).rejects.toThrow(
      /Could not locate/
    );
    expect(mocks.db.itineraryVersion.create).not.toHaveBeenCalled();
  });

  it("returns the trip to DRAFT when generation fails", async () => {
    mocks.planTrip.mockResolvedValue({ ok: false, reason: "nope" });

    await expect(runResearchPipeline("gen-1", "trip-1", "user-1")).rejects.toThrow();
    expect(mocks.db.trip.update).toHaveBeenCalledWith({
      where: { id: "trip-1" },
      data: { status: "DRAFT" },
    });
  });

  it("refuses to generate for a trip the user does not own", async () => {
    mocks.db.trip.findFirst.mockResolvedValue(null);

    await expect(runResearchPipeline("gen-1", "trip-1", "someone-else")).rejects.toThrow(
      "NOT_FOUND"
    );
    expect(mocks.planTrip).not.toHaveBeenCalled();
  });

  it("records an audit entry on success", async () => {
    await runResearchPipeline("gen-1", "trip-1", "user-1");
    expect(mocks.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ITINERARY_GENERATED", userId: "user-1" })
    );
  });
});
