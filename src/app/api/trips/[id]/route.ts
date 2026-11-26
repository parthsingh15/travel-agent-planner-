import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireVerifiedAuth } from "@/lib/auth";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";
import { updateTripSchema } from "@/lib/validators";
import { AuditAction } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const session = await requireVerifiedAuth();
    const { id } = await params;

    const trip = await prisma.trip.findFirst({
      where: { id, userId: session.id },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
        },
        generations: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        savedItineraries: {
          where: { userId: session.id },
          include: { version: true },
        },
      },
    });

    if (!trip) {
      return apiError("Trip not found", 404);
    }

    return apiSuccess({ trip });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const session = await requireVerifiedAuth();
    const { id } = await params;
    const body = await request.json();
    const data = updateTripSchema.parse(body);

    const existing = await prisma.trip.findFirst({
      where: { id, userId: session.id },
    });

    if (!existing) {
      return apiError("Trip not found", 404);
    }

    const trip = await prisma.trip.update({
      where: { id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.destination && { destination: data.destination }),
        ...(data.origin !== undefined && { origin: data.origin }),
        ...(data.startDate && { startDate: new Date(data.startDate) }),
        ...(data.endDate && { endDate: new Date(data.endDate) }),
        ...(data.budget !== undefined && { budget: data.budget }),
        ...(data.currency && { currency: data.currency }),
        ...(data.travelers !== undefined && { travelers: data.travelers }),
        ...(data.interests && { interests: data.interests }),
        ...(data.travelStyle && { travelStyle: data.travelStyle }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    });

    await createAuditLog({
      userId: session.id,
      action: AuditAction.TRIP_UPDATED,
      entity: "Trip",
      entityId: trip.id,
      ipAddress: getClientIp(request),
    });

    return apiSuccess({ trip });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const session = await requireVerifiedAuth();
    const { id } = await params;

    const existing = await prisma.trip.findFirst({
      where: { id, userId: session.id },
    });

    if (!existing) {
      return apiError("Trip not found", 404);
    }

    await prisma.trip.delete({ where: { id } });

    await createAuditLog({
      userId: session.id,
      action: AuditAction.TRIP_DELETED,
      entity: "Trip",
      entityId: id,
      ipAddress: getClientIp(request),
    });

    return apiSuccess({ message: "Trip deleted" });
  } catch (error) {
    return handleApiError(error);
  }
}
