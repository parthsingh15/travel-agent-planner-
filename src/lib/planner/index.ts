/**
 * Research-first trip planning.
 *
 *   Research (real APIs) -> Select -> Budget-fit -> Assemble -> Verify
 *
 * No stage asks a model what exists or what things cost. Places come from
 * OpenStreetMap, distances from OSRM; the cost model turns those into figures
 * that are individually labelled VERIFIED or ESTIMATED.
 */
import { researchTrip, type ResearchBundle } from "@/lib/research";
import type { Poi } from "@/lib/research/overpass";
import { estimateEntryFee, type TravelStyleKey } from "@/lib/research/cost-model";
import type { SourceRef } from "@/lib/research/provenance";
import { assembleItinerary, type PlannedDay } from "./assemble";
import {
  costPlan,
  fitToBudget,
  type CostBreakdown,
  type Downgrade,
  type PlanSelection,
} from "./budget";
import { verifyItinerary, type VerificationReport } from "./verify";
import {
  aiSelectStay,
  aiSelectAttractions,
  aiSelectFood,
  aiChooseTransport,
  aiSummariseResearch,
  aiBudgetAdvice,
  aiDayTitles,
  aiReviewItinerary,
  type AgentContext,
  type AiReview,
} from "./ai-agents";
import { aiStatus } from "@/lib/ai";

export type PlanTripInput = {
  destination: string;
  origin?: string | null;
  startDate: string;
  endDate: string;
  travellers: number;
  budget: number;
  travelStyle: string;
  interests: string[];
};

export type PlanTripResult = {
  destination: string;
  days: PlannedDay[];
  breakdown: CostBreakdown;
  downgrades: Downgrade[];
  verification: VerificationReport;
  research: {
    staysFound: number;
    foodFound: number;
    attractionsFound: number;
    warnings: string[];
  };
  selection: {
    stayName: string | null;
    transportMode: string | null;
    attractionNames: string[];
    restaurantNames: string[];
  };
  sources: SourceRef[];
  /** Set when even the cheapest researched plan exceeds the budget. */
  budgetShortfall: number | null;
  /** Present when an AI provider is configured; null otherwise. */
  ai: {
    provider: string;
    model: string;
    researchSummary: string | null;
    budgetAdvice: string | null;
    review: AiReview | null;
    choiceReasons: Record<string, string>;
  } | null;
};

export type PlanFailure = { ok: false; reason: string };
export type PlanSuccess = { ok: true; plan: PlanTripResult };

const MS_PER_DAY = 86_400_000;

function dayCount(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((end - start) / MS_PER_DAY) + 1);
}

/** Map the app's TravelStyle enum onto the cost model's three tiers. */
function toStyleKey(travelStyle: string): TravelStyleKey {
  switch (travelStyle) {
    case "BUDGET":
      return "BUDGET";
    case "LUXURY":
									return "LUXURY";
    default:
      return "MID_RANGE";
  }
}

/** Interest keywords -> OSM kinds, used to bias attraction selection. */
const INTEREST_KINDS: Record<string, string[]> = {
  history: ["monument", "ruins", "castle", "fort", "archaeological_site", "museum", "memorial", "place_of_worship"],
  culture: ["museum", "gallery", "place_of_worship", "attraction", "monument"],
  food: [],
  nature: ["viewpoint", "peak", "waterfall", "nature_reserve", "park", "garden", "hot_spring"],
  adventure: ["peak", "viewpoint", "nature_reserve", "theme_park"],
  religion: ["place_of_worship"],
  shopping: ["attraction"],
  photography: ["viewpoint", "monument", "peak", "waterfall"],
  relaxation: ["park", "garden", "hot_spring", "viewpoint"],
};

function scoreForInterests(poi: Poi, interests: string[]): number {
  if (!interests.length) return 0;
  const wanted = new Set(
    interests.flatMap((i) => INTEREST_KINDS[i.toLowerCase()] ?? [])
  );
  return wanted.has(poi.kind) ? 5 : 0;
}

export async function planTrip(
  input: PlanTripInput
): Promise<PlanSuccess | PlanFailure> {
  const research: ResearchBundle | null = await researchTrip({
    destination: input.destination,
    origin: input.origin,
    travellers: input.travellers,
  });

  if (!research) {
    return {
      ok: false,
      reason:
        `Could not locate "${input.destination}". Check the spelling, or try a ` +
        `nearby larger town.`,
    };
  }

  if (!research.attractions.length && !research.stays.length) {
    return {
      ok: false,
      reason:
        `No mapped places were found near ${research.destination.name}, so a ` +
        `real itinerary cannot be built for it.`,
    };
  }

  return { ok: true, plan: await planFromResearch(research, input) };
}

/**
 * The planning half of the pipeline: selection, budget fitting, assembly and
 * verification over research that has already been gathered.
 *
 * Separated from `planTrip` so the resumable serverless pipeline can persist
 * the research phase and run this stage on its own.
 */
export type PlanPhases = {
  /** Run the AI selection calls (hotel, activities, food, transport). */
  aiSelection?: boolean;
  /** Run the AI narrative calls (day titles, summary, advice, review). */
  aiNarrative?: boolean;
};

export async function planFromResearch(
  research: ResearchBundle,
  input: PlanTripInput,
  phases: PlanPhases = { aiSelection: true, aiNarrative: true }
): Promise<PlanTripResult> {
  const days = dayCount(input.startDate, input.endDate);
  const nights = Math.max(0, days - 1);
  const style = toStyleKey(input.travelStyle);

  // ── Selection: real places only, biased by the user's interests ──────────
  // research.attractions arrives notability-ordered. Preserve that as a
  // tiebreak so an interest bias promotes relevant sights without burying the
  // landmarks a visitor actually goes for.
  const notabilityRank = new Map(
    research.attractions.map((p, i) => [p.id, research.attractions.length - i])
  );
  const attractionPool = [...research.attractions].sort((a, b) => {
    const byInterest =
      scoreForInterests(b, input.interests) - scoreForInterests(a, input.interests);
    if (byInterest !== 0) return byInterest;
    return (notabilityRank.get(b.id) ?? 0) - (notabilityRank.get(a.id) ?? 0);
  });

  // Aim for three sights a day, capped by what actually exists.
  const wantedAttractions = Math.min(attractionPool.length, days * 3);
  const chosenAttractions = attractionPool.slice(0, wantedAttractions);

  // Two eateries per day gives lunch/dinner variety without repeating.
  const chosenMeals = research.food.slice(0, Math.min(research.food.length, days * 2));

  const agentCtx: AgentContext = {
    destination: research.destination.name,
    origin: research.origin?.name ?? input.origin ?? null,
    days,
    travellers: input.travellers,
    budget: input.budget,
    currency: "INR",
    travelStyle: input.travelStyle,
    interests: input.interests,
  };

  const ai = aiStatus();
  const choiceReasons: Record<string, string> = {};

  // The AI may only pick among researched candidates; ids are validated and a
  // rejected or failed selection leaves the deterministic choice in place.
  let aiAttractions: Poi[] | null = null;
  let aiMeals: Poi[] | null = null;
  let aiStay: Poi | null = null;

  if (ai.configured && phases.aiSelection !== false) {
    const [picked, meals, stay] = await Promise.all([
      aiSelectAttractions(attractionPool, agentCtx, wantedAttractions),
      aiSelectFood(research.food, agentCtx, Math.min(research.food.length, days * 2)),
      aiSelectStay(research.stays, agentCtx),
    ]);

    if (picked) {
      aiAttractions = picked.pois;
      choiceReasons.activities = picked.reason;
    }
    if (meals) {
      aiMeals = meals.pois;
      choiceReasons.food = meals.reason;
    }
    if (stay) {
      aiStay = stay.poi;
      choiceReasons.stay = stay.reason;
    }
  }

  const startingStay = aiStay ?? research.stays[0] ?? null;
  const startingTransport = research.intercity?.options
    ? [...research.intercity.options].sort((a, b) => a.fare.value - b.fare.value)[
        Math.min(1, research.intercity.options.length - 1)
      ]
    : null;

  let transportChoice = startingTransport;
  if (ai.configured && phases.aiSelection !== false && research.intercity?.options?.length) {
    const chosen = await aiChooseTransport(research.intercity.options, agentCtx);
    if (chosen) {
      transportChoice = chosen.option;
      choiceReasons.transport = chosen.reason;
    }
  }

  const initial: PlanSelection = {
    stay: startingStay,
    transport: transportChoice,
    attractions: aiAttractions ?? chosenAttractions,
    meals: aiMeals ?? chosenMeals,
    style,
  };

  const ctx = {
    destination: research.destination.name,
    travellers: input.travellers,
    nights,
    days,
    budget: input.budget,
  };

  // ── Budget: hard constraint, with real substitutions when it overruns ────
  const fitted = fitToBudget(initial, ctx, {
    stays: research.stays,
    food: research.food,
    attractions: attractionPool,
    transport: research.intercity?.options ?? [],
  });

  // ── Assemble the day-by-day schedule ────────────────────────────────────
  const plannedDays = await assembleItinerary({
    research,
    selection: fitted.selection,
    startDate: input.startDate,
    days,
    travellers: input.travellers,
    style: fitted.selection.style,
    destinationName: research.destination.name,
  });

  // ── AI narrative and review, layered on top of the real schedule ───────
  let researchSummary: string | null = null;
  let budgetAdvice: string | null = null;
  let review: AiReview | null = null;

  if (ai.configured && phases.aiNarrative !== false) {
    const [titles, summary, advice, checked] = await Promise.all([
      aiDayTitles(plannedDays, agentCtx),
      aiSummariseResearch(
        agentCtx,
        {
          stays: research.stays.length,
          food: research.food.length,
          attractions: research.attractions.length,
        },
        attractionPool.slice(0, 12).map((a) => a.name)
      ),
      aiBudgetAdvice(fitted.breakdown, agentCtx),
      aiReviewItinerary(plannedDays, fitted.breakdown, agentCtx),
    ]);

    if (titles) {
      titles.forEach((t, i) => {
        if (plannedDays[i] && t.trim()) plannedDays[i].title = t.trim();
      });
    }
    researchSummary = summary;
    budgetAdvice = advice;
    review = checked;
  }

  // ── Verify before anything is persisted ─────────────────────────────────
  const verification = verifyItinerary(plannedDays, fitted.breakdown, {
    startDate: input.startDate,
    expectedDays: days,
    travellers: input.travellers,
  });

  const finalBreakdown = costPlan(fitted.selection, ctx);

  return {
      destination: research.destination.name,
      days: plannedDays,
      breakdown: finalBreakdown,
      downgrades: fitted.downgrades,
      verification,
      research: {
        staysFound: research.stays.length,
        foodFound: research.food.length,
        attractionsFound: research.attractions.length,
        warnings: research.warnings,
      },
      selection: {
        stayName: fitted.selection.stay?.name ?? null,
        transportMode: fitted.selection.transport?.mode ?? null,
        attractionNames: fitted.selection.attractions.map((a) => a.name),
        restaurantNames: fitted.selection.meals.map((m) => m.name),
      },
      sources: research.sources,
      budgetShortfall: fitted.impossible ? fitted.shortfall : null,
      ai: ai.configured
        ? {
            provider: ai.provider,
            model: ai.model,
            researchSummary,
            budgetAdvice,
            review,
            choiceReasons,
          }
        : null,
  };
}

export { estimateEntryFee };
