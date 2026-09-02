/**
 * Builds the factual context the travel assistant reasons over.
 *
 * The assistant must answer from the user's real researched itinerary - actual
 * place names, actual costs, actual remaining budget - rather than from model
 * priors. This assembles that context from the database in a compact form that
 * fits comfortably in a prompt.
 */
import { prisma } from "@/lib/db";
import { summariseExpenses } from "@/lib/expense-service";

export type TripFacts = {
  tripId: string;
  title: string;
  destination: string;
  origin: string | null;
  startDate: string;
  endDate: string;
  days: number;
  travellers: number;
  budget: number;
  currency: string;
  travelStyle: string;
  interests: string[];

  itinerary: {
    versionNumber: number;
    title: string;
    totalCost: number | null;
    days: {
      day: number;
      date: string;
      title: string;
      dayCost: number;
      stops: {
        time: string;
        title: string;
        placeName: string | null;
        kind: string;
        cost: number | null;
        confidence: string | null;
      }[];
    }[];
    breakdown: { label: string; amount: number; confidence: string }[] | null;
    isLegacy: boolean;
  } | null;

  spend: {
    totalSpent: number;
    remaining: number;
    percentUsed: number;
    overBudget: boolean;
    byCategory: { category: string; amount: number }[];
  };
};

type LooseDay = Record<string, unknown>;

function readDays(dayByDay: unknown): {
  days: TripFacts["itinerary"] extends null ? never : NonNullable<TripFacts["itinerary"]>["days"];
  isLegacy: boolean;
} {
  const raw = Array.isArray(dayByDay) ? (dayByDay as LooseDay[]) : [];
  const isLegacy = raw.length > 0 && !Array.isArray(raw[0].entries);

  const days = raw.map((d, i) => {
    const entries = Array.isArray(d.entries) ? (d.entries as LooseDay[]) : null;

    if (entries) {
      return {
        day: Number(d.day ?? i + 1),
        date: String(d.date ?? ""),
        title: String(d.title ?? ""),
        dayCost: Number(d.dayCost ?? 0),
        stops: entries.map((e) => {
          const cost = e.cost as { value?: number; confidence?: string } | null;
          return {
            time: String(e.time ?? ""),
            title: String(e.title ?? ""),
            placeName: (e.placeName as string | null) ?? null,
            kind: String(e.kind ?? "stop"),
            cost: cost?.value ?? null,
            confidence: cost?.confidence ?? null,
          };
        }),
      };
    }

    // Legacy {activities, meals} shape from before the research pipeline.
    const activities = Array.isArray(d.activities) ? (d.activities as LooseDay[]) : [];
    const meals = Array.isArray(d.meals) ? (d.meals as LooseDay[]) : [];
    return {
      day: Number(d.day ?? i + 1),
      date: String(d.date ?? ""),
      title: String(d.title ?? ""),
      dayCost: Number(d.dailyBudget ?? 0),
      stops: [
        ...activities.map((a) => ({
          time: String(a.time ?? ""),
          title: String(a.title ?? "Activity"),
          placeName: (a.title as string | null) ?? null,
          kind: "attraction",
          cost: (a.estimatedCost as number | undefined) ?? null,
          confidence: "ESTIMATED",
        })),
        ...meals.map((m) => ({
          time: "",
          title: `${m.type ?? "Meal"}${m.restaurant ? ` at ${m.restaurant}` : ""}`,
          placeName: (m.restaurant as string | null) ?? null,
          kind: "meal",
          cost: (m.estimatedCost as number | undefined) ?? null,
          confidence: "ESTIMATED",
        })),
      ],
    };
  });

  return { days, isLegacy };
}

export async function loadTripFacts(
  tripId: string,
  userId: string
): Promise<TripFacts | null> {
  const trip = await prisma.trip.findFirst({
    where: { id: tripId, userId },
    include: {
      versions: { orderBy: { versionNumber: "desc" }, take: 1 },
      expenses: true,
    },
  });
  if (!trip) return null;

  const version = trip.versions[0];
  const spend = summariseExpenses(trip.expenses, trip.budget, trip.currency);

  const startDate = trip.startDate.toISOString().split("T")[0];
  const endDate = trip.endDate.toISOString().split("T")[0];
  const days =
    Math.round(
      (trip.endDate.getTime() - trip.startDate.getTime()) / 86_400_000
    ) + 1;

  let itinerary: TripFacts["itinerary"] = null;

  if (version) {
    const { days: parsedDays, isLegacy } = readDays(version.dayByDay);
    const meta = version.metadata as
      | { breakdown?: { lines?: { label: string; amount: { value: number; confidence: string } }[] } }
      | null;

    itinerary = {
      versionNumber: version.versionNumber,
      title: version.title,
      totalCost: version.totalBudget,
      days: parsedDays,
      breakdown:
        meta?.breakdown?.lines?.map((l) => ({
          label: l.label,
          amount: l.amount.value,
          confidence: l.amount.confidence,
        })) ?? null,
      isLegacy,
    };
  }

  return {
    tripId: trip.id,
    title: trip.title,
    destination: trip.destination,
    origin: trip.origin,
    startDate,
    endDate,
    days,
    travellers: trip.travelers,
    budget: trip.budget,
    currency: trip.currency,
    travelStyle: trip.travelStyle,
    interests: trip.interests,
    itinerary,
    spend: {
      totalSpent: spend.totalSpent,
      remaining: spend.remaining,
      percentUsed: spend.percentUsed,
      overBudget: spend.overBudget,
      byCategory: spend.byCategory.map((c) => ({
        category: c.category,
        amount: c.amount,
      })),
    },
  };
}

const inr = (n: number, currency: string) =>
  currency === "INR" ? `₹${Math.round(n).toLocaleString("en-IN")}` : `${currency} ${Math.round(n)}`;

/** Render the facts as compact text for the model's system prompt. */
export function renderTripContext(f: TripFacts): string {
  const lines: string[] = [
    `TRIP: ${f.title}`,
    `Route: ${f.origin ? `${f.origin} → ` : ""}${f.destination}`,
    `Dates: ${f.startDate} to ${f.endDate} (${f.days} days)`,
    `Travellers: ${f.travellers} · Style: ${f.travelStyle} · Interests: ${f.interests.join(", ") || "none given"}`,
    `Budget: ${inr(f.budget, f.currency)}`,
    `Logged spend so far: ${inr(f.spend.totalSpent, f.currency)} (${f.spend.percentUsed}% of budget); remaining ${inr(f.spend.remaining, f.currency)}`,
  ];

  if (f.spend.byCategory.length) {
    lines.push(
      `Spend by category: ${f.spend.byCategory.map((c) => `${c.category} ${inr(c.amount, f.currency)}`).join(", ")}`
    );
  }

  if (!f.itinerary) {
    lines.push(`\nNo itinerary has been generated for this trip yet.`);
    return lines.join("\n");
  }

  lines.push(
    `\nITINERARY (version ${f.itinerary.versionNumber}: "${f.itinerary.title}")`,
    `Planned total: ${f.itinerary.totalCost ? inr(f.itinerary.totalCost, f.currency) : "unknown"}`
  );

  if (f.itinerary.breakdown?.length) {
    lines.push(
      `Cost breakdown: ${f.itinerary.breakdown
        .map((b) => `${b.label} ${inr(b.amount, f.currency)} [${b.confidence}]`)
        .join(", ")}`
    );
  }

  for (const d of f.itinerary.days) {
    lines.push(`\nDay ${d.day} (${d.date}) — ${d.title} — ${inr(d.dayCost, f.currency)}`);
    for (const s of d.stops) {
      const cost = s.cost ? ` ${inr(s.cost, f.currency)}${s.confidence === "ESTIMATED" ? " (est)" : ""}` : "";
      lines.push(`  ${s.time ? s.time + " " : ""}${s.title}${cost}`);
    }
  }

  if (f.itinerary.isLegacy) {
    lines.push(
      `\nNOTE: this itinerary predates the research pipeline, so its places are not source-linked.`
    );
  }

  return lines.join("\n");
}
