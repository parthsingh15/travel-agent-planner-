/**
 * Resumable generation pipeline.
 *
 * Serverless functions are killed as soon as they respond, so the previous
 * fire-and-forget pipeline could not survive on Vercel: the request returned
 * 202 and the work died mid-run. Research also takes ~55s, over a typical
 * 60s function ceiling.
 *
 * Generation is therefore split into small stages. Each request advances
 * exactly one stage, persists its output, and returns. The client polls, so the
 * pipeline walks forward one step per poll and no single request runs long.
 * This also makes generation crash-safe: an interrupted run resumes from the
 * last completed stage rather than starting over.
 */
import { prisma } from "@/lib/db";
import { GenerationStatus, Prisma, TripStatus, AuditAction } from "@prisma/client";
import { createAuditLog } from "@/lib/audit";
import { geocodePlace, type GeoPlace } from "@/lib/research/nominatim";
import { fetchPois, type Poi } from "@/lib/research/overpass";
import {
  routeBetween,
  realisticDuration,
  classifyRoad,
  isMountainous,
} from "@/lib/research/osrm";
import { estimateFare, feasibleModes } from "@/lib/research/cost-model";
import type { ResearchBundle, TransportOption } from "@/lib/research";
import { planFromResearch } from "@/lib/planner";

export const STAGES = [
  "research:locate",
  "research:stays",
  "research:food",
  "research:attractions:0",
  "research:attractions:1",
  "research:attractions:2",
  "research:route",
  "plan:build",
  "plan:enrich",
  "finalise",
] as const;

export type Stage = (typeof STAGES)[number];

/** Human labels for the pipeline UI. */
export const STAGE_LABELS: Record<Stage, string> = {
  "research:locate": "research",
  "research:stays": "stays",
  "research:food": "food",
  "research:attractions:0": "activities",
  "research:attractions:1": "activities",
  "research:attractions:2": "activities",
  "research:route": "transportation",
  "plan:build": "budget",
  "plan:enrich": "itinerary",
  finalise: "verification",
};

/** Keep the stored working set small; selection never needs the long tail. */
const KEEP = { stays: 60, food: 60, attractions: 90 };

type WorkingSet = {
  /** Next stage to run. Kept here so `currentAgent` can stay a UI label. */
  _stage?: Stage;
  destination?: GeoPlace;
  origin?: GeoPlace | null;
  mountainous?: boolean;
  stays?: Poi[];
  food?: Poi[];
  attractions?: Poi[];
  intercity?: ResearchBundle["intercity"];
  warnings?: string[];
};

const asJson = (v: unknown) => v as Prisma.InputJsonValue;

async function loadWorking(generationId: string): Promise<WorkingSet> {
  const gen = await prisma.itineraryGeneration.findUnique({
    where: { id: generationId },
    select: { destinationResearch: true },
  });
  return ((gen?.destinationResearch as WorkingSet | null) ?? {}) as WorkingSet;
}

async function saveWorking(
  generationId: string,
  patch: WorkingSet,
  nextStage: Stage | null,
  extra: Prisma.ItineraryGenerationUpdateInput = {}
) {
  const current = await loadWorking(generationId);
  await prisma.itineraryGeneration.update({
    where: { id: generationId },
    data: {
      destinationResearch: asJson({
        ...current,
        ...patch,
        ...(nextStage ? { _stage: nextStage } : {}),
      }),
      ...(nextStage ? { currentAgent: STAGE_LABELS[nextStage] } : {}),
      ...extra,
    },
  });
}

export type AdvanceResult = {
  status: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  stage: Stage | null;
  label: string | null;
  done: boolean;
  error?: string;
};

/**
 * Run exactly one stage of the pipeline and return. Safe to call repeatedly;
 * calling after completion is a no-op.
 */
export async function advanceGeneration(
  generationId: string,
  tripId: string,
  userId: string
): Promise<AdvanceResult> {
  const trip = await prisma.trip.findFirst({ where: { id: tripId, userId } });
  if (!trip) throw new Error("NOT_FOUND");

  const gen = await prisma.itineraryGeneration.findFirst({
    where: { id: generationId, tripId },
  });
  if (!gen) throw new Error("NOT_FOUND");

  if (gen.status === GenerationStatus.COMPLETED) {
    return { status: "COMPLETED", stage: null, label: null, done: true };
  }
  if (gen.status === GenerationStatus.FAILED) {
    return {
      status: "FAILED",
      stage: null,
      label: null,
      done: true,
      error: gen.errorMessage ?? "Generation failed",
    };
  }

  const working = await loadWorking(generationId);
  const stage = working._stage ?? STAGES[0];

  try {
    const next = await runStage(stage, generationId, trip);

    if (next === null) {
      return { status: "COMPLETED", stage: null, label: null, done: true };
    }

    return {
      status: "IN_PROGRESS",
      stage: next,
      label: STAGE_LABELS[next] ?? next,
      done: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await prisma.itineraryGeneration.update({
      where: { id: generationId },
      data: {
        status: GenerationStatus.FAILED,
        errorMessage: message,
        completedAt: new Date(),
      },
    });
    await prisma.trip.update({
      where: { id: tripId },
      data: { status: TripStatus.DRAFT },
    });
    return { status: "FAILED", stage, label: STAGE_LABELS[stage], done: true, error: message };
  }
}

type TripRow = Awaited<ReturnType<typeof prisma.trip.findFirst>>;

function toBundle(w: WorkingSet): ResearchBundle {
  return {
    origin: w.origin ?? null,
    destination: w.destination!,
    mountainous: Boolean(w.mountainous),
    intercity: w.intercity ?? null,
    stays: w.stays ?? [],
    food: w.food ?? [],
    attractions: w.attractions ?? [],
    sources: [],
    warnings: w.warnings ?? [],
  };
}

function toPlanInput(trip: NonNullable<TripRow>) {
  return {
    destination: trip.destination,
    origin: trip.origin,
    startDate: trip.startDate.toISOString().split("T")[0],
    endDate: trip.endDate.toISOString().split("T")[0],
    travellers: trip.travelers,
    budget: trip.budget,
    travelStyle: trip.travelStyle,
    interests: trip.interests,
  };
}

/** Execute one stage; returns the next stage, or null when finished. */
async function runStage(
  stage: Stage,
  generationId: string,
  trip: NonNullable<TripRow>
): Promise<Stage | null> {
  switch (stage) {
    case "research:locate": {
      const destination = await geocodePlace(trip.destination);
      if (!destination) {
        throw new Error(
          `Could not locate "${trip.destination}". Check the spelling, or try a nearby larger town.`
        );
      }
      const origin = trip.origin ? await geocodePlace(trip.origin) : null;
      const warnings: string[] = [];
      if (trip.origin && !origin) {
        warnings.push(
          `Could not locate the starting city "${trip.origin}". Travel to the destination is not costed.`
        );
      }

      await saveWorking(
        generationId,
        {
          destination,
          origin,
          mountainous:
            isMountainous(destination.state) || isMountainous(destination.displayName),
          warnings,
        },
        "research:stays"
      );
      return "research:stays";
    }

    case "research:stays": {
      const w = await loadWorking(generationId);
      const stays = await fetchPois("stay", w.destination!, 15000);
      await saveWorking(
        generationId,
        { stays: stays.slice(0, KEEP.stays) },
        "research:food",
        { staysOutput: asJson({ found: stays.length }) }
      );
      return "research:food";
    }

    case "research:food": {
      const w = await loadWorking(generationId);
      const food = await fetchPois("food", w.destination!, 15000);
      await saveWorking(
        generationId,
        { food: food.slice(0, KEEP.food) },
        "research:attractions:0",
        { foodOutput: asJson({ found: food.length }) }
      );
      return "research:attractions:0";
    }

    case "research:attractions:0":
    case "research:attractions:1":
    case "research:attractions:2": {
      const batch = Number(stage.split(":")[2]);
      const w = await loadWorking(generationId);

      const found = await fetchPois("attraction", w.destination!, 15000, batch);

      // Merge with earlier batches, de-duplicating by OSM element id.
      const merged = new Map((w.attractions ?? []).map((p) => [p.id, p]));
      for (const poi of found) merged.set(poi.id, poi);
      const attractions = [...merged.values()].slice(0, KEEP.attractions);

      const next: Stage =
        batch < 2 ? (`research:attractions:${batch + 1}` as Stage) : "research:route";

      await saveWorking(generationId, { attractions }, next, {
        activitiesOutput: asJson({ found: attractions.length }),
      });
      return next;
    }

    case "research:route": {
      const w = await loadWorking(generationId);
      let intercity: ResearchBundle["intercity"] = null;

      if (w.origin && w.destination) {
        const leg = await routeBetween(w.origin, w.destination);
        const kind = classifyRoad(leg.distanceKm.value, Boolean(w.mountainous));
        const realistic = realisticDuration(leg, kind);

        const options: TransportOption[] = feasibleModes(leg.distanceKm.value).map(
          (mode) => ({
            mode,
            distanceKm: leg.distanceKm,
            durationMin:
              mode === "flight"
                ? {
                    ...realistic,
                    value: Math.round(leg.distanceKm.value / 12 + 150),
                    note:
                      "Approximate gate-to-gate time including airport transfers and check-in. Not a live schedule.",
                  }
                : realistic,
            fare: estimateFare(mode, leg.distanceKm.value, trip.travelers),
          })
        );

        intercity = { leg, realisticDurationMin: realistic, options };
      }

      await saveWorking(generationId, { intercity }, "plan:build", {
        transportationOutput: asJson({ options: intercity?.options.length ?? 0 }),
      });
      return "plan:build";
    }

    case "plan:build": {
      // Selection, budget fitting and assembly. AI narrative is deferred to the
      // next stage so neither request approaches the function time limit.
      const w = await loadWorking(generationId);
      const plan = await planFromResearch(toBundle(w), toPlanInput(trip), {
        aiSelection: true,
        aiNarrative: false,
      });

      await prisma.itineraryGeneration.update({
        where: { id: generationId },
        data: {
          currentAgent: STAGE_LABELS["plan:enrich"],
          destinationResearch: asJson({ ...w, _stage: "plan:enrich" satisfies Stage }),
          budgetOutput: asJson({
            lines: plan.breakdown.lines,
            total: plan.breakdown.total,
            budget: plan.breakdown.budget,
            remaining: plan.breakdown.remaining,
            withinBudget: plan.breakdown.withinBudget,
            downgrades: plan.downgrades,
            shortfall: plan.budgetShortfall,
          }),
          itineraryOutput: asJson({ days: plan.days }),
          validationOutput: asJson(plan.verification),
          supervisorOutput: asJson({ ai: plan.ai, selection: plan.selection }),
        },
      });
      return "plan:enrich";
    }

    case "plan:enrich": {
      // AI day titles, research summary, budget advice and the Checker review.
      // Best-effort: a failure here must not lose an otherwise valid itinerary.
      const w = await loadWorking(generationId);
      try {
        const plan = await planFromResearch(toBundle(w), toPlanInput(trip), {
          aiSelection: false,
          aiNarrative: true,
        });

        await prisma.itineraryGeneration.update({
          where: { id: generationId },
          data: {
            itineraryOutput: asJson({ days: plan.days }),
            validationOutput: asJson({
              ...plan.verification,
              aiReview: plan.ai?.review ?? null,
            }),
            supervisorOutput: asJson({ ai: plan.ai, selection: plan.selection }),
          },
        });
      } catch (error) {
        console.error("[stages] plan:enrich failed, keeping the built plan:", error);
      }

      await saveWorking(generationId, {}, "finalise");
      return "finalise";
    }

    case "finalise": {
      await finalise(generationId, trip);
      return null;
    }
  }
}

async function finalise(generationId: string, trip: NonNullable<TripRow>) {
  const gen = await prisma.itineraryGeneration.findUnique({
    where: { id: generationId },
  });
  if (!gen) throw new Error("NOT_FOUND");

  const verification = gen.validationOutput as {
    approved?: boolean;
    score?: number;
    issues?: { severity: string; message: string }[];
  } | null;

  if (verification && verification.approved === false) {
    const errors = (verification.issues ?? [])
      .filter((i) => i.severity === "error")
      .map((i) => i.message)
      .join("; ");
    throw new Error(`Itinerary failed verification: ${errors}`);
  }

  const budget = gen.budgetOutput as {
    total?: number;
    budget?: number;
  } | null;
  const itinerary = gen.itineraryOutput as { days?: unknown[] } | null;
  const extras = gen.supervisorOutput as {
    ai?: unknown;
    selection?: {
      stayName?: string | null;
      attractionNames?: string[];
    };
  } | null;
  const research = gen.destinationResearch as WorkingSet | null;

  const last = await prisma.itineraryVersion.findFirst({
    where: { tripId: trip.id },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  const versionNumber = (last?.versionNumber ?? 0) + 1;
  const days = itinerary?.days ?? [];

  const version = await prisma.$transaction(async (tx) => {
    await tx.itineraryGeneration.update({
      where: { id: generationId },
      data: {
        status: GenerationStatus.COMPLETED,
        currentAgent: STAGE_LABELS.finalise,
        completedAt: new Date(),
        orchestratorNotes:
          `Researched plan v${versionNumber} — ` +
          `${research?.attractions?.length ?? 0} attractions, ${research?.stays?.length ?? 0} stays, ` +
          `${research?.food?.length ?? 0} eateries via OpenStreetMap; ` +
          `verification score ${verification?.score ?? "n/a"}/100`,
      },
    });

    const created = await tx.itineraryVersion.create({
      data: {
        tripId: trip.id,
        generationId,
        versionNumber,
        title: `${days.length} days in ${research?.destination?.name ?? trip.destination}`,
        summary:
          `${extras?.selection?.attractionNames?.length ?? 0} researched sights, ` +
          `staying at ${extras?.selection?.stayName ?? "a researched property"}. ` +
          `Total ₹${(budget?.total ?? 0).toLocaleString("en-IN")} of a ` +
          `₹${(budget?.budget ?? trip.budget).toLocaleString("en-IN")} budget.`,
        dayByDay: asJson(days),
        totalBudget: budget?.total ?? null,
        metadata: asJson({
          breakdown: gen.budgetOutput,
          verification: gen.validationOutput,
          ai: extras?.ai ?? null,
          selection: extras?.selection ?? null,
          research: {
            staysFound: research?.stays?.length ?? 0,
            foodFound: research?.food?.length ?? 0,
            attractionsFound: research?.attractions?.length ?? 0,
            warnings: research?.warnings ?? [],
          },
        }),
      },
    });

    await tx.trip.update({
      where: { id: trip.id },
      data: { status: TripStatus.PLANNED },
    });

    return created;
  });

  await createAuditLog({
    userId: trip.userId,
    action: AuditAction.ITINERARY_GENERATED,
    entity: "Trip",
    entityId: trip.id,
    details: { generationId, versionNumber, versionId: version.id },
  });

  return version;
}
