import { prisma } from "@/lib/db";
import { GenerationStatus, TripStatus } from "@prisma/client";
import { runResearchPipeline } from "./research-pipeline";

/**
 * Itinerary generation entry point.
 *
 * Generation is research-first: real places from OpenStreetMap, real distances
 * from OSRM, costs from a documented model where no live price exists, and a
 * verification pass that must approve the plan before it is saved.
 *
 * There is deliberately no mock/placeholder path. Previously, a missing
 * OPENAI_API_KEY silently produced filler content ("Morning activity",
 * "Coordinated by supervisor"). The research pipeline needs no LLM key, so a
 * generation either produces real researched output or fails loudly.
 */
export async function startItineraryGeneration(tripId: string, userId: string) {
  const trip = await prisma.trip.findFirst({ where: { id: tripId, userId } });
  if (!trip) throw new Error("NOT_FOUND");

  const existing = await prisma.itineraryGeneration.findFirst({
    where: { tripId, status: GenerationStatus.IN_PROGRESS },
  });
  if (existing) return { generationId: existing.id, alreadyRunning: true };

  const generation = await prisma.$transaction(async (tx) => {
    const gen = await tx.itineraryGeneration.create({
      data: {
        tripId,
        status: GenerationStatus.IN_PROGRESS,
        currentAgent: "research",
      },
    });
    await tx.trip.update({
      where: { id: tripId },
      data: { status: TripStatus.PLANNING },
    });
    return gen;
  });

  // Fire-and-forget: the client polls the generation record for progress.
  runResearchPipeline(generation.id, tripId, userId).catch((err) => {
    console.error("[generation] pipeline failed:", err);
  });

  return { generationId: generation.id, mock: false, alreadyRunning: false };
}

export { runResearchPipeline };
