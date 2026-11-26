import { createHash, createHmac } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { resolveJwtSecret } from "@/lib/auth";
import { flightSearchSchema, hotelSearchSchema } from "@/lib/validators";

type FlightQuery = z.infer<typeof flightSearchSchema>;
type HotelQuery = z.infer<typeof hotelSearchSchema>;

type Selection = {
  token: string;
  itinerary: string;
  label: string;
};

export type Quote = {
  id: string;
  type: "FLIGHT" | "STAY";
  title: string;
  subtitle: string;
  price: number;
  currency: string;
  source: string;
  checkedAt: string;
  match: string;
  bookingToken?: string;
} & (
  | { type: "FLIGHT"; query: FlightQuery; outbound?: string }
  | { type: "STAY"; query: HotelQuery }
);

export class QuoteError extends Error {
  constructor(message: string, public status = 503) {
    super(message);
  }
}

const key = () => createHmac("sha256", resolveJwtSecret(process.env.JWT_SECRET, process.env.NODE_ENV))
  .update("travel-provider-quotes").digest();

export async function signQuote<T extends object>(value: T, userId: string, kind: "quote" | "outbound" | "booking") {
  return new SignJWT({ value }).setProtectedHeader({ alg: "HS256" })
    .setAudience(`travel-${kind}`).setSubject(userId).setExpirationTime("45m").sign(key());
}

export async function readQuote<T>(token: string, userId: string, kind: "quote" | "outbound" | "booking"): Promise<T> {
  try {
    const { payload } = await jwtVerify(token, key(), {
      algorithms: ["HS256"], audience: `travel-${kind}`, subject: userId,
    });
    return payload.value as T;
  } catch {
    throw new QuoteError("This search result expired. Search again for a current quote.", 422);
  }
}

const fresh = () => new Date().toISOString();
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const price = z.number().finite().positive().safeParse;
const nonempty = z.string().min(1);
const cabin = { economy: "1", premium_economy: "2", business: "3", first: "4" };

async function search(engine: string, params: Record<string, string>, emptyMessage: RegExp) {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) throw new QuoteError("Live travel search is unavailable. Configure SERPAPI_API_KEY.");
  const url = new URL("https://serpapi.com/search.json");
  url.search = new URLSearchParams({
    ...params, engine, api_key: apiKey, no_cache: "true", hl: "en", gl: "in",
  }).toString();
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000) });
    const data = z.object({ error: z.string().optional() }).passthrough().parse(await response.json());
    if (response.ok && !data.error) return data;
    if ((response.ok || response.status === 400) && data.error && emptyMessage.test(data.error)) return {};
  } catch {
    // Provider exceptions can contain the request URL and its API key.
  }
  throw new QuoteError("Live travel provider is unavailable. Try again later.");
}

function airport(value: string) {
  const code = /^(?:([a-z]{3})|.+\(([a-z]{3})\))$/i.exec(value.trim());
  if (!code) throw new QuoteError("Enter a three-letter airport code, such as DEL or BOM.", 422);
  return (code[1] || code[2]).toUpperCase();
}

function flightParams(query: FlightQuery) {
  return {
    departure_id: airport(query.origin), arrival_id: airport(query.destination),
    outbound_date: query.departDate, type: query.returnDate ? "1" : "2",
    ...(query.returnDate ? { return_date: query.returnDate } : {}),
    adults: String(query.passengers), travel_class: cabin[query.cabinClass],
    currency: query.currency,
  };
}

function hotelParams(query: HotelQuery) {
  if (query.rooms && query.rooms !== 1) throw new QuoteError("Live hotel quotes support one room.", 422);
  return {
    q: query.destination, check_in_date: query.checkIn, check_out_date: query.checkOut,
    adults: String(query.guests), currency: query.currency,
  };
}

const segment = z.object({
  departure_airport: z.object({ id: nonempty, time: nonempty }),
  arrival_airport: z.object({ id: nonempty, time: nonempty }),
  airline: nonempty,
  flight_number: nonempty,
});
const flight = z.object({
  flights: z.array(segment).nonempty(), price: z.number().positive(),
  departure_token: nonempty.optional(), booking_token: nonempty.optional(),
});

function parseRows<T>(rows: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const result = schema.safeParse(row);
    return result.success ? [result.data] : [];
  });
}

const noFlights = /hasn.t returned any results|no flights found/i;
const noHotels = /hasn.t returned any results|no properties found/i;

export async function searchFlights(query: FlightQuery, outbound?: Selection, all = false) {
  const params = flightParams(query);
  const data = await search("google_flights", {
    ...params, ...(outbound ? { departure_token: outbound.token } : {}),
  }, noFlights);
  const checkedAt = fresh();
  const rows = [...parseRows(data.best_flights, flight), ...parseRows(data.other_flights, flight)];
  const selections: Selection[] = [];
  const offers: Quote[] = [];
  for (const row of rows) {
    const itinerary = hash(row.flights.map(({ departure_airport, arrival_airport, flight_number }) =>
      [departure_airport.id, departure_airport.time, arrival_airport.id, arrival_airport.time, flight_number]
    ));
    const label = row.flights.map((s) =>
      `${s.flight_number} ${s.departure_airport.id} ${s.departure_airport.time} → ${s.arrival_airport.id} ${s.arrival_airport.time}`
    ).join(" · ");
    if (query.returnDate && !outbound) {
      if (row.departure_token && !selections.some((item) => item.itinerary === itinerary)) {
        selections.push({ token: row.departure_token, itinerary, label });
      }
      continue;
    }
    if (!all && query.maxPrice && row.price > query.maxPrice) continue;
    const match = hash([outbound?.itinerary, itinerary]);
    offers.push({
      id: hash([params, match]), type: "FLIGHT", title: `${row.flights[0].airline} · ${params.departure_id} to ${params.arrival_id}`,
      subtitle: outbound ? `${outbound.label} | Return: ${label}` : label,
      match, query, outbound: outbound?.itinerary, price: row.price, currency: query.currency,
      source: "Google Flights via SerpApi", checkedAt, bookingToken: row.booking_token,
    });
  }
  return { offers: sortedOffers(offers, all), selections };
}

const hotel = z.object({
  property_token: nonempty, name: nonempty, overall_rating: z.number().optional(),
  total_rate: z.object({
    extracted_after_taxes_fees: z.number().optional(),
    extracted_display_price: z.number().optional(),
  }).optional(),
});

function sortedOffers(offers: Quote[], all: boolean) {
  const unique = new Map<string, Quote>();
  for (const offer of offers.sort((a, b) => a.price - b.price)) {
    if (!unique.has(offer.id)) unique.set(offer.id, offer);
  }
  const rows = [...unique.values()];
  return all ? rows : rows.slice(0, 12);
}

function hotelQuote(row: z.infer<typeof hotel>, query: HotelQuery, checkedAt: string): Quote | undefined {
  const amount = price(row.total_rate?.extracted_after_taxes_fees ?? row.total_rate?.extracted_display_price);
  if (!amount.success) return;
  return {
    id: hash([hotelParams(query), row.property_token]), type: "STAY", title: row.name.slice(0, 300),
    subtitle: `${query.destination} · ${query.checkIn} to ${query.checkOut} · ${query.guests} adult(s), one room`,
    price: amount.data, currency: query.currency, source: "Google Hotels via SerpApi", checkedAt,
    match: row.property_token, query,
  };
}

export async function searchHotels(query: HotelQuery) {
  const data = await search("google_hotels", hotelParams(query), noHotels);
  const checkedAt = fresh();
  const offers = parseRows(data.properties, hotel).flatMap((row) => {
    const quote = hotelQuote(row, query, checkedAt);
    if (!quote || (query.maxPrice && quote.price > query.maxPrice)) return [];
    if (query.minRating && (row.overall_rating ?? 0) < query.minRating) return [];
    return [quote];
  });
  return sortedOffers(offers, false);
}

export async function checkComparableQuote(quote: Quote) {
  if (quote.type === "STAY") {
    const data = await search("google_hotels", {
      ...hotelParams(quote.query), property_token: quote.match,
    }, noHotels);
    const row = hotel.safeParse({ ...data, property_token: quote.match });
    return row.success ? hotelQuote(row.data, quote.query, fresh()) : undefined;
  }
  let outbound: Selection | undefined;
  if (quote.outbound) {
    const initial = await searchFlights(quote.query);
    outbound = initial.selections.find((item) => item.itinerary === quote.outbound);
    if (!outbound) return;
  }
  const result = await searchFlights(quote.query, outbound, true);
  return result.offers.find((item) => item.match === quote.match && item.currency === quote.currency);
}

function httpsLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url : undefined;
  } catch {
    return undefined;
  }
}

const flightOption = z.object({
  together: z.object({
    book_with: nonempty, price: z.number().positive(),
    booking_request: z.object({ url: nonempty, post_data: z.string().optional() }),
  }),
});
const hotelOption = z.object({
  source: nonempty, link: nonempty,
  total_rate: z.object({
    extracted_after_taxes_fees: z.number().optional(),
    extracted_display_price: z.number().optional(),
  }),
});

export type BookingOption = {
  url: string;
  postData?: string;
  price: number;
  source: string;
  checkedAt: string;
};

export async function bookingOption(quote: Quote): Promise<BookingOption> {
  const options: BookingOption[] = [];
  if (quote.type === "FLIGHT" && quote.bookingToken) {
    const data = await search("google_flights", {
      ...flightParams(quote.query), booking_token: quote.bookingToken,
    }, noFlights);
    for (const { together } of parseRows(data.booking_options, flightOption)) {
      const url = httpsLink(together.booking_request.url);
      const postData = together.booking_request.post_data;
      if (!url || (postData && (url.origin !== "https://www.google.com" || url.pathname !== "/travel/clk/f"))) continue;
      options.push({ url: url.href, postData, price: together.price, source: together.book_with, checkedAt: fresh() });
    }
  } else if (quote.type === "STAY") {
    const data = await search("google_hotels", {
      ...hotelParams(quote.query), property_token: quote.match,
    }, noHotels);
    for (const row of parseRows(data.prices, hotelOption)) {
      const url = httpsLink(row.link);
      const amount = price(row.total_rate.extracted_after_taxes_fees ?? row.total_rate.extracted_display_price);
      if (url && amount.success) options.push({ url: url.href, price: amount.data, source: row.source, checkedAt: fresh() });
    }
  }
  const best = options.sort((a, b) => a.price - b.price)[0];
  if (!best) throw new QuoteError("The provider has no direct booking link for this offer.", 404);
  return best;
}
