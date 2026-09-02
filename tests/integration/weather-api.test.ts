// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireVerifiedAuth, db, getDestinationWeather, geocodeDestination } =
  vi.hoisted(() => ({
    requireVerifiedAuth: vi.fn(),
    getDestinationWeather: vi.fn(),
    geocodeDestination: vi.fn(),
    db: { trip: { findFirst: vi.fn() } },
  }));

vi.mock("@/lib/auth", () => ({ requireVerifiedAuth: () => requireVerifiedAuth() }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/services/weather", () => ({ getDestinationWeather }));
vi.mock("@/lib/services/geocode", () => ({ geocodeDestination }));

import { NextRequest } from "next/server";
import { GET as getWeather } from "@/app/api/weather/route";
import { GET as getGeocode } from "@/app/api/geocode/route";

const SESSION = { id: "user-1", email: "a@b.com", name: "A", role: "USER", emailVerified: true };

const REPORT = {
  location: { name: "Paris", country: "France", latitude: 48.85, longitude: 2.35 },
  source: "forecast",
  days: [{ date: "2026-06-01", maxTempC: 24, minTempC: 14 }],
  summary: "Forecast: highs around 24°C",
};

function req(path: string) {
  return new NextRequest(`http://localhost:3000${path}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireVerifiedAuth.mockResolvedValue(SESSION);
  getDestinationWeather.mockResolvedValue(REPORT);
});

describe("GET /api/weather", () => {
  it("requires authentication", async () => {
    requireVerifiedAuth.mockRejectedValue(new Error("UNAUTHORIZED"));
    expect((await getWeather(req("/api/weather?tripId=trip-1"))).status).toBe(401);
  });

  it("422s when neither tripId nor an explicit destination range is given", async () => {
    expect((await getWeather(req("/api/weather"))).status).toBe(422);
  });

  it("422s when a destination is given without dates", async () => {
    expect((await getWeather(req("/api/weather?destination=Paris"))).status).toBe(422);
  });

  it("resolves destination and dates from an owned trip", async () => {
    db.trip.findFirst.mockResolvedValue({
      destination: "Paris, France",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-06-05"),
    });

    const res = await getWeather(req("/api/weather?tripId=trip-1"));

    expect(res.status).toBe(200);
    expect(getDestinationWeather).toHaveBeenCalledWith(
      "Paris, France",
      "2026-06-01",
      "2026-06-05"
    );
    expect((await res.json()).weather.source).toBe("forecast");
  });

  it("404s for a trip the caller does not own", async () => {
    db.trip.findFirst.mockResolvedValue(null);

    const res = await getWeather(req("/api/weather?tripId=someone-else"));

    expect(res.status).toBe(404);
    expect(getDestinationWeather).not.toHaveBeenCalled();
  });

  it("accepts an explicit destination and date range", async () => {
    const res = await getWeather(
      req("/api/weather?destination=Tokyo&startDate=2026-06-01&endDate=2026-06-04")
    );

    expect(res.status).toBe(200);
    expect(getDestinationWeather).toHaveBeenCalledWith(
      "Tokyo",
      "2026-06-01",
      "2026-06-04"
    );
  });

  it("rejects a malformed date", async () => {
    const res = await getWeather(
      req("/api/weather?destination=Tokyo&startDate=June1&endDate=2026-06-04")
    );
    expect(res.status).toBe(422);
  });

  it("returns 503 when the upstream weather service is unavailable", async () => {
    getDestinationWeather.mockResolvedValue(null);

    const res = await getWeather(
      req("/api/weather?destination=Tokyo&startDate=2026-06-01&endDate=2026-06-04")
    );

    expect(res.status).toBe(503);
  });
});

describe("GET /api/geocode", () => {
  it("requires authentication", async () => {
    requireVerifiedAuth.mockRejectedValue(new Error("UNAUTHORIZED"));
    expect((await getGeocode(req("/api/geocode?destination=Paris"))).status).toBe(401);
  });

  it("returns coordinates for a known place", async () => {
    geocodeDestination.mockResolvedValue({
      name: "Paris",
      country: "France",
      latitude: 48.85,
      longitude: 2.35,
    });

    const res = await getGeocode(req("/api/geocode?destination=Paris"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.location.latitude).toBeCloseTo(48.85);
  });

  it("404s for an unknown place", async () => {
    geocodeDestination.mockResolvedValue(null);

    const res = await getGeocode(req("/api/geocode?destination=Xyzzyville"));

    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/Xyzzyville/);
  });

  it("422s when the destination param is missing", async () => {
    expect((await getGeocode(req("/api/geocode"))).status).toBe(422);
  });
});
