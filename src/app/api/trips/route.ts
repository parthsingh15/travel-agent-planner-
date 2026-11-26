import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireVerifiedAuth } from "@/lib/auth";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { createTripSchema } from "@/lib/validators";
import { AuditAction } from "@prisma/client";

export async function GET() {
  try {
    const session = await requireVerifiedAuth();

    const trips = await prisma.trip.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      include: {
        savedItineraries: {
          where: { userId: session.id },
          select: { id: true, name: true, versionId: true },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: { versions: true, generations: true },
        },
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          select: {
            id: true,
            versionNumber: true,
            title: true,
            createdAt: true,
          },
        },
      },
    });

    return apiSuccess({ trips });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireVerifiedAuth();
    const body = await request.json();
    const data = createTripSchema.parse(body);

    const trip = await prisma.trip.create({
      data: {
        userId: session.id,
        title: data.title,
        destination: data.destination,
        origin: data.origin,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        budget: data.budget,
        currency: data.currency,
        travelers: data.travelers,
        interests: data.interests,
        travelStyle: data.travelStyle,
        notes: data.notes,
      },
    });

    await createAuditLog({
      userId: session.id,
      action: AuditAction.TRIP_CREATED,
      entity: "Trip",
      entityId: trip.id,
      ipAddress: getClientIp(request),
    });

    return apiSuccess({ trip }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
