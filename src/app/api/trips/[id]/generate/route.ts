import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireVerifiedAuth } from "@/lib/auth";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";
import { startItineraryGeneration } from "@/lib/agents/orchestrator";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const session = await requireVerifiedAuth();
    const { id } = await params;

    const result = await startItineraryGeneration(id, session.id);

    return apiSuccess(
      {
        message: result.alreadyRunning
          ? "Generation already in progress"
          : "Multi-agent itinerary generation started",
        generationId: result.generationId,
        mock: result.mock,
        alreadyRunning: result.alreadyRunning,
      },
      result.alreadyRunning ? 200 : 202
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const session = await requireVerifiedAuth();
    const { id } = await params;

    const trip = await prisma.trip.findFirst({
      where: { id, userId: session.id },
    });

    if (!trip) {
      return apiError("Trip not found", 404);
    }

    const generations = await prisma.itineraryGeneration.findMany({
      where: { tripId: id },
      orderBy: { createdAt: "desc" },
      include: {
        versions: {
          select: { id: true, versionNumber: true, title: true },
        },
      },
    });

    return apiSuccess({ generations });
  } catch (error) {
    return handleApiError(error);
  }
}
