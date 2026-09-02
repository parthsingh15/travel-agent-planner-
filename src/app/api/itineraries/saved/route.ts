import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireVerifiedAuth } from "@/lib/auth";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";
import { saveItinerarySchema } from "@/lib/validators";
import { AuditAction } from "@prisma/client";

export async function GET() {
  try {
    const session = await requireVerifiedAuth();

    const saved = await prisma.savedItinerary.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      include: {
        trip: { select: { id: true, title: true, destination: true } },
        version: true,
      },
    });

    return apiSuccess({ savedItineraries: saved });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireVerifiedAuth();
    const body = await request.json();
    const data = saveItinerarySchema.parse(body);

    const version = await prisma.itineraryVersion.findUnique({
      where: { id: data.versionId },
      include: { trip: true },
    });

    if (!version || version.trip.userId !== session.id) {
      return apiError("Itinerary version not found", 404);
    }

    const saved = await prisma.savedItinerary.upsert({
      where: {
        userId_versionId: {
          userId: session.id,
          versionId: data.versionId,
        },
      },
      create: {
        userId: session.id,
        tripId: version.tripId,
        versionId: data.versionId,
        name: data.name,
      },
      update: { name: data.name },
      include: { version: true, trip: true },
    });

    await createAuditLog({
      userId: session.id,
      action: AuditAction.ITINERARY_SAVED,
      entity: "SavedItinerary",
      entityId: saved.id,
      ipAddress: getClientIp(request),
    });

    return apiSuccess({ savedItinerary: saved }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
