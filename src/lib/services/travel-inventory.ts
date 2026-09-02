/**
 * Flight and hotel inventory search with cross-vendor price comparison.
 *
 * There is no keyless real-world flight/hotel inventory API, so this ships a
 * deterministic sandbox provider behind a provider interface - the same shape a
 * real GDS integration (Amadeus, Duffel, ...) would implement. Results are
 * seeded by the search query, so the same route and dates always return the
 * same offers and prices: price comparison and price alerts need a stable
 * baseline to compare against.
 *
 * To plug in a live provider, implement `InventoryProvider` and return it from
 * `getInventoryProvider()` when its credentials are present in the environment.
 */
import {
  hashSeed,
  pick,
  pickMany,
  randomInt,
  round2,
  seededRandom,
  type Rng,
} from "./seeded-random";

export type CabinClass = "economy" | "premium_economy" | "business" | "first";

export type VendorQuote = {
  vendor: string;
  price: number;
  currency: string;
  /** Difference from the cheapest quote for the same offer. */
  premium: number;
  refundable: boolean;
  baggageIncluded: boolean;
};

export type PriceComparison = {
  quotes: VendorQuote[];
  cheapestVendor: string;
  cheapestPrice: number;
  highestPrice: number;
  /** What booking the cheapest vendor saves versus the most expensive. */
  maxSaving: number;
};

export type FlightOffer = {
  id: string;
  airline: string;
  airlineCode: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  durationMinutes: number;
  duration: string;
  stops: number;
  cabinClass: CabinClass;
  aircraft: string;
  price: number;
  currency: string;
  seatsRemaining: number;
  comparison: PriceComparison;
};

export type HotelOffer = {
  id: string;
  name: string;
  type: "hotel" | "resort" | "apartment" | "hostel" | "boutique";
  area: string;
  starRating: number;
  guestRating: number;
  reviewCount: number;
  checkIn: string;
  checkOut: string;
  nights: number;
  pricePerNight: number;
  totalPrice: number;
  currency: string;
  amenities: string[];
  distanceToCenterKm: number;
  freeCancellation: boolean;
  comparison: PriceComparison;
};

export type FlightSearchQuery = {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string;
  passengers: number;
  cabinClass?: CabinClass;
  currency?: string;
  maxPrice?: number;
};

export type HotelSearchQuery = {
  destination: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  rooms?: number;
  currency?: string;
  maxPrice?: number;
  minRating?: number;
};

export type InventoryProvider = {
  readonly name: string;
  readonly live: boolean;
  searchFlights(query: FlightSearchQuery): Promise<FlightOffer[]>;
  searchHotels(query: HotelSearchQuery): Promise<HotelOffer[]>;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const AIRLINES = [
  { name: "Aurora Atlantic", code: "AA" },
  { name: "Meridian Air", code: "MD" },
  { name: "Northwind Airways", code: "NW" },
  { name: "Skyline International", code: "SL" },
  { name: "Vertex Airlines", code: "VX" },
  { name: "Bluepath Air", code: "BP" },
] as const;

const AIRCRAFT = [
  "Airbus A320neo",
  "Airbus A350-900",
  "Boeing 737 MAX 8",
  "Boeing 787-9",
  "Embraer E195",
] as const;

const FLIGHT_VENDORS = [
  "Direct with airline",
  "SkyDeals",
  "FareHarbor",
  "GlobeTrip",
  "JetCompare",
] as const;

const HOTEL_VENDORS = [
  "Direct with hotel",
  "StayFinder",
  "RoomVault",
  "TripLodge",
  "HotelCompare",
] as const;

const HOTEL_PREFIXES = [
  "Grand",
  "The Old",
  "Riverside",
  "Central",
  "Harbour",
  "Park",
  "Aurora",
  "Meridian",
] as const;

const HOTEL_SUFFIXES = [
  "Hotel",
  "Residence",
  "Suites",
  "House",
  "Lodge",
  "Inn",
] as const;

const AREAS = [
  "City Center",
  "Historic District",
  "Waterfront",
  "Old Town",
  "Business District",
  "Museum Quarter",
  "Riverside",
] as const;

const AMENITIES = [
  "Free WiFi",
  "Breakfast included",
  "Air conditioning",
  "Fitness centre",
  "Swimming pool",
  "Airport shuttle",
  "Spa",
  "Restaurant",
  "Bar",
  "Pet friendly",
  "24h front desk",
  "Laundry",
] as const;

const CABIN_MULTIPLIER: Record<CabinClass, number> = {
  economy: 1,
  premium_economy: 1.6,
  business: 3.1,
  first: 5.2,
};

function nightsBetween(checkIn: string, checkOut: string): number {
  const ms =
    new Date(`${checkOut}T00:00:00Z`).getTime() -
    new Date(`${checkIn}T00:00:00Z`).getTime();
  return Math.max(1, Math.round(ms / MS_PER_DAY));
}

function formatDuration(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function addMinutes(isoDate: string, minutesFromMidnight: number): string {
  const base = new Date(`${isoDate}T00:00:00Z`);
  return new Date(base.getTime() + minutesFromMidnight * 60000)
    .toISOString()
    .slice(0, 19);
}

/**
 * Build vendor quotes around a base price. The same offer really is sold at
 * different prices by different vendors - that spread is the whole point of a
 * comparison view.
 */
function buildComparison(
  rng: Rng,
  basePrice: number,
  currency: string,
  vendors: readonly string[]
): PriceComparison {
  const chosen = pickMany(rng, vendors, randomInt(rng, 3, Math.min(5, vendors.length)));

  const quotes: VendorQuote[] = chosen.map((vendor) => {
    // -6% to +18% around the base fare.
    const markup = 1 + (rng() * 0.24 - 0.06);
    return {
      vendor,
      price: round2(basePrice * markup),
      currency,
      premium: 0,
      refundable: rng() > 0.65,
      baggageIncluded: rng() > 0.45,
    };
  });

  quotes.sort((a, b) => a.price - b.price);

  const cheapestPrice = quotes[0].price;
  const highestPrice = quotes[quotes.length - 1].price;

  for (const quote of quotes) {
    quote.premium = round2(quote.price - cheapestPrice);
  }

  return {
    quotes,
    cheapestVendor: quotes[0].vendor,
    cheapestPrice,
    highestPrice,
    maxSaving: round2(highestPrice - cheapestPrice),
  };
}

/** Longer routes cost more; this is a stable stand-in for real distance data. */
function routeDistanceFactor(origin: string, destination: string): number {
  const rng = seededRandom(hashSeed("distance", origin.toLowerCase(), destination.toLowerCase()));
  return 0.6 + rng() * 2.4;
}

export const sandboxProvider: InventoryProvider = {
  name: "sandbox",
  live: false,

  async searchFlights(query: FlightSearchQuery): Promise<FlightOffer[]> {
    const currency = query.currency ?? "USD";
    const cabin = query.cabinClass ?? "economy";
    const passengers = Math.max(1, query.passengers);

    const rng = seededRandom(
      hashSeed(
        "flights",
        query.origin.toLowerCase(),
        query.destination.toLowerCase(),
        query.departDate,
        query.returnDate ?? "oneway",
        cabin
      )
    );

    const distanceFactor = routeDistanceFactor(query.origin, query.destination);
    const baseFare = 90 + distanceFactor * 140;
    const offerCount = randomInt(rng, 5, 8);

    const offers: FlightOffer[] = [];

    for (let i = 0; i < offerCount; i++) {
      const airline = pick(rng, AIRLINES);
      const stops = rng() < 0.45 ? 0 : rng() < 0.8 ? 1 : 2;

      // Base flight time scales with distance; each stop adds a layover.
      const baseMinutes = Math.round(75 + distanceFactor * 210);
      const durationMinutes = baseMinutes + stops * randomInt(rng, 65, 190);

      const departMinutes = randomInt(rng, 5 * 60, 21 * 60);

      // Non-stops command a premium; extra stops discount the fare.
      const stopFactor = stops === 0 ? 1.22 : stops === 1 ? 1 : 0.86;
      const perPassenger = round2(
        baseFare * stopFactor * CABIN_MULTIPLIER[cabin] * (0.85 + rng() * 0.35)
      );
      const price = round2(perPassenger * passengers);

      offers.push({
        id: `flt-${i + 1}`,
        airline: airline.name,
        airlineCode: airline.code,
        flightNumber: `${airline.code}${randomInt(rng, 100, 989)}`,
        origin: query.origin,
        destination: query.destination,
        departure: addMinutes(query.departDate, departMinutes),
        arrival: addMinutes(query.departDate, departMinutes + durationMinutes),
        durationMinutes,
        duration: formatDuration(durationMinutes),
        stops,
        cabinClass: cabin,
        aircraft: pick(rng, AIRCRAFT),
        price,
        currency,
        seatsRemaining: randomInt(rng, 1, 42),
        comparison: buildComparison(rng, price, currency, FLIGHT_VENDORS),
      });
    }

    const filtered =
      query.maxPrice === undefined
        ? offers
        : offers.filter((o) => o.comparison.cheapestPrice <= query.maxPrice!);

    return filtered.sort(
      (a, b) => a.comparison.cheapestPrice - b.comparison.cheapestPrice
    );
  },

  async searchHotels(query: HotelSearchQuery): Promise<HotelOffer[]> {
    const currency = query.currency ?? "USD";
    const nights = nightsBetween(query.checkIn, query.checkOut);
    const rooms = Math.max(1, query.rooms ?? Math.ceil(query.guests / 2));

    const rng = seededRandom(
      hashSeed(
        "hotels",
        query.destination.toLowerCase(),
        query.checkIn,
        query.checkOut,
        rooms
      )
    );

    const cityFactor = 0.7 + seededRandom(hashSeed("city", query.destination.toLowerCase()))() * 1.5;
    const offerCount = randomInt(rng, 6, 9);
    const offers: HotelOffer[] = [];

    for (let i = 0; i < offerCount; i++) {
      const starRating = randomInt(rng, 2, 5);
      const type = pick(rng, [
        "hotel",
        "resort",
        "apartment",
        "hostel",
        "boutique",
      ] as const);

      const nightly = round2(
        (28 + starRating * 42) * cityFactor * (0.8 + rng() * 0.5)
      );
      const totalPrice = round2(nightly * nights * rooms);

      offers.push({
        id: `stay-${i + 1}`,
        name: `${pick(rng, HOTEL_PREFIXES)} ${pick(rng, HOTEL_SUFFIXES)}`,
        type,
        area: pick(rng, AREAS),
        starRating,
        guestRating: round2(6.4 + starRating * 0.55 + rng() * 0.8),
        reviewCount: randomInt(rng, 48, 4200),
        checkIn: query.checkIn,
        checkOut: query.checkOut,
        nights,
        pricePerNight: nightly,
        totalPrice,
        currency,
        amenities: pickMany(rng, AMENITIES, randomInt(rng, 3, 7)).sort(),
        distanceToCenterKm: round2(rng() * 6.5),
        freeCancellation: rng() > 0.35,
        comparison: buildComparison(rng, totalPrice, currency, HOTEL_VENDORS),
      });
    }

    let filtered = offers;
    if (query.maxPrice !== undefined) {
      filtered = filtered.filter(
        (o) => o.comparison.cheapestPrice <= query.maxPrice!
      );
    }
    if (query.minRating !== undefined) {
      filtered = filtered.filter((o) => o.guestRating >= query.minRating!);
    }

    return filtered.sort(
      (a, b) => a.comparison.cheapestPrice - b.comparison.cheapestPrice
    );
  },
};

/**
 * Resolve the inventory provider. Add live providers here as their credentials
 * become available; the sandbox is the fallback so search always works.
 */
export function getInventoryProvider(): InventoryProvider {
  return sandboxProvider;
}

export function searchFlights(query: FlightSearchQuery) {
  return getInventoryProvider().searchFlights(query);
}

export function searchHotels(query: HotelSearchQuery) {
  return getInventoryProvider().searchHotels(query);
}
