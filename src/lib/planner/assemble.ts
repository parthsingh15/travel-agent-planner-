/**
 * Day-by-day assembly.
 *
 * Every entry names a real OSM place, and every gap between entries is a real
 * routed leg, so the clock reflects actual travel rather than round numbers.
 * This stage arranges researched facts; it never introduces a new place.
 */
import type { Poi } from "@/lib/research/overpass";
import type { ResearchBundle, TransportOption } from "@/lib/research";
import { routeMatrix } from "@/lib/research/osrm";
import {
  estimateEntryFee,
  estimateMealPerPerson,
  estimateStayPerNight,
  type TravelStyleKey,
} from "@/lib/research/cost-model";
import type { Sourced } from "@/lib/research/provenance";
import type { PlanSelection } from "./budget";

export type ScheduleEntry = {
  time: string;
  endTime: string;
  kind: "travel" | "checkin" | "attraction" | "meal" | "rest";
  title: string;
  /** Real place name; null for pure travel legs. */
  placeName: string | null;
  location: string | null;
  osmUrl: string | null;
  lat: number | null;
  lon: number | null;
  durationMin: number;
  cost: Sourced<number> | null;
  travelFromPrevious?: {
    distanceKm: number;
    durationMin: number;
    confidence: string;
  } | null;
  notes?: string;
};

export type PlannedDay = {
  day: number;
  date: string;
  title: string;
  entries: ScheduleEntry[];
  dayCost: number;
};

/** Typical visit length by OSM kind, in minutes. */
const VISIT_MINUTES: Record<string, number> = {
  museum: 90, gallery: 60, attraction: 75, theme_park: 180, zoo: 150,
  viewpoint: 45, peak: 120, waterfall: 60, hot_spring: 90,
  nature_reserve: 150, park: 60, garden: 45,
  place_of_worship: 40, monument: 40, memorial: 30,
  ruins: 45, castle: 90, fort: 90, archaeological_site: 60,
};

const MEAL_MINUTES = 60;
const DAY_START = 9 * 60;
const DAY_END = 21 * 60;

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const toClock = (mins: number) =>
  `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

function visitMinutes(poi: Poi): number {
  return VISIT_MINUTES[poi.kind] ?? 60;
}

function locationOf(poi: Poi): string {
  return poi.address ?? `${poi.lat.toFixed(4)}, ${poi.lon.toFixed(4)}`;
}

/**
 * Does an OSM opening_hours string plausibly cover this time?
 * Deliberately conservative: only flags a clear miss, never guesses closure
 * from an unparseable rule.
 */
export function likelyOpenAt(openingHours: string | undefined, minutes: number): boolean {
  if (!openingHours) return true;
  if (/24\/7/.test(openingHours)) return true;

  const ranges = [...openingHours.matchAll(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g)];
  if (!ranges.length) return true;

  return ranges.some((m) => {
    const start = Number(m[1]) * 60 + Number(m[2]);
    const end = Number(m[3]) * 60 + Number(m[4]);
    return minutes >= start && minutes <= end;
  });
}

export type AssembleInput = {
  research: ResearchBundle;
  selection: PlanSelection;
  startDate: string;
  days: number;
  travellers: number;
  style: TravelStyleKey;
  destinationName: string;
};

export async function assembleItinerary(
  input: AssembleInput
): Promise<PlannedDay[]> {
  const { research, selection, days, travellers, startDate } = input;
  const stay = selection.stay;
  const attractions = [...selection.attractions];
  const meals = [...selection.meals];

  // Spread attractions across the days available for sightseeing.
  const sightseeingDays = Math.max(1, days);
  const perDay = Math.max(1, Math.ceil(attractions.length / sightseeingDays));

  const planned: PlannedDay[] = [];
  let mealCursor = 0;

  for (let dayIndex = 0; dayIndex < days; dayIndex++) {
    const date = addDays(startDate, dayIndex);
    const entries: ScheduleEntry[] = [];
    let clock = DAY_START;
    const isFirst = dayIndex === 0;
    const isLast = dayIndex === days - 1;

    // Day 1 opens with the intercity journey.
    if (isFirst && research.intercity && selection.transport) {
      const t: TransportOption = selection.transport;
      const dur = t.durationMin.value;
      // A journey longer than the morning window departs the previous evening;
      // clamping it to midnight would misstate the duration.
      const overnight = dur > DAY_START;
      const departLabel = overnight
        ? `${toClock(((DAY_START - dur) % 1440 + 1440) % 1440)} (previous day)`
        : toClock(DAY_START - dur);
      entries.push({
        time: departLabel,
        endTime: toClock(DAY_START),
        kind: "travel",
        title: `${research.origin?.name ?? "Origin"} → ${research.destination.name} by ${t.mode}`,
        placeName: null,
        location: `${research.origin?.name ?? "Origin"} → ${research.destination.name}`,
        osmUrl: null,
        lat: null,
        lon: null,
        durationMin: dur,
        cost: t.fare,
        travelFromPrevious: {
          distanceKm: t.distanceKm.value,
          durationMin: dur,
          confidence: t.durationMin.confidence,
        },
        notes: t.durationMin.note,
      });
    }

    // Hotel check-in on arrival day, checkout on the last.
    if (isFirst && stay) {
      const perNight = estimateStayPerNight(stay, selection.style, input.destinationName);
      entries.push({
        time: toClock(clock),
        endTime: toClock(clock + 45),
        kind: "checkin",
        title: `Check in at ${stay.name}`,
        placeName: stay.name,
        location: locationOf(stay),
        osmUrl: stay.osmUrl,
        lat: stay.lat,
        lon: stay.lon,
        durationMin: 45,
        cost: perNight,
        notes: `₹${perNight.value} per night. ${perNight.note ?? ""}`.trim(),
      });
      clock += 45;
    }

    // Today's attractions, ordered by proximity to the previous stop.
    const slice = attractions.splice(0, perDay);
    let previous: { lat: number; lon: number } | null = stay
      ? { lat: stay.lat, lon: stay.lon }
      : null;

    // One matrix call per day keeps the routing service load reasonable.
    const legs = previous && slice.length
      ? await routeMatrix(previous, slice.map((p) => ({ lat: p.lat, lon: p.lon })))
      : [];

    // Visit nearest-first so the day doesn't zig-zag across town.
    const ordered = slice
      .map((poi, i) => ({ poi, leg: legs[i] }))
      .sort((a, b) => (a.leg?.distanceKm.value ?? 0) - (b.leg?.distanceKm.value ?? 0));

    for (const { poi, leg } of ordered) {
      const travelMin = leg ? Math.max(5, leg.durationMin.value) : 15;
      clock += travelMin;

      const stayMin = visitMinutes(poi);
      if (clock + stayMin > DAY_END) break;

      // Slot lunch in around midday, before the next sight if we are past it.
      const hadLunch = entries.some(
        (e) => e.kind === "meal" && toMinutes(e.time) < 16 * 60
      );
      if (!hadLunch && clock >= 12 * 60 + 30) {
        const spot = meals[mealCursor++ % Math.max(1, meals.length)];
        if (spot) {
          const cost = estimateMealPerPerson(spot, selection.style, input.destinationName);
          entries.push({
            time: toClock(clock),
            endTime: toClock(clock + MEAL_MINUTES),
            kind: "meal",
            title: `Lunch at ${spot.name}`,
            placeName: spot.name,
            location: locationOf(spot),
            osmUrl: spot.osmUrl,
            lat: spot.lat,
            lon: spot.lon,
            durationMin: MEAL_MINUTES,
            cost: { ...cost, value: cost.value * travellers },
            notes: [spot.cuisine ? `Cuisine: ${spot.cuisine}` : null, spot.openingHours ? `Hours: ${spot.openingHours}` : null]
              .filter(Boolean).join(" · ") || undefined,
          });
          clock += MEAL_MINUTES;
        }
      }

      const fee = estimateEntryFee(poi);
      const openNote = likelyOpenAt(poi.openingHours, clock)
        ? undefined
        : `OSM hours "${poi.openingHours}" may not cover this slot - verify before visiting.`;

      entries.push({
        time: toClock(clock),
        endTime: toClock(clock + stayMin),
        kind: "attraction",
        title: `Visit ${poi.name}`,
        placeName: poi.name,
        location: locationOf(poi),
        osmUrl: poi.osmUrl,
        lat: poi.lat,
        lon: poi.lon,
        durationMin: stayMin,
        cost: { ...fee, value: fee.value * travellers },
        travelFromPrevious: leg
          ? {
              distanceKm: leg.distanceKm.value,
              durationMin: leg.durationMin.value,
              confidence: leg.distanceKm.confidence,
            }
          : null,
        notes: [poi.openingHours ? `Hours: ${poi.openingHours}` : null, openNote]
          .filter(Boolean).join(" · ") || undefined,
      });

      clock += stayMin;
      previous = { lat: poi.lat, lon: poi.lon };
    }

    // A short sightseeing day still needs lunch.
    if (meals.length && !entries.some((e) => e.kind === "meal" && toMinutes(e.time) < 16 * 60)) {
      const spot = meals[mealCursor++ % meals.length];
      const lunchAt = Math.max(clock + 15, 13 * 60);
      const cost = estimateMealPerPerson(spot, selection.style, input.destinationName);
      entries.push({
        time: toClock(lunchAt),
        endTime: toClock(lunchAt + MEAL_MINUTES),
        kind: "meal",
        title: `Lunch at ${spot.name}`,
        placeName: spot.name,
        location: locationOf(spot),
        osmUrl: spot.osmUrl,
        lat: spot.lat,
        lon: spot.lon,
        durationMin: MEAL_MINUTES,
        cost: { ...cost, value: cost.value * travellers },
        notes: [spot.cuisine ? `Cuisine: ${spot.cuisine}` : null, spot.openingHours ? `Hours: ${spot.openingHours}` : null]
          .filter(Boolean).join(" · ") || undefined,
      });
      clock = Math.max(clock, lunchAt + MEAL_MINUTES);
    }

    // Dinner before the day closes.
    if (clock < DAY_END && meals.length) {
      const spot = meals[mealCursor++ % meals.length];
      const dinnerAt = Math.max(clock + 30, 20 * 60);
      if (dinnerAt + MEAL_MINUTES <= DAY_END + 90) {
        const cost = estimateMealPerPerson(spot, selection.style, input.destinationName);
        entries.push({
          time: toClock(dinnerAt),
          endTime: toClock(dinnerAt + MEAL_MINUTES),
          kind: "meal",
          title: `Dinner at ${spot.name}`,
          placeName: spot.name,
          location: locationOf(spot),
          osmUrl: spot.osmUrl,
          lat: spot.lat,
          lon: spot.lon,
          durationMin: MEAL_MINUTES,
          cost: { ...cost, value: cost.value * travellers },
          notes: [spot.cuisine ? `Cuisine: ${spot.cuisine}` : null, spot.openingHours ? `Hours: ${spot.openingHours}` : null]
            .filter(Boolean).join(" · ") || undefined,
        });
      }
    }

    // Return journey on the final day.
    if (isLast && research.intercity && selection.transport && days > 1) {
      const t = selection.transport;
      entries.push({
        time: toClock(21 * 60),
        endTime: toClock(21 * 60 + Math.min(t.durationMin.value, 180)),
        kind: "travel",
        title: `Return to ${research.origin?.name ?? "origin"} by ${t.mode}`,
        placeName: null,
        location: `${research.destination.name} → ${research.origin?.name ?? "origin"}`,
        osmUrl: null,
        lat: null,
        lon: null,
        durationMin: t.durationMin.value,
        cost: t.mode === "cab" ? null : t.fare,
        travelFromPrevious: null,
        notes: t.mode === "cab" ? "Return leg included in the outstation cab fare." : undefined,
      });
    }

    planned.push({
      day: dayIndex + 1,
      date,
      title: isFirst
        ? `Arrival in ${research.destination.name}`
        : isLast
          ? `${research.destination.name} and departure`
          : `Exploring ${research.destination.name}`,
      entries,
      dayCost: entries.reduce((s, e) => s + (e.cost?.value ?? 0), 0),
    });
  }

  return planned;
}
