/**
 * Budget-first planning.
 *
 * The user's budget is a hard constraint, not a suggestion. This module costs a
 * candidate plan and, when it overruns, applies concrete downgrades in
 * cheapest-impact-first order and recosts - rather than returning a plan the
 * user cannot afford.
 */
import type { Poi } from "@/lib/research/overpass";
import type { TransportOption } from "@/lib/research";
import {
  estimateEntryFee,
  estimateLocalTransportPerDay,
  estimateMealPerPerson,
  estimateMiscellaneous,
  estimateStayPerNight,
  type TravelStyleKey,
} from "@/lib/research/cost-model";
import { computed, type Sourced } from "@/lib/research/provenance";

export type PlanSelection = {
  stay: Poi | null;
  transport: TransportOption | null;
  attractions: Poi[];
  meals: Poi[];
  style: TravelStyleKey;
};

export type CostLine = {
  key: "transport" | "stay" | "food" | "activities" | "localTransport" | "misc";
  label: string;
  amount: Sourced<number>;
  detail: string;
};

export type CostBreakdown = {
  lines: CostLine[];
  total: number;
  budget: number;
  remaining: number;
  withinBudget: boolean;
  currency: "INR";
};

export type PlanContext = {
  destination: string;
  travellers: number;
  nights: number;
  days: number;
  budget: number;
};

export function costPlan(
  selection: PlanSelection,
  ctx: PlanContext
): CostBreakdown {
  const lines: CostLine[] = [];

  // Transport (round trip: the fare model already covers a return cab; other
  // modes are one-way, so double them).
  if (selection.transport) {
    const oneWay = selection.transport.fare;
    const isCab = selection.transport.mode === "cab";
    const amount = isCab ? oneWay.value : oneWay.value * 2;

    lines.push({
      key: "transport",
      label: "Transportation",
      amount: computed(amount, [oneWay],
        isCab ? "Outstation cab round trip" : `${selection.transport.mode} return fare`),
      detail: isCab
        ? `${selection.transport.mode} (round trip included in fare)`
        : `${selection.transport.mode} x2 (outbound + return)`,
    });
  }

  // Stay
  if (selection.stay && ctx.nights > 0) {
    const perNight = estimateStayPerNight(selection.stay, selection.style, ctx.destination);
    const rooms = Math.ceil(ctx.travellers / 2);
    const total = perNight.value * ctx.nights * rooms;

    lines.push({
      key: "stay",
      label: "Hotel",
      amount: computed(total, [perNight],
        `₹${perNight.value}/night x ${ctx.nights} nights x ${rooms} room(s)`),
      detail: `${selection.stay.name} - ₹${perNight.value}/night x ${ctx.nights} nights x ${rooms} room(s)`,
    });
  }

  // Food: three meals a day per traveller, priced off the selected eateries.
  if (selection.meals.length) {
    const perMeal = selection.meals.map((m) =>
      estimateMealPerPerson(m, selection.style, ctx.destination)
    );
    const avg = Math.round(
      perMeal.reduce((s, m) => s + m.value, 0) / perMeal.length
    );
    const total = avg * 3 * ctx.days * ctx.travellers;

    lines.push({
      key: "food",
      label: "Food",
      amount: computed(total, perMeal,
        `₹${avg}/meal x 3 meals x ${ctx.days} days x ${ctx.travellers} travellers`),
      detail: `Average ₹${avg}/person/meal across ${selection.meals.length} researched eateries`,
    });
  }

  // Activities
  if (selection.attractions.length) {
    const fees = selection.attractions.map(estimateEntryFee);
    const total = fees.reduce((s, f) => s + f.value, 0) * ctx.travellers;

    lines.push({
      key: "activities",
      label: "Activities",
      amount: computed(total, fees,
        `Entry fees for ${selection.attractions.length} sites x ${ctx.travellers} travellers`),
      detail: `${selection.attractions.length} attractions`,
    });
  }

  // Local transport
  const localPerDay = estimateLocalTransportPerDay(ctx.destination, selection.style);
  const localTotal = localPerDay.value * ctx.days * ctx.travellers;
  lines.push({
    key: "localTransport",
    label: "Local transport",
    amount: computed(localTotal, [localPerDay],
      `₹${localPerDay.value}/person/day x ${ctx.days} days x ${ctx.travellers}`),
    detail: `Autos, taxis and local transfers`,
  });

  const subtotal = lines.reduce((s, l) => s + l.amount.value, 0);
  const misc = estimateMiscellaneous(subtotal);
  lines.push({
    key: "misc",
    label: "Miscellaneous",
    amount: misc,
    detail: "Tips, parking, small purchases and contingency",
  });

  const total = lines.reduce((s, l) => s + l.amount.value, 0);

  return {
    lines,
    total,
    budget: ctx.budget,
    remaining: ctx.budget - total,
    withinBudget: total <= ctx.budget,
    currency: "INR",
  };
}

export type Downgrade = {
  step: string;
  savedApprox: number;
};

export type FitResult = {
  selection: PlanSelection;
  breakdown: CostBreakdown;
  downgrades: Downgrade[];
  /** True when even the cheapest available plan exceeds the budget. */
  impossible: boolean;
  shortfall: number;
};

const CHEAPER_STYLE: Record<TravelStyleKey, TravelStyleKey | null> = {
  LUXURY: "MID_RANGE",
  MID_RANGE: "BUDGET",
  BUDGET: null,
};

/** Cheapest-first ordering of accommodation kinds. */
const STAY_RANK: Record<string, number> = {
  hostel: 0, guest_house: 1, motel: 2, hotel: 3, apartment: 4, chalet: 5,
};

/**
 * Fit the plan inside the budget by applying real substitutions, recosting
 * after each. Returns `impossible` when nothing further can be cut.
 */
export function fitToBudget(
  initial: PlanSelection,
  ctx: PlanContext,
  pools: { stays: Poi[]; food: Poi[]; attractions: Poi[]; transport: TransportOption[] }
): FitResult {
  let selection: PlanSelection = { ...initial };
  let breakdown = costPlan(selection, ctx);
  const downgrades: Downgrade[] = [];

  const attempt = (label: string, next: PlanSelection) => {
    const candidate = costPlan(next, ctx);
    if (candidate.total < breakdown.total) {
      downgrades.push({ step: label, savedApprox: breakdown.total - candidate.total });
      selection = next;
      breakdown = candidate;
      return true;
    }
    return false;
  };

  // 1. Cheapest viable intercity transport.
  if (!breakdown.withinBudget && pools.transport.length > 1) {
    const cheapest = [...pools.transport].sort((a, b) => a.fare.value - b.fare.value)[0];
    if (cheapest && cheapest.mode !== selection.transport?.mode) {
      attempt(
        `Switched intercity travel to ${cheapest.mode} (cheapest researched option)`,
        { ...selection, transport: cheapest }
      );
    }
  }

  // 2. Drop the travel style a notch (cheaper hotels and restaurants).
  while (!breakdown.withinBudget) {
    const cheaper = CHEAPER_STYLE[selection.style];
    if (!cheaper) break;
    if (!attempt(`Reduced travel style to ${cheaper}`, { ...selection, style: cheaper })) break;
  }

  // 3. Cheaper accommodation kind.
  if (!breakdown.withinBudget && pools.stays.length) {
    const cheaperStays = [...pools.stays].sort(
      (a, b) => (STAY_RANK[a.kind] ?? 9) - (STAY_RANK[b.kind] ?? 9)
    );
    for (const stay of cheaperStays) {
      if (breakdown.withinBudget) break;
      if (stay.id === selection.stay?.id) continue;
      attempt(`Moved to cheaper accommodation: ${stay.name}`, { ...selection, stay });
    }
  }

  // 4. Prefer free-entry attractions, dropping the priciest paid ones.
  while (!breakdown.withinBudget && selection.attractions.length > ctx.days) {
    const withFees = selection.attractions
      .map((a) => ({ a, fee: estimateEntryFee(a).value }))
      .sort((x, y) => y.fee - x.fee);

    const priciest = withFees[0];
    if (!priciest || priciest.fee === 0) break;

    const replacement = pools.attractions.find(
      (p) =>
        !selection.attractions.some((s) => s.id === p.id) &&
        estimateEntryFee(p).value === 0
    );

    const next = replacement
      ? selection.attractions.map((a) => (a.id === priciest.a.id ? replacement : a))
      : selection.attractions.filter((a) => a.id !== priciest.a.id);

    if (
      !attempt(
        replacement
          ? `Swapped ${priciest.a.name} (₹${priciest.fee}) for free-entry ${replacement.name}`
          : `Removed paid attraction ${priciest.a.name} (₹${priciest.fee})`,
        { ...selection, attractions: next }
      )
    ) {
      break;
    }
  }

  // 5. Cheaper eateries.
  if (!breakdown.withinBudget && pools.food.length) {
    const cheapFood = pools.food
      .filter((f) => f.kind !== "restaurant")
      .slice(0, Math.max(3, selection.meals.length));
    if (cheapFood.length) {
      attempt("Switched to cafes and street food over sit-down restaurants", {
        ...selection,
        meals: cheapFood,
      });
    }
  }

  return {
    selection,
    breakdown,
    downgrades,
    impossible: !breakdown.withinBudget,
    shortfall: Math.max(0, breakdown.total - ctx.budget),
  };
}
