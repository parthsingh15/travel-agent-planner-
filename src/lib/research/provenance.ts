/**
 * Provenance: no fact reaches the itinerary as a bare value.
 *
 * The planner's core rule is that it never invents information. Enforcing that
 * in prose is hopeless, so it is enforced in the type system instead: every
 * price, opening time and duration travels as a `Sourced<T>` carrying where it
 * came from and whether it was verified or estimated. The verification agent
 * rejects any itinerary containing an unlabelled estimate.
 */

export type Confidence = "VERIFIED" | "ESTIMATED";

export type SourceMethod =
  | "openstreetmap"   // Overpass / Nominatim tag data
  | "osrm"            // routing engine
  | "open-meteo"      // weather
  | "web-search"      // Tavily result with a citation
  | "computed"        // derived arithmetic over other sourced values
  | "heuristic";      // documented rule-of-thumb, never a model guess

export type SourceRef = {
  method: SourceMethod;
  /** Human-readable origin, e.g. "OpenStreetMap node/123" or a page title. */
  label: string;
  url?: string;
  fetchedAt: string;
};

export type Sourced<T> = {
  value: T;
  confidence: Confidence;
  source: SourceRef;
  /** Why this is an estimate, shown to the user beside the ESTIMATED badge. */
  note?: string;
};

export function verified<T>(
  value: T,
  source: Omit<SourceRef, "fetchedAt"> & { fetchedAt?: string }
): Sourced<T> {
  return {
    value,
    confidence: "VERIFIED",
    source: { ...source, fetchedAt: source.fetchedAt ?? new Date().toISOString() },
  };
}

export function estimated<T>(
  value: T,
  note: string,
  method: SourceMethod = "heuristic",
  label = "Estimated from typical Indian travel costs"
): Sourced<T> {
  return {
    value,
    confidence: "ESTIMATED",
    note,
    source: { method, label, fetchedAt: new Date().toISOString() },
  };
}

/** Derive a value from other sourced values; ESTIMATED if any input was. */
export function computed<T>(
  value: T,
  inputs: Sourced<unknown>[],
  label: string
): Sourced<T> {
  const anyEstimated = inputs.some((i) => i.confidence === "ESTIMATED");
  return {
    value,
    confidence: anyEstimated ? "ESTIMATED" : "VERIFIED",
    note: anyEstimated ? "Includes estimated components" : undefined,
    source: { method: "computed", label, fetchedAt: new Date().toISOString() },
  };
}

export const valueOf = <T>(s: Sourced<T> | undefined | null, fallback: T): T =>
  s ? s.value : fallback;

/** Collect de-duplicated citations for display under an itinerary. */
export function collectSources(values: Sourced<unknown>[]): SourceRef[] {
  const seen = new Map<string, SourceRef>();
  for (const v of values) {
    const key = v.source.url ?? `${v.source.method}:${v.source.label}`;
    if (!seen.has(key)) seen.set(key, v.source);
  }
  return [...seen.values()];
}

export function countByConfidence(values: Sourced<unknown>[]) {
  return {
    verified: values.filter((v) => v.confidence === "VERIFIED").length,
    estimated: values.filter((v) => v.confidence === "ESTIMATED").length,
  };
}
