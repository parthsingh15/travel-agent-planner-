/**
 * Destination geocoding via the Open-Meteo geocoding API.
 *
 * Keyless and free, so it needs no credentials in `.env`. Results are cached
 * in-process because destinations repeat constantly across trips and requests.
 */

export type GeoLocation = {
  name: string;
  country: string;
  countryCode: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone: string;
  population?: number;
};

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEntry = { value: GeoLocation | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();

/** Destinations are stored as free text ("Paris, France") - use the leading city. */
function primaryTerm(destination: string): string {
  return destination.split(",")[0]?.trim() || destination.trim();
}

type OpenMeteoGeocodeResult = {
  name: string;
  country?: string;
  country_code?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  population?: number;
};

export function clearGeocodeCache() {
  cache.clear();
}

export async function geocodeDestination(
  destination: string
): Promise<GeoLocation | null> {
  const query = primaryTerm(destination);
  if (!query) return null;

  const key = query.toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const url = `${GEOCODE_URL}?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!response.ok) {
      console.error("[geocode] upstream error", response.status);
      return null;
    }

    const data = (await response.json()) as {
      results?: OpenMeteoGeocodeResult[];
    };
    const hit = data.results?.[0];

    const value: GeoLocation | null = hit
      ? {
          name: hit.name,
          country: hit.country ?? "",
          countryCode: hit.country_code ?? "",
          admin1: hit.admin1,
          latitude: hit.latitude,
          longitude: hit.longitude,
          timezone: hit.timezone ?? "UTC",
          population: hit.population,
        }
      : null;

    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (error) {
    console.error("[geocode] lookup failed:", error);
    return null;
  }
}

/** Bounding box for an OpenStreetMap embed centred on the location. */
export function boundingBox(
  location: Pick<GeoLocation, "latitude" | "longitude">,
  spanDegrees = 0.12
) {
  return {
    minLon: location.longitude - spanDegrees,
    minLat: location.latitude - spanDegrees / 2,
    maxLon: location.longitude + spanDegrees,
    maxLat: location.latitude + spanDegrees / 2,
  };
}
