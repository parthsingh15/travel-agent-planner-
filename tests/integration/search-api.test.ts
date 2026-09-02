// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireVerifiedAuth = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireVerifiedAuth: () => requireVerifiedAuth(),
}));

import { NextRequest } from "next/server";
import { GET as searchFlights } from "@/app/api/search/flights/route";
import { GET as searchHotels } from "@/app/api/search/hotels/route";

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

  it("returns offers with vendor price comparison", async () => {
    const res = await searchFlights(
      get(
        "/api/search/flights?origin=LHR&destination=HND&departDate=2026-06-01&passengers=2"
      )
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.offers.length).toBeGreaterThan(0);
    expect(body.meta.count).toBe(body.offers.length);
    expect(body.meta.provider).toBe("sandbox");
    expect(body.meta.live).toBe(false);

    const [offer] = body.offers;
    expect(offer.comparison.quotes.length).toBeGreaterThanOrEqual(3);
    expect(offer.comparison.cheapestPrice).toBe(offer.comparison.quotes[0].price);
    expect(body.meta.cheapestPrice).toBe(offer.comparison.cheapestPrice);
  });

  it("coerces numeric query params from strings", async () => {
    const res = await searchFlights(
      get(
        "/api/search/flights?origin=LHR&destination=HND&departDate=2026-06-01&passengers=3"
      )
    );

    expect((await res.json()).meta.query.passengers).toBe(3);
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

  it("returns hotel offers with nightly and total pricing", async () => {
    const res = await searchHotels(
      get(
        "/api/search/hotels?destination=Tokyo&checkIn=2026-06-01&checkOut=2026-06-08&guests=2"
      )
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.offers.length).toBeGreaterThan(0);
    for (const offer of body.offers) {
      expect(offer.nights).toBe(7);
      expect(offer.totalPrice).toBeGreaterThan(0);
    }
  });

  it("applies the minRating filter", async () => {
    const res = await searchHotels(
      get(
        "/api/search/hotels?destination=Tokyo&checkIn=2026-06-01&checkOut=2026-06-08&minRating=9"
      )
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    for (const offer of body.offers) {
      expect(offer.guestRating).toBeGreaterThanOrEqual(9);
    }
  });
});
