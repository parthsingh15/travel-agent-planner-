/**
 * Road distances and driving times from OSRM (OpenStreetMap routing).
 *
 * Keyless. Used both for the intercity leg (Delhi -> Manali) and for hop-by-hop
 * travel time between stops inside a day, so the itinerary's schedule reflects
 * real roads rather than guesswork.
 *
 * The public demo server is rate-limited and intended for light use; set
 * OSRM_BASE_URL to a self-hosted instance for heavier workloads.
 */
import { haversineKm } from "./nominatim";
import { estimated, verified, type Sourced } from "./provenance";

const BASE = process.env.OSRM_BASE_URL ?? "https://router.project-osrm.org";
const UA =
  process.env.NOMINATIM_USER_AGENT ?? "ai-travel-planner/1.0 (+http://localhost:3000)";

export type Coord = { lat: number; lon: number };

export type Leg = {
  distanceKm: Sourced<number>;
  durationMin: Sourced<number>;
};

/**
 * Fallback when routing is unavailable: straight-line distance inflated by a
 * road-winding factor, at an average Indian highway speed. Always ESTIMATED.
 */
const ROAD_WINDING_FACTOR = 1.35;
const AVG_ROAD_KMPH = 40;

function fallbackLeg(from: Coord, to: Coord, why: string): Leg {
  const straight = haversineKm(from, to);
  const km = Math.round(straight * ROAD_WINDING_FACTOR * 10) / 10;
  const min = Math.round((km / AVG_ROAD_KMPH) * 60);

  return {
    distanceKm: estimated(
      km,
      `${why}. Straight-line distance x${ROAD_WINDING_FACTOR} for road winding.`
    ),
    durationMin: estimated(
      min,
      `${why}. Assumes an average ${AVG_ROAD_KMPH} km/h on Indian roads.`
    ),
  };
}

/** Real driving distance and duration between two points. */
export async function routeBetween(from: Coord, to: Coord): Promise<Leg> {
  const url =
    `${BASE}/route/v1/driving/` +
    `${from.lon},${from.lat};${to.lon},${to.lat}?overview=false&alternatives=false`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return fallbackLeg(from, to, `Routing service returned ${res.status}`);

    const data = (await res.json()) as {
      code?: string;
      routes?: { distance: number; duration: number }[];
    };

    const route = data.routes?.[0];
    if (data.code !== "Ok" || !route) {
      return fallbackLeg(from, to, "No route returned by the routing service");
    }

    const source = {
      method: "osrm" as const,
      label: "OSRM driving route over OpenStreetMap roads",
      url: BASE,
    };

    return {
      distanceKm: verified(Math.round((route.distance / 1000) * 10) / 10, source),
      durationMin: verified(Math.round(route.duration / 60), source),
    };
  } catch {
    return fallbackLeg(from, to, "Routing service unreachable");
  }
}

/**
 * Distances from one origin to many destinations in a single call.
 * Used to cluster nearby attractions into the same day.
 */
export async function routeMatrix(
  origin: Coord,
  destinations: Coord[]
): Promise<Leg[]> {
  if (!destinations.length) return [];

  const coords = [origin, ...destinations]
    .map((c) => `${c.lon},${c.lat}`)
    .join(";");
  const url = `${BASE}/table/v1/driving/${coords}?sources=0&annotations=distance,duration`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      return destinations.map((d) => fallbackLeg(origin, d, `Matrix returned ${res.status}`));
    }

    const data = (await res.json()) as {
      code?: string;
      distances?: number[][];
      durations?: number[][];
    };

    if (data.code !== "Ok" || !data.distances?.[0] || !data.durations?.[0]) {
      return destinations.map((d) => fallbackLeg(origin, d, "Matrix unavailable"));
    }

    const source = {
      method: "osrm" as const,
      label: "OSRM distance matrix over OpenStreetMap roads",
      url: BASE,
    };

    return destinations.map((d, i) => {
      const metres = data.distances![0][i + 1];
      const seconds = data.durations![0][i + 1];

      if (metres == null || seconds == null) {
        return fallbackLeg(origin, d, "No route in matrix");
      }

      return {
        distanceKm: verified(Math.round((metres / 1000) * 10) / 10, source),
        durationMin: verified(Math.round(seconds / 60), source),
      };
    });
  } catch {
    return destinations.map((d) => fallbackLeg(origin, d, "Routing service unreachable"));
  }
}

/**
 * OSRM returns free-flow driving time, which badly understates real Indian
 * road conditions - traffic, ghat sections, checkpoints and rest stops. A
 * Delhi->Manali route comes back as ~7h when the journey realistically takes
 * 12-14h, and scheduling a day around 7h would be wrong.
 *
 * The raw distance stays VERIFIED; the adjusted duration is downgraded to
 * ESTIMATED and states the factor applied, so nothing is silently fudged.
 */
export const TRAFFIC_FACTORS = {
  /** Dense city traffic, short hops. */
  urbanShort: 1.5,
  /** Highway running between cities. */
  intercity: 1.6,
  /** Mountain/ghat roads: Himachal, Uttarakhand, Western Ghats. */
  mountain: 1.9,
} as const;

export type RoadKind = keyof typeof TRAFFIC_FACTORS;

/** Pick a factor from distance and whether the route is hilly. */
export function classifyRoad(distanceKm: number, mountainous: boolean): RoadKind {
  if (mountainous) return "mountain";
  return distanceKm < 30 ? "urbanShort" : "intercity";
}

export function realisticDuration(
  leg: Leg,
  kind: RoadKind
): Sourced<number> {
  const factor = TRAFFIC_FACTORS[kind];
  const adjusted = Math.round(leg.durationMin.value * factor);

  return estimated(
    adjusted,
    `OSRM free-flow time of ${leg.durationMin.value} min adjusted by ${factor}x ` +
      `for real ${kind === "mountain" ? "mountain road" : kind === "intercity" ? "highway" : "city"} ` +
      `conditions (traffic, terrain, rest stops).`,
    "computed",
    "OSRM duration with Indian road-condition adjustment"
  );
}

/** Hill states where the mountain factor applies. */
const MOUNTAIN_STATES = [
  "himachal", "uttarakhand", "jammu", "kashmir", "ladakh", "sikkim",
  "arunachal", "meghalaya", "nagaland", "mizoram", "manipur", "tripura",
];

export function isMountainous(stateOrPlace?: string): boolean {
  if (!stateOrPlace) return false;
  const s = stateOrPlace.toLowerCase();
  return MOUNTAIN_STATES.some((m) => s.includes(m));
}
