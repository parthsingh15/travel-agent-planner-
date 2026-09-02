/**
 * Indian travel cost model.
 *
 * OpenStreetMap records *which* places exist but almost never what they cost.
 * Rather than invent a price and present it as fact, every figure produced here
 * is returned as an ESTIMATED `Sourced` value whose note states the exact rule
 * that produced it, so a user can see the reasoning and override it.
 *
 * Bands are per-person, in INR, for 2026, and are deliberately conservative.
 * A real price found by web search always takes precedence over these.
 */
import { estimated, verified, type Sourced } from "./provenance";
import type { Poi } from "./overpass";

export type TravelStyleKey = "BUDGET" | "MID_RANGE" | "LUXURY";

/** Destination price tiers - metros and marquee resorts cost more. */
const TIER_MULTIPLIER: Record<string, number> = {
  metro: 1.35,
  resort: 1.15,
  standard: 1.0,
  rural: 0.85,
};

const METROS = ["mumbai", "delhi", "new delhi", "bengaluru", "bangalore", "gurgaon",
  "noida", "chennai", "kolkata", "hyderabad", "pune"];
const RESORT_TOWNS = ["manali", "shimla", "goa", "udaipur", "jaisalmer", "munnar",
  "leh", "gulmarg", "darjeeling", "rishikesh", "alleppey", "ooty", "coorg"];

export function destinationTier(name: string): keyof typeof TIER_MULTIPLIER {
  const n = name.toLowerCase();
  if (METROS.some((m) => n.includes(m))) return "metro";
  if (RESORT_TOWNS.some((r) => n.includes(r))) return "resort";
  return "standard";
}

// ─── Accommodation ──────────────────────────────────────────────────────────
/** Base price per ROOM per night, by OSM accommodation kind and travel style. */
const STAY_BASE: Record<string, Record<TravelStyleKey, number>> = {
  hostel:      { BUDGET: 600,  MID_RANGE: 900,  LUXURY: 1400 },
  guest_house: { BUDGET: 1000, MID_RANGE: 1800, LUXURY: 3000 },
  motel:       { BUDGET: 1200, MID_RANGE: 2000, LUXURY: 3200 },
  apartment:   { BUDGET: 1600, MID_RANGE: 2800, LUXURY: 5000 },
  chalet:      { BUDGET: 2000, MID_RANGE: 3500, LUXURY: 6500 },
  hotel:       { BUDGET: 1500, MID_RANGE: 2800, LUXURY: 6000 },
};

/** A recorded star rating is a strong signal; scale off the mid-range base. */
const STAR_MULTIPLIER: Record<number, number> = {
  1: 0.55, 2: 0.75, 3: 1.0, 4: 1.7, 5: 3.0,
};

export function estimateStayPerNight(
  poi: Poi,
  style: TravelStyleKey,
  destination: string
): Sourced<number> {
  const tier = TIER_MULTIPLIER[destinationTier(destination)];
  const base = STAY_BASE[poi.kind] ?? STAY_BASE.hotel;

  let price = base[style];
  let rule = `${poi.kind} at ${style} level (base ₹${base[style]}/night)`;

  if (poi.stars && STAR_MULTIPLIER[poi.stars]) {
    price = Math.round(STAY_BASE.hotel.MID_RANGE * STAR_MULTIPLIER[poi.stars]);
    rule = `${poi.stars}-star rating recorded in OpenStreetMap (₹${price}/night before local adjustment)`;
  }

  const final = Math.round((price * tier) / 50) * 50;

  return estimated(
    final,
    `${rule}, adjusted x${tier} for ${destinationTier(destination)} pricing in ${destination}. ` +
      `No live rate available - confirm with the property before booking.`
  );
}

// ─── Food ───────────────────────────────────────────────────────────────────
/** Cost per person per meal, by OSM amenity kind. */
const MEAL_BASE: Record<string, Record<TravelStyleKey, number>> = {
  fast_food:  { BUDGET: 120, MID_RANGE: 180, LUXURY: 250 },
  cafe:       { BUDGET: 180, MID_RANGE: 300, LUXURY: 450 },
  restaurant: { BUDGET: 250, MID_RANGE: 450, LUXURY: 900 },
};

export function estimateMealPerPerson(
  poi: Poi,
  style: TravelStyleKey,
  destination: string
): Sourced<number> {
  const tier = TIER_MULTIPLIER[destinationTier(destination)];
  const base = MEAL_BASE[poi.kind] ?? MEAL_BASE.restaurant;
  const final = Math.round((base[style] * tier) / 10) * 10;

  return estimated(
    final,
    `${poi.kind} at ${style} level (base ₹${base[style]}/person), ` +
      `adjusted x${tier} for ${destination}. Menu prices not published in OpenStreetMap.`
  );
}

// ─── Attractions ────────────────────────────────────────────────────────────
/** Typical entry fee for Indian nationals, by OSM kind. */
const ENTRY_BASE: Record<string, number> = {
  museum: 50,
  attraction: 100,
  theme_park: 500,
  zoo: 100,
  gallery: 50,
  monument: 40,
  memorial: 25,
  ruins: 25,
  castle: 200,
  fort: 200,
  archaeological_site: 40,
  viewpoint: 0,
  peak: 0,
  waterfall: 0,
  hot_spring: 0,
  park: 0,
  garden: 20,
  nature_reserve: 150,
  place_of_worship: 0,
};

/**
 * Entry fee. Prefers real OSM data:
 *   charge="200 INR" -> VERIFIED
 *   fee=no           -> VERIFIED free
 * and only falls back to a typical band when nothing is recorded.
 */
export function estimateEntryFee(poi: Poi): Sourced<number> {
  if (poi.charge) {
    const match = poi.charge.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      return verified(Number(match[1]), {
        method: "openstreetmap",
        label: `OSM ${poi.id} charge="${poi.charge}"`,
        url: poi.osmUrl,
      });
    }
  }

  if (poi.fee === "no") {
    return verified(0, {
      method: "openstreetmap",
      label: `OSM ${poi.id} fee=no (free entry)`,
      url: poi.osmUrl,
    });
  }

  const base = ENTRY_BASE[poi.kind] ?? 50;
  return estimated(
    base,
    `No entry fee recorded in OpenStreetMap for this ${poi.kind.replace(/_/g, " ")}. ` +
      `₹${base} is the typical Indian-national rate for this kind of site.`
  );
}

// ─── Transport ──────────────────────────────────────────────────────────────
export type TransportMode = "train" | "bus" | "cab" | "flight" | "auto";

/**
 * Per-km fares, INR per person (cab is per vehicle).
 * Sourced from published 2025-26 operator tariffs; treated as ESTIMATED because
 * they are averages, not a live quote for specific dates.
 */
const FARE_PER_KM: Record<TransportMode, { rate: number; label: string }> = {
  train:  { rate: 0.75, label: "Indian Railways sleeper/3AC average" },
  bus:    { rate: 1.6,  label: "State/private AC coach average" },
  cab:    { rate: 14,   label: "Outstation cab, per vehicle incl. return fare" },
  flight: { rate: 6.5,  label: "Domestic economy average" },
  auto:   { rate: 22,   label: "Auto-rickshaw metered city rate" },
};

/** Fixed additions that per-km rates miss. */
const FARE_BASE: Record<TransportMode, number> = {
  train: 60, bus: 40, cab: 500, flight: 1400, auto: 30,
};

export function estimateFare(
  mode: TransportMode,
  distanceKm: number,
  travellers: number
): Sourced<number> {
  const { rate, label } = FARE_PER_KM[mode];
  const perUnit = FARE_BASE[mode] + rate * distanceKm;

  // A cab is priced per vehicle; everything else is per person.
  const vehicles = mode === "cab" ? Math.ceil(travellers / 4) : travellers;
  const total = Math.round((perUnit * vehicles) / 10) * 10;

  return estimated(
    total,
    `${label}: ₹${FARE_BASE[mode]} base + ₹${rate}/km x ${distanceKm} km ` +
      `x ${vehicles} ${mode === "cab" ? "vehicle(s)" : "traveller(s)"}. ` +
      `Not a live quote - fares vary by date, class and operator.`
  );
}

/** Which intercity modes are plausible for a given distance. */
export function feasibleModes(distanceKm: number): TransportMode[] {
  if (distanceKm < 60) return ["cab", "bus"];
  if (distanceKm < 350) return ["train", "bus", "cab"];
  if (distanceKm < 900) return ["train", "bus", "flight", "cab"];
  return ["flight", "train"];
}

// ─── Miscellaneous ──────────────────────────────────────────────────────────
/** Local getting-around per person per day. */
export function estimateLocalTransportPerDay(
  destination: string,
  style: TravelStyleKey
): Sourced<number> {
  const tier = TIER_MULTIPLIER[destinationTier(destination)];
  const base = { BUDGET: 150, MID_RANGE: 350, LUXURY: 800 }[style];
  const final = Math.round((base * tier) / 10) * 10;

  return estimated(
    final,
    `Typical local travel (auto/taxi/shared) at ${style} level in ${destination}: ` +
      `₹${base}/person/day adjusted x${tier}.`
  );
}

/** Buffer for tips, entry extras, shopping and contingency. */
export function estimateMiscellaneous(
  subtotal: number,
  percent = 8
): Sourced<number> {
  const value = Math.round((subtotal * percent) / 100 / 10) * 10;
  return estimated(
    value,
    `${percent}% contingency buffer over ₹${subtotal} for tips, parking, ` +
      `small purchases and unforeseen costs.`
  );
}
