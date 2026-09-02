/**
 * Geocoding via OpenStreetMap Nominatim.
 *
 * Keyless, but the OSM usage policy requires an identifying User-Agent and at
 * most one request per second, so requests are serialised through a small
 * queue and cached in-process.
 */

export type GeoPlace = {
  displayName: string;
  name: string;
  state?: string;
  country: string;
  lat: number;
  lon: number;
  /** [south, north, west, east] - used to bound Overpass POI queries. */
  boundingBox: [number, number, number, number];
  osmType: string;
  osmId: number;
};

const BASE = process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org";
// OSM policy wants an identifying UA. Nominatim actively blocks UAs that
// contain placeholder contact addresses, so the default identifies the app
// and its URL rather than embedding anyone's email.
const UA = process.env.NOMINATIM_USER_AGENT ?? "ai-travel-planner/1.0 (+http://localhost:3000)";

const cache = new Map<string, GeoPlace | null>();

// OSM policy: max 1 request/second. Serialise every call through this chain.
let queue: Promise<unknown> = Promise.resolve();
function rateLimited<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const result = await fn();
    await new Promise((r) => setTimeout(r, 1100));
    return result;
  });
  queue = run.catch(() => undefined);
  return run as Promise<T>;
}

export function clearGeocodeCache() {
  cache.clear();
}

/** Resolve an Indian city/town name to coordinates and a bounding box. */
export async function geocodePlace(
  query: string,
  countryCodes = "in"
): Promise<GeoPlace | null> {
  const key = `${countryCodes}:${query.trim().toLowerCase()}`;
  if (cache.has(key)) return cache.get(key)!;

  const url =
    `${BASE}/search?` +
    new URLSearchParams({
      q: query.trim(),
      format: "jsonv2",
      limit: "1",
      addressdetails: "1",
      countrycodes: countryCodes,
    });

  try {
    const res = await rateLimited(() =>
      fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(12000),
      })
    );

    if (!res.ok) {
      console.error("[nominatim] HTTP", res.status);
      return null;
    }

    const rows = (await res.json()) as Array<{
      display_name: string;
      name?: string;
      lat: string;
      lon: string;
      boundingbox: [string, string, string, string];
      osm_type: string;
      osm_id: number;
      address?: { state?: string; country?: string };
    }>;

    const hit = rows[0];
    if (!hit) {
      cache.set(key, null);
      return null;
    }

    const place: GeoPlace = {
      displayName: hit.display_name,
      name: hit.name || hit.display_name.split(",")[0].trim(),
      state: hit.address?.state,
      country: hit.address?.country ?? "India",
      lat: Number(hit.lat),
      lon: Number(hit.lon),
      boundingBox: [
        Number(hit.boundingbox[0]),
        Number(hit.boundingbox[1]),
        Number(hit.boundingbox[2]),
        Number(hit.boundingbox[3]),
      ],
      osmType: hit.osm_type,
      osmId: hit.osm_id,
    };

    cache.set(key, place);
    return place;
  } catch (error) {
    console.error("[nominatim] lookup failed:", error);
    return null;
  }
}

/** Great-circle distance in km - a floor for road distance, used as fallback. */
export function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}
