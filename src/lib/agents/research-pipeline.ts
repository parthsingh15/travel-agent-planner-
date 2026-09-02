/**
 * The generation pipeline the app actually runs.
 *
 * Replaces the old flow in two ways that matter:
 *   1. Nothing is invented. Places, distances and durations come from
 *      OpenStreetMap and OSRM; costs come from a documented model and are
 *      labelled VERIFIED or ESTIMATED individually.
 *   2. The budget is a hard constraint applied before the itinerary is built,
 *      not a number reported afterwards.
 *
 * Each stage writes its output to ItineraryGeneration so the pipeline UI can
 * show real progress, and the verification report gates the save.
 */
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { AuditAction, GenerationStatus, TripStatus, Prisma } from "@prisma/client";
import { planTrip, type PlanTripResult } from "@/lib/planner";

async function setAgent(generationId: string, agent: string) {
  await prisma.itineraryGeneration.update({
    where: { id: generationId },
    data: { currentAgent: agent },
  });
}

const asJson = (v: unknown) => v as Prisma.InputJsonValue;

/** Shape persisted to ItineraryVersion.dayByDay and rendered by the UI. */
export type StoredDay = PlanTripResult["days"][number];

export async function runResearchPipeline(
  generationId: string,
  tripId: string,
  userId: string
) {
  const trip = await prisma.trip.findFirst({ where: { id: tripId, userId } });
  if (!trip) throw new Error("NOT_FOUND");

  try {
    // ── Research ───────────────────────────────────────────────────────────
    await setAgent(generationId, "research");

    const result = await planTrip({
      destination: trip.destination,
      origin: trip.origin,
      startDate: trip.startDate.toISOString().split("T")[0],
      endDate: trip.endDate.toISOString().split("T")[0],
      travellers: trip.travelers,
      budget: trip.budget,
      travelStyle: trip.travelStyle,
      interests: trip.interests,
    });

    if (!result.ok) {
      throw new Error(result.reason);
    }

    const plan = result.plan;

    // Persist each agent's real output so the pipeline view reflects the work.
    await prisma.itineraryGeneration.update({
      where: { id: generationId },
      data: {
        destinationResearch: asJson({
          destination: plan.destination,
          staysFound: plan.research.staysFound,
          restaurantsFound: plan.research.foodFound,
          attractionsFound: plan.research.attractionsFound,
          warnings: plan.research.warnings,
          sources: plan.sources,
        }),
      },
    });

    await setAgent(generationId, "stays");
    await prisma.itineraryGeneration.update({
      where: { id: generationId },
      data: {
        staysOutput: asJson({
          selected: plan.selection.stayName,
          candidatesConsidered: plan.research.staysFound,
        }),
      },
    });

    await setAgent(generationId, "activities");
    await prisma.itineraryGeneration.update({
      where: { id: generationId },
      data: {
        activitiesOutput: asJson({ selected: plan.selection.attractionNames }),
      },
    });

    await setAgent(generationId, "food");
    await prisma.itineraryGeneration.update({
      where: { id: generationId },
      data: {
        foodOutput: asJson({ selected: plan.selection.restaurantNames }),
      },
    });

    await setAgent(generationId, "transportation");
    await prisma.itineraryGeneration.update({
      where: { id: generationId },
      data: {
        transportationOutput: asJson({ mode: plan.selection.transportMode }),
      },
    });

    // ── Budget ─────────────────────────────────────────────────────────────
    await setAgent(generationId, "budget");
    await prisma.itineraryGeneration.update({
      where: { id: generationId },
      data: {
        budgetOutput: asJson({
          lines: plan.breakdown.lines,
          total: plan.breakdown.total,
          budget: plan.breakdown.budget,
          remaining: plan.breakdown.remaining,
          withinBudget: plan.breakdown.withinBudget,
          currency: plan.breakdown.currency,
          downgrades: plan.downgrades,
          shortfall: plan.budgetShortfall,
        }),
      },
    });

    // ── Itinerary ──────────────────────────────────────────────────────────
    await setAgent(generationId, "itinerary");
    await prisma.itineraryGeneration.update({
      where: { id: generationId },
      data: { itineraryOutput: asJson({ days: plan.days }) },
    });

    // ── Verification gates the save ────────────────────────────────────────
    await setAgent(generationId, "verification");
    await prisma.itineraryGeneration.update({
      where: { id: generationId },
      data: {
        validationOutput: asJson({
          ...plan.verification,
          aiReview: plan.ai?.review ?? null,
        }),
      },
    });

    if (!plan.verification.approved) {
      const errors = plan.verification.issues
        .filter((i) => i.severity === "error")
        .map((i) => i.message)
        .join("; ");
      throw new Error(`Itinerary failed verification: ${errors}`);
    }

    return await finalise(generationId, tripId, userId, plan);
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
    throw error;
  }
}

async function finalise(
  generationId: string,
  tripId: string,
  userId: string,
  plan: PlanTripResult
) {
  const last = await prisma.itineraryVersion.findFirst({
    where: { tripId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  const versionNumber = (last?.versionNumber ?? 0) + 1;

  const result = await prisma.$transaction(async (tx) => {
    await tx.itineraryGeneration.update({
      where: { id: generationId },
      data: {
        status: GenerationStatus.COMPLETED,
        currentAgent: "verification",
        completedAt: new Date(),
        orchestratorNotes:
          `Researched plan v${versionNumber} — ` +
          `${plan.research.attractionsFound} attractions, ${plan.research.staysFound} stays and ` +
          `${plan.research.foodFound} eateries found via OpenStreetMap; ` +
          `verification score ${plan.verification.score}/100` +
          (plan.ai ? `; reasoning via ${plan.ai.provider}/${plan.ai.model}` : "; no AI provider configured") +
          (plan.downgrades.length ? `; ${plan.downgrades.length} budget downgrade(s) applied` : ""),
      },
    });

    const version = await tx.itineraryVersion.create({
      data: {
        tripId,
        generationId,
        versionNumber,
        title: `${plan.days.length} days in ${plan.destination}`,
        summary:
          `${plan.selection.attractionNames.length} researched sights, ` +
          `staying at ${plan.selection.stayName ?? "a researched property"}. ` +
          `Total ₹${plan.breakdown.total.toLocaleString("en-IN")} of a ` +
          `₹${plan.breakdown.budget.toLocaleString("en-IN")} budget.`,
        dayByDay: asJson(plan.days),
        totalBudget: plan.breakdown.total,
        metadata: asJson({
          breakdown: plan.breakdown,
          downgrades: plan.downgrades,
          verification: plan.verification,
          sources: plan.sources,
          research: plan.research,
          selection: plan.selection,
          budgetShortfall: plan.budgetShortfall,
          ai: plan.ai,
        }),
      },
    });

    await tx.trip.update({
      where: { id: tripId },
      data: { status: TripStatus.PLANNED },
    });

    return version;
  });

  await createAuditLog({
    userId,
    action: AuditAction.ITINERARY_GENERATED,
    entity: "Trip",
    entityId: tripId,
    details: {
      generationId,
      versionNumber,
      versionId: result.id,
      total: plan.breakdown.total,
      verificationScore: plan.verification.score,
    },
  });

  return result;
}
