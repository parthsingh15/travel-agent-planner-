import { prisma } from "@/lib/db";
import { GenerationStatus, TripStatus } from "@prisma/client";
import { advanceGeneration, STAGES, STAGE_LABELS } from "./stages";

/**
 * Itinerary generation entry point.
 *
 * Generation is research-first (real places from OpenStreetMap, real distances
 * from OSRM, costs from a documented model) and runs as a resumable stage
 * machine: each request advances one stage. That keeps every request short
 * enough for serverless hosting and lets an interrupted run resume rather than
 * restart. See `stages.ts`.
 *
 * There is deliberately no mock path — a generation either produces real
 * researched output or fails loudly.
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
        currentAgent: STAGE_LABELS[STAGES[0]],
      },
    });
    await tx.trip.update({
      where: { id: tripId },
      data: { status: TripStatus.PLANNING },
    });
    return gen;
  });

  // Run the first (fast) stage inline so the client sees immediate progress;
  // the rest advance as the client polls.
  await advanceGeneration(generation.id, tripId, userId);

  return { generationId: generation.id, mock: false, alreadyRunning: false };
}

export { advanceGeneration };
