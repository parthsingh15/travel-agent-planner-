import { describe, it, expect } from "vitest";
import {
  sandboxProvider,
  type FlightSearchQuery,
  type HotelSearchQuery,
} from "@/lib/services/travel-inventory";

const flightQuery: FlightSearchQuery = {
  origin: "London (LHR)",
  destination: "Tokyo (HND)",
  departDate: "2026-06-01",
  returnDate: "2026-06-12",
  passengers: 2,
  cabinClass: "economy",
  currency: "USD",
};

const hotelQuery: HotelSearchQuery = {
  destination: "Tokyo, Japan",
  checkIn: "2026-06-01",
  checkOut: "2026-06-08",
  guests: 2,
  currency: "USD",
};

describe("flight search", () => {
  it("returns offers for a route", async () => {
    const offers = await sandboxProvider.searchFlights(flightQuery);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0].origin).toBe(flightQuery.origin);
    expect(offers[0].destination).toBe(flightQuery.destination);
  });

  it("is deterministic for the same query", async () => {
    const a = await sandboxProvider.searchFlights(flightQuery);
    const b = await sandboxProvider.searchFlights(flightQuery);
    expect(a).toEqual(b);
  });

  it("returns different results for a different route", async () => {
    const other = await sandboxProvider.searchFlights({
      ...flightQuery,
      destination: "Lisbon (LIS)",
    });
    const base = await sandboxProvider.searchFlights(flightQuery);
    expect(other).not.toEqual(base);
  });

  it("sorts offers cheapest-comparison first", async () => {
    const offers = await sandboxProvider.searchFlights(flightQuery);
    const prices = offers.map((o) => o.comparison.cheapestPrice);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  it("scales fares with passenger count", async () => {
    const one = await sandboxProvider.searchFlights({ ...flightQuery, passengers: 1 });
    const four = await sandboxProvider.searchFlights({ ...flightQuery, passengers: 4 });
    expect(four[0].price).toBeGreaterThan(one[0].price);
  });

  it("charges more for premium cabins", async () => {
    const economy = await sandboxProvider.searchFlights(flightQuery);
    const business = await sandboxProvider.searchFlights({
      ...flightQuery,
      cabinClass: "business",
    });
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(business.map((o) => o.price))).toBeGreaterThan(
      avg(economy.map((o) => o.price))
    );
  });

  it("honours a maxPrice filter", async () => {
    const all = await sandboxProvider.searchFlights(flightQuery);
    const cap = all[Math.floor(all.length / 2)].comparison.cheapestPrice;
    const filtered = await sandboxProvider.searchFlights({
      ...flightQuery,
      maxPrice: cap,
    });
    expect(filtered.every((o) => o.comparison.cheapestPrice <= cap)).toBe(true);
    expect(filtered.length).toBeLessThanOrEqual(all.length);
  });

  it("produces internally consistent arrival times", async () => {
    for (const offer of await sandboxProvider.searchFlights(flightQuery)) {
      const depart = new Date(`${offer.departure}Z`).getTime();
      const arrive = new Date(`${offer.arrival}Z`).getTime();
      expect(arrive - depart).toBe(offer.durationMinutes * 60000);
    }
  });
});

describe("hotel search", () => {
  it("computes nights from the date range", async () => {
    const offers = await sandboxProvider.searchHotels(hotelQuery);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((o) => o.nights === 7)).toBe(true);
  });

  it("is deterministic for the same query", async () => {
    const a = await sandboxProvider.searchHotels(hotelQuery);
    const b = await sandboxProvider.searchHotels(hotelQuery);
    expect(a).toEqual(b);
  });

  it("keeps total price consistent with nightly rate", async () => {
    const offers = await sandboxProvider.searchHotels(hotelQuery);
    for (const offer of offers) {
      expect(offer.totalPrice).toBeCloseTo(offer.pricePerNight * offer.nights, 1);
    }
  });

  it("honours a minimum guest rating", async () => {
    const filtered = await sandboxProvider.searchHotels({
      ...hotelQuery,
      minRating: 8,
    });
    expect(filtered.every((o) => o.guestRating >= 8)).toBe(true);
  });

  it("treats a same-day range as one night rather than zero", async () => {
    const offers = await sandboxProvider.searchHotels({
      ...hotelQuery,
      checkIn: "2026-06-01",
      checkOut: "2026-06-01",
    });
    expect(offers.every((o) => o.nights === 1)).toBe(true);
  });
});

describe("price comparison", () => {
  it("quotes several vendors per offer", async () => {
    const offers = await sandboxProvider.searchFlights(flightQuery);
    for (const offer of offers) {
      expect(offer.comparison.quotes.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("orders quotes cheapest first and names the cheapest vendor", async () => {
    for (const offer of await sandboxProvider.searchFlights(flightQuery)) {
      const prices = offer.comparison.quotes.map((q) => q.price);
      expect([...prices].sort((a, b) => a - b)).toEqual(prices);
      expect(offer.comparison.cheapestVendor).toBe(offer.comparison.quotes[0].vendor);
      expect(offer.comparison.cheapestPrice).toBe(prices[0]);
    }
  });

  it("reports each quote's premium over the cheapest", async () => {
    for (const offer of await sandboxProvider.searchHotels(hotelQuery)) {
      const { quotes, cheapestPrice } = offer.comparison;
      expect(quotes[0].premium).toBe(0);
      for (const quote of quotes) {
        expect(quote.premium).toBeCloseTo(quote.price - cheapestPrice, 2);
      }
    }
  });

  it("reports the saving between cheapest and priciest vendor", async () => {
    for (const offer of await sandboxProvider.searchFlights(flightQuery)) {
      const { maxSaving, highestPrice, cheapestPrice } = offer.comparison;
      expect(maxSaving).toBeCloseTo(highestPrice - cheapestPrice, 2);
      expect(maxSaving).toBeGreaterThanOrEqual(0);
    }
  });
});
