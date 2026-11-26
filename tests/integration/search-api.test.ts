// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const requireVerifiedAuth = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireVerifiedAuth: () => requireVerifiedAuth(),
  resolveJwtSecret: () => "fixture-only-signing-key-not-for-deployment",
}));

import { NextRequest } from "next/server";
import { GET as searchFlights } from "@/app/api/search/flights/route";
import { GET as searchHotels } from "@/app/api/search/hotels/route";

const provider = vi.fn();
beforeEach(() => {
  vi.stubEnv("SERPAPI_API_KEY", "fixture-key");
  vi.stubGlobal("fetch", provider);
  provider.mockReset().mockImplementation(async (url: URL) => Response.json(
    url.searchParams.get("engine") === "google_flights" ? {
      best_flights: [{
        flights: [{
          departure_airport: { id: "LHR", time: "2026-06-01 13:00" },
          arrival_airport: { id: "HND", time: "2026-06-02 12:00" },
          airline: "Fixture Airline", flight_number: "XX 1",
        }],
        price: 53421, booking_token: "provider-booking-token",
      }],
    } : {
      properties: [{ name: "Fixture Hotel", property_token: "fixture-property", overall_rating: 4.5,
        total_rate: { extracted_after_taxes_fees: 28150, extracted_display_price: 26000 } }],
    }
  ));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const SESSION = {
  id: "user-1",
  email: "traveller@example.com",
  name: "Traveller",
  role: "USER",
  emailVerified: true,
};

function get(url: string) {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

describe("GET /api/search/flights", () => {
  beforeEach(() => {
    requireVerifiedAuth.mockReset().mockResolvedValue(SESSION);
  });

  it("rejects unauthenticated callers with 401", async () => {
    requireVerifiedAuth.mockRejectedValue(new Error("UNAUTHORIZED"));

    const res = await searchFlights(
      get("/api/search/flights?origin=LHR&destination=HND&departDate=2026-06-01")
    );

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
  });

  it("returns 422 with field errors when required params are missing", async () => {
    const res = await searchFlights(get("/api/search/flights?origin=LHR"));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toBe("Validation failed");
    expect(body.details).toHaveProperty("destination");
    expect(body.details).toHaveProperty("departDate");
  });

  it("rejects a return date before the departure date", async () => {
    const res = await searchFlights(
      get(
        "/api/search/flights?origin=LHR&destination=HND&departDate=2026-06-10&returnDate=2026-06-01"
      )
    );

    expect(res.status).toBe(422);
    expect((await res.json()).details).toHaveProperty("returnDate");
  });

  it("returns the provider amount, currency, source and a signed result", async () => {
    const res = await searchFlights(get("/api/search/flights?origin=LHR&destination=HND&departDate=2026-06-01&passengers=2"));
    expect(res.status).toBe(200);
    const { offers } = await res.json();
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ price: 53421, currency: "INR", source: "Google Flights via SerpApi", token: expect.any(String) });
    expect(Number.isNaN(Date.parse(offers[0].checkedAt))).toBe(false);
    expect(offers[0]).not.toHaveProperty("comparison");
    expect(provider.mock.calls[0][0].searchParams.get("no_cache")).toBe("true");
  });

  it("shows unavailability when the provider key is missing", async () => {
    vi.stubEnv("SERPAPI_API_KEY", "");
    const res = await searchFlights(get("/api/search/flights?origin=LHR&destination=HND&departDate=2026-06-01"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/unavailable/);
    expect(provider).not.toHaveBeenCalled();
  });

  it("coerces numeric query params from strings", async () => {
    const res = await searchFlights(
      get(
        "/api/search/flights?origin=LHR&destination=HND&departDate=2026-06-01&passengers=3"
      )
    );

    expect(res.status).toBe(200);
    expect(provider.mock.calls[0][0].searchParams.get("adults")).toBe("3");
  });
});

describe("GET /api/search/hotels", () => {
  beforeEach(() => {
    requireVerifiedAuth.mockReset().mockResolvedValue(SESSION);
  });

  it("rejects a check-out on or before check-in", async () => {
    const res = await searchHotels(
      get(
        "/api/search/hotels?destination=Tokyo&checkIn=2026-06-05&checkOut=2026-06-05"
      )
    );

    expect(res.status).toBe(422);
    expect((await res.json()).details).toHaveProperty("checkOut");
  });

  it("returns the provider total for the stay", async () => {
    const res = await searchHotels(
      get(
        "/api/search/hotels?destination=Tokyo&checkIn=2026-06-01&checkOut=2026-06-08&guests=2"
      )
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.offers).toHaveLength(1);
    expect(body.offers[0]).toMatchObject({ price: 28150, currency: "INR", source: "Google Hotels via SerpApi" });
  });

  it("applies the minRating filter", async () => {
    const res = await searchHotels(
      get(
        "/api/search/hotels?destination=Tokyo&checkIn=2026-06-01&checkOut=2026-06-08&minRating=9"
      )
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.offers).toEqual([]);
  });
});
