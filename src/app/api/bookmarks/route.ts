import { NextRequest } from "next/server";
import { Prisma, AuditAction, BookmarkType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireVerifiedAuth } from "@/lib/auth";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";
import { createBookmarkSchema } from "@/lib/validators";

export async function GET(request: NextRequest) {
  try {
    const session = await requireVerifiedAuth();
    const { searchParams } = new URL(request.url);

    const type = searchParams.get("type");
    const tripId = searchParams.get("tripId");

    const bookmarks = await prisma.bookmark.findMany({
      where: {
        userId: session.id,
        ...(type && Object.values(BookmarkType).includes(type as BookmarkType)
          ? { type: type as BookmarkType }
          : {}),
        ...(tripId ? { tripId } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        trip: { select: { id: true, title: true, destination: true } },
        version: { select: { id: true, versionNumber: true, title: true } },
      },
    });

    return apiSuccess({ bookmarks });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireVerifiedAuth();
    const body = await request.json();
    const data = createBookmarkSchema.parse(body);

    // Only ever bookmark records the caller actually owns.
    if (data.tripId) {
      const trip = await prisma.trip.findFirst({
        where: { id: data.tripId, userId: session.id },
        select: { id: true },
      });
      if (!trip) return apiError("Trip not found", 404);
    }

    if (data.versionId) {
      const version = await prisma.itineraryVersion.findFirst({
        where: { id: data.versionId, trip: { userId: session.id } },
        select: { id: true },
      });
      if (!version) return apiError("Itinerary version not found", 404);
    }

    // Re-saving the same item is idempotent rather than an error.
    if (data.externalId) {
      const existing = await prisma.bookmark.findUnique({
        where: {
          userId_type_externalId: {
            userId: session.id,
            type: data.type,
            externalId: data.externalId,
          },
        },
      });

      if (existing) {
        return apiSuccess({ bookmark: existing, alreadySaved: true });
      }
    }

    const bookmark = await prisma.bookmark.create({
      data: {
        userId: session.id,
        tripId: data.tripId,
        versionId: data.versionId,
        type: data.type,
        title: data.title,
        subtitle: data.subtitle,
        externalId: data.externalId,
        price: data.price,
        currency: data.currency,
        notes: data.notes,
        payload: data.payload as Prisma.InputJsonValue | undefined,
      },
    });

    await createAuditLog({
      userId: session.id,
      action: AuditAction.BOOKMARK_CREATED,
      entity: "Bookmark",
      entityId: bookmark.id,
      details: { type: data.type, title: data.title },
      ipAddress: getClientIp(request),
    });

    return apiSuccess({ bookmark, alreadySaved: false }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
