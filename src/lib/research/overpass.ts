/**
 * Real points of interest from OpenStreetMap via the Overpass API.
 *
 * This is the planner's source of truth for *which places exist*: hotel and
 * restaurant names, attraction names, coordinates, opening hours and — where
 * mappers have recorded them — entry fees, websites and phone numbers.
 *
 * Keyless. Nothing here is generated; every field traces back to an OSM
 * element id that can be opened on openstreetmap.org.
 */
import { verified, type Sourced } from "./provenance";

const OVERPASS_URL =
  process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";

// Overpass rejects Node's default `User-Agent: node` with HTTP 406, so every
// request identifies the app explicitly.
const UA =
  process.env.NOMINATIM_USER_AGENT ?? "ai-travel-planner/1.0 (+http://localhost:3000)";

export type PoiCategory = "stay" | "food" | "attraction";

export type Poi = {
  id: string;
  osmType: "node" | "way" | "relation";
  osmId: number;
  name: string;
  category: PoiCategory;
  /** Specific OSM kind: "hotel", "guest_house", "restaurant", "museum"... */
  kind: string;
  lat: number;
  lon: number;
  address?: string;
  openingHours?: string;
  /** OSM `fee` tag: yes / no. Absent when unmapped. */
  fee?: string;
  /** OSM `charge` tag, e.g. "200 INR" - a real recorded price when present. */
  charge?: string;
  website?: string;
  phone?: string;
  cuisine?: string;
  stars?: number;
  wikidata?: string;
  wikipedia?: string;
  /** Link back to the element so any claim is checkable. */
  osmUrl: string;
};

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/** Tag selectors per category. Kept explicit so results stay predictable. */
const SELECTORS: Record<PoiCategory, string[]> = {
  stay: [
    'node["tourism"~"^(hotel|guest_house|hostel|motel|apartment|chalet)$"]',
    'way["tourism"~"^(hotel|guest_house|hostel|motel|apartment|chalet)$"]',
  ],
  food: [
    'node["amenity"~"^(restaurant|cafe|fast_food)$"]',
    'way["amenity"~"^(restaurant|cafe|fast_food)$"]',
  ],
  attraction: [
    'node["tourism"~"^(attraction|museum|viewpoint|artwork|gallery|zoo|theme_park)$"]',
    'way["tourism"~"^(attraction|museum|viewpoint|artwork|gallery|zoo|theme_park)$"]',
    'node["historic"]',
    'way["historic"]',
    'node["natural"~"^(peak|waterfall|hot_spring)$"]',
    'way["leisure"~"^(park|nature_reserve|garden)$"]',
    'node["amenity"="place_of_worship"]["name"]',
    'way["amenity"="place_of_worship"]["name"]',
  ],
};

function kindOf(tags: Record<string, string>, category: PoiCategory): string {
  if (category === "stay") return tags.tourism ?? "accommodation";
  if (category === "food") return tags.amenity ?? "restaurant";
  return (
    tags.tourism ??
    tags.historic ??
    tags.natural ??
    tags.leisure ??
    (tags.amenity === "place_of_worship" ? "place_of_worship" : "attraction")
  );
}

function addressOf(tags: Record<string, string>): string | undefined {
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:suburb"],
    tags["addr:city"],
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

/** Selectors are issued in batches of this size to stay under the time limit. */
const BATCH_SIZE = 3;

/** How many selector batches a category needs. */
export function batchCount(category: PoiCategory): number {
  return Math.ceil(SELECTORS[category].length / BATCH_SIZE);
}

export async function fetchPois(
  category: PoiCategory,
  center: { lat: number; lon: number },
  radiusMetres = 15000,
  /** Run only this batch. Omit to run them all. */
  onlyBatch?: number
): Promise<Poi[]> {
  const selectors = SELECTORS[category];
  const allBatches: string[][] = [];
  for (let i = 0; i < selectors.length; i += BATCH_SIZE) {
    allBatches.push(selectors.slice(i, i + BATCH_SIZE));
  }
  const batches =
    onlyBatch === undefined ? allBatches : [allBatches[onlyBatch] ?? []];

  const merged = new Map<string, Poi>();
  for (const batch of batches) {
    if (!batch.length) continue;
    // Overpass is a busy shared service; 429/504 are common and transient.
    let results = await runQuery(batch, center, radiusMetres, category);
    // One retry only: Overpass 429/504s are common, but a stage must stay
    // comfortably inside a serverless time limit.
    if (!results.length) {
      await new Promise((r) => setTimeout(r, 1500));
      results = await runQuery(batch, center, radiusMetres, category);
    }
    for (const poi of results) merged.set(poi.id, poi);
  }

  return [...merged.values()].sort((a, b) => tagScore(b) - tagScore(a));
}

async function runQuery(
  selectors: string[],
  center: { lat: number; lon: number },
  radiusMetres: number,
  category: PoiCategory
): Promise<Poi[]> {
  const parts = selectors
    .map((sel) => `  ${sel}(around:${radiusMetres},${center.lat},${center.lon});`)
    .join("\n");
  const query = `[out:json][timeout:25];\n(\n${parts}\n);\nout center tags 200;`;

  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA,
        Accept: "application/json",
      },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(28000),
    });

    if (!res.ok) {
      console.error("[overpass] HTTP", res.status, category);
      return [];
    }

    const data = (await res.json()) as { elements?: OverpassElement[] };

    const pois: Poi[] = [];
    for (const el of data.elements ?? []) {
      const tags = el.tags ?? {};
      const name = tags.name?.trim();
      // An unnamed POI is useless in an itinerary - never invent a name.
      if (!name) continue;

      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat === undefined || lon === undefined) continue;

      pois.push({
        id: `${el.type}/${el.id}`,
        osmType: el.type,
        osmId: el.id,
        name,
        category,
        kind: kindOf(tags, category),
        lat,
        lon,
        address: addressOf(tags),
        openingHours: tags.opening_hours,
        fee: tags.fee,
        charge: tags.charge,
        website: tags.website ?? tags["contact:website"],
        phone: tags.phone ?? tags["contact:phone"],
        cuisine: tags.cuisine,
        stars: tags.stars ? Number(tags.stars) : undefined,
        wikidata: tags.wikidata,
        wikipedia: tags.wikipedia,
        osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      });
    }

    return pois;
  } catch (error) {
    console.error("[overpass] query failed:", category, error);
    return [];
  }
}

/** More recorded detail => more useful and more verifiable in the itinerary. */
function tagScore(p: Poi): number {
  return (
    (p.wikidata ? 3 : 0) +
    (p.website ? 2 : 0) +
    (p.openingHours ? 2 : 0) +
    (p.charge ? 2 : 0) +
    (p.phone ? 1 : 0) +
    (p.address ? 1 : 0) +
    (p.stars ? 1 : 0) +
    (p.cuisine ? 1 : 0)
  );
}

/** Wrap a POI's recorded entry charge as a sourced value, when OSM has one. */
export function chargeToSourced(poi: Poi): Sourced<number> | null {
  if (!poi.charge) return null;
  const match = poi.charge.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;

  return verified(Number(match[1]), {
    method: "openstreetmap",
    label: `OSM ${poi.id} charge=${poi.charge}`,
    url: poi.osmUrl,
  });
}

export async function fetchAllPois(
  center: { lat: number; lon: number },
  radiusMetres = 15000
): Promise<Record<PoiCategory, Poi[]>> {
  // Overpass is a shared free service; run sequentially rather than hammering it.
  const stay = await fetchPois("stay", center, radiusMetres);
  const food = await fetchPois("food", center, radiusMetres);
  const attraction = await fetchPois("attraction", center, radiusMetres);
  return { stay, food, attraction };
}
