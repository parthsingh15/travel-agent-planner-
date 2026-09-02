"use client";

import { useState } from "react";
import {
  ChevronDown, ChevronUp, MapPin, Clock, ExternalLink,
  Bus, BedDouble, Landmark, UtensilsCrossed, Navigation,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export type SourcedValue = {
  value: number;
  confidence: "VERIFIED" | "ESTIMATED";
  note?: string;
  source?: { method: string; label: string; url?: string };
};

export type ScheduleEntry = {
  time: string;
  endTime: string;
  kind: "travel" | "checkin" | "attraction" | "meal" | "rest";
  title: string;
  placeName: string | null;
  location: string | null;
  osmUrl: string | null;
  durationMin: number;
  cost: SourcedValue | null;
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

/**
 * Itineraries generated before the research pipeline stored days as
 * `{ activities, meals }` instead of `entries`. Those versions are immutable
 * history and must keep rendering, so they are adapted here rather than
 * migrated or dropped.
 */
export type LegacyDay = {
  day: number;
  date: string;
  title: string;
  activities?: {
    time?: string;
    title?: string;
    description?: string;
    estimatedCost?: number;
  }[];
  meals?: { type?: string; restaurant?: string; estimatedCost?: number }[];
  accommodation?: string;
  dailyBudget?: number;
};

export type AnyDay = PlannedDay | LegacyDay;

export function isLegacyDay(day: AnyDay): day is LegacyDay {
  return !Array.isArray((day as PlannedDay).entries);
}

const addHour = (hhmm: string) => {
  const [h, m] = (hhmm || "09:00").split(":").map(Number);
  return `${String(((h || 0) + 1) % 24).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
};

const legacyCost = (amount?: number): SourcedValue | null =>
  typeof amount === "number" && amount > 0
    ? { value: amount, confidence: "ESTIMATED", note: "From an earlier itinerary version" }
    : null;

/** Adapt a legacy day into the current entry shape for display only. */
export function normalizeDay(day: AnyDay): PlannedDay {
  if (!isLegacyDay(day)) {
    return { ...day, entries: day.entries ?? [], dayCost: day.dayCost ?? 0 };
  }

  const entries: ScheduleEntry[] = [
    ...(day.activities ?? []).map((a) => ({
      time: a.time ?? "09:00",
      endTime: addHour(a.time ?? "09:00"),
      kind: "attraction" as const,
      title: a.title ?? "Activity",
      placeName: a.title ?? null,
      location: null,
      osmUrl: null,
      durationMin: 60,
      cost: legacyCost(a.estimatedCost),
      notes: a.description,
    })),
    ...(day.meals ?? []).map((m) => ({
      time: "13:00",
      endTime: "14:00",
      kind: "meal" as const,
      title: `${m.type ?? "Meal"}${m.restaurant ? ` at ${m.restaurant}` : ""}`,
      placeName: m.restaurant ?? null,
      location: null,
      osmUrl: null,
      durationMin: 60,
      cost: legacyCost(m.estimatedCost),
    })),
  ];

  return {
    day: day.day,
    date: day.date,
    title: day.title,
    entries,
    dayCost:
      day.dailyBudget ?? entries.reduce((s, e) => s + (e.cost?.value ?? 0), 0),
  };
}

const KIND_ICON = {
  travel: Bus,
  checkin: BedDouble,
  attraction: Landmark,
  meal: UtensilsCrossed,
  rest: Clock,
} as const;

const KIND_COLOUR = {
  travel: "bg-sky-100 text-sky-700 border-sky-300",
  checkin: "bg-violet-100 text-violet-700 border-violet-300",
  attraction: "bg-emerald-100 text-emerald-700 border-emerald-300",
  meal: "bg-amber-100 text-amber-700 border-amber-300",
  rest: "bg-slate-100 text-slate-600 border-slate-300",
} as const;

/** Badge making the VERIFIED/ESTIMATED distinction impossible to miss. */
export function ConfidenceBadge({ value }: { value: SourcedValue }) {
  const estimated = value.confidence === "ESTIMATED";
  return (
    <span
      title={value.note ?? value.source?.label}
      className={`ml-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        estimated
          ? "bg-amber-100 text-amber-800"
          : "bg-green-100 text-green-800"
      }`}
    >
      {estimated ? "Est" : "Verified"}
    </span>
  );
}

function formatDuration(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function ItineraryTimeline({
  days: rawDays,
  currency = "INR",
}: {
  days: AnyDay[];
  currency?: string;
}) {
  const [open, setOpen] = useState<Set<number>>(new Set([1]));

  const legacy = rawDays.some(isLegacyDay);
  const days = rawDays.map(normalizeDay);

  const toggle = (day: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });

  if (!days.length) {
    return <p className="text-sm text-slate-500">No itinerary days to show.</p>;
  }

  return (
    <div className="space-y-3">
      {legacy && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          This is an earlier itinerary version, created before the research
          pipeline. It has no source links or verified costs. Regenerate the trip
          for a fully researched itinerary — this version is kept as history.
        </p>
      )}
      {days.map((day) => {
        const expanded = open.has(day.day);
        return (
          <div key={day.day} className="rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => toggle(day.day)}
              aria-expanded={expanded}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
            >
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">
                  Day {day.day} — {day.title}
                </p>
                <p className="text-xs text-slate-500">
                  {day.date} · {day.entries.length} stops ·{" "}
                  {formatCurrency(day.dayCost, currency)}
                </p>
              </div>
              {expanded ? (
                <ChevronUp className="h-4 w-4 flex-shrink-0 text-slate-400" />
              ) : (
                <ChevronDown className="h-4 w-4 flex-shrink-0 text-slate-400" />
              )}
            </button>

            {expanded && (
              <ol className="divide-y divide-slate-100">
                {day.entries.map((entry, i) => {
                  const Icon = KIND_ICON[entry.kind] ?? Clock;
                  return (
                    <li key={`${entry.time}-${i}`} className="px-4 py-3">
                      {entry.travelFromPrevious && (
                        <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
                          <Navigation className="h-3 w-3" />
                          {entry.travelFromPrevious.distanceKm} km ·{" "}
                          {formatDuration(entry.travelFromPrevious.durationMin)} travel
                        </p>
                      )}

                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-[104px]">
                          <p className="font-mono text-xs font-semibold text-slate-700">
                            {entry.time}
                          </p>
                          <p className="font-mono text-[11px] text-slate-400">
                            {entry.endTime}
                          </p>
                        </div>

                        <div
                          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border ${KIND_COLOUR[entry.kind]}`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900">{entry.title}</p>

                          {entry.location && (
                            <p className="mt-0.5 flex items-start gap-1 text-xs text-slate-500">
                              <MapPin className="mt-0.5 h-3 w-3 flex-shrink-0" />
                              <span className="break-words">{entry.location}</span>
                            </p>
                          )}

                          <p className="mt-1 text-xs text-slate-400">
                            {formatDuration(entry.durationMin)}
                          </p>

                          {entry.notes && (
                            <p className="mt-1 text-xs text-slate-500">{entry.notes}</p>
                          )}

                          {entry.osmUrl && (
                            <a
                              href={entry.osmUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
                            >
                              View on OpenStreetMap
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>

                        {entry.cost && (
                          <div className="flex-shrink-0 text-right">
                            <p className="font-semibold text-slate-900">
                              {formatCurrency(entry.cost.value, currency)}
                            </p>
                            <ConfidenceBadge value={entry.cost} />
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        );
      })}
    </div>
  );
}
