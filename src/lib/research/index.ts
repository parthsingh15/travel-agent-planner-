/**
 * Research phase: gather real facts before any planning happens.
 *
 * Nothing here asks a language model what exists. Places come from
 * OpenStreetMap, distances from OSRM, weather from Open-Meteo. The output is a
 * ResearchBundle of verifiable facts that later stages arrange - they never
 * add new places or invent prices.
 */
import { geocodePlace, type GeoPlace } from "./nominatim";
import { fetchPois, type Poi } from "./overpass";
import {
  routeBetween,
  realisticDuration,
  classifyRoad,
  isMountainous,
  type Leg,
} from "./osrm";
import {
  estimateFare,
  feasibleModes,
  type TransportMode,
} from "./cost-model";
import type { Sourced, SourceRef } from "./provenance";
import { collectSources } from "./provenance";

export type TransportOption = {
  mode: TransportMode;
  distanceKm: Sourced<number>;
  durationMin: Sourced<number>;
  fare: Sourced<number>;
};

export type ResearchBundle = {
  origin: GeoPlace | null;
  destination: GeoPlace;
  mountainous: boolean;
  /** Intercity leg, absent when no origin was supplied. */
  intercity: {
    leg: Leg;
    realisticDurationMin: Sourced<number>;
    options: TransportOption[];
  } | null;
  stays: Poi[];
  food: Poi[];
  attractions: Poi[];
  sources: SourceRef[];
  warnings: string[];
};

export type ResearchInput = {
  destination: string;
  origin?: string | null;
  travellers: number;
  /** Search radius for POIs around the destination centre. */
  radiusMetres?: number;
};

/**
 * Rank attractions so genuinely notable sites lead. A Wikidata or Wikipedia
 * tag is the strongest available signal that a place is a real landmark rather
 * than a minor mapped feature.
 */
function notabilityScore(p: Poi): number {
  return (
    (p.wikidata ? 6 : 0) +
    (p.wikipedia ? 4 : 0) +
    (p.website ? 2 : 0) +
    (p.openingHours ? 2 : 0) +
    (p.charge ? 2 : 0) +
    (p.address ? 1 : 0) +
    // Prefer visitable sights over generic mapped features.
    (["museum", "attraction", "theme_park", "zoo", "gallery"].includes(p.kind) ? 3 : 0) +
    (["viewpoint", "waterfall", "peak", "nature_reserve"].includes(p.kind) ? 2 : 0)
  );
}

export async function researchTrip(
  input: ResearchInput
): Promise<ResearchBundle | null> {
  const warnings: string[] = [];

  const destination = await geocodePlace(input.destination);
  if (!destination) return null;

  const origin = input.origin ? await geocodePlace(input.origin) : null;
  if (input.origin && !origin) {
    warnings.push(
      `Could not locate the starting city "${input.origin}". ` +
        `Travel to the destination is not costed.`
    );
  }

  const radius = input.radiusMetres ?? 15000;

  // Sequential: Overpass is a shared free service and dislikes bursts.
  const stays = await fetchPois("stay", destination, radius);
  const food = await fetchPois("food", destination, radius);
  const attractionsRaw = await fetchPois("attraction", destination, radius);

  const attractions = [...attractionsRaw].sort(
    (a, b) => notabilityScore(b) - notabilityScore(a)
  );

  if (!stays.length) warnings.push(`No accommodation is mapped near ${destination.name}.`);
  if (!food.length) warnings.push(`No restaurants are mapped near ${destination.name}.`);
  if (!attractions.length) warnings.push(`No attractions are mapped near ${destination.name}.`);

  const mountainous =
    isMountainous(destination.state) || isMountainous(destination.displayName);

  let intercity: ResearchBundle["intercity"] = null;

  if (origin) {
    const leg = await routeBetween(origin, destination);
    const kind = classifyRoad(leg.distanceKm.value, mountainous);
    const realistic = realisticDuration(leg, kind);

    const options: TransportOption[] = feasibleModes(leg.distanceKm.value).map(
      (mode) => ({
        mode,
        distanceKm: leg.distanceKm,
        // Flights don't follow the road; everything else uses the road estimate.
        durationMin:
          mode === "flight"
            ? {
                ...realistic,
                value: Math.round(leg.distanceKm.value / 12 + 150),
                note:
                  "Approximate gate-to-gate time including airport transfers " +
                  "and check-in. Not a live schedule.",
              }
            : realistic,
        fare: estimateFare(mode, leg.distanceKm.value, input.travellers),
      })
    );

    intercity = { leg, realisticDurationMin: realistic, options };
  }

  const sourced: Sourced<unknown>[] = [
    ...(intercity ? [intercity.leg.distanceKm, intercity.leg.durationMin] : []),
    ...(intercity?.options.flatMap((o) => [o.fare]) ?? []),
  ];

  const sources = collectSources(sourced);

  // Places themselves are OSM-sourced; record that once.
  if (stays.length || food.length || attractions.length) {
    sources.unshift({
      method: "openstreetmap",
      label: `OpenStreetMap POI data around ${destination.name} (${stays.length} stays, ${food.length} eateries, ${attractions.length} attractions)`,
      url: `https://www.openstreetmap.org/#map=13/${destination.lat}/${destination.lon}`,
      fetchedAt: new Date().toISOString(),
    });
  }

  return {
    origin,
    destination,
    mountainous,
    intercity,
    stays,
    food,
    attractions,
    sources,
    warnings,
  };
}
