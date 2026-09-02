import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireVerifiedAuth } from "@/lib/auth";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";
import { getDestinationWeather } from "@/lib/services/weather";

const querySchema = z
  .object({
    tripId: z.string().optional(),
    destination: z.string().min(2).max(200).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((v) => v.tripId || (v.destination && v.startDate && v.endDate), {
    message: "Provide either tripId, or destination with startDate and endDate",
  });

export async function GET(request: NextRequest) {
  try {
    const session = await requireVerifiedAuth();
    const { searchParams } = new URL(request.url);

    const query = querySchema.parse({
      tripId: searchParams.get("tripId") ?? undefined,
      destination: searchParams.get("destination") ?? undefined,
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
    });

    let destination = query.destination;
    let startDate = query.startDate;
    let endDate = query.endDate;

    if (query.tripId) {
      const trip = await prisma.trip.findFirst({
        where: { id: query.tripId, userId: session.id },
        select: { destination: true, startDate: true, endDate: true },
      });
      if (!trip) return apiError("Trip not found", 404);

      destination = trip.destination;
      startDate = trip.startDate.toISOString().split("T")[0];
      endDate = trip.endDate.toISOString().split("T")[0];
    }

    const weather = await getDestinationWeather(
      destination!,
      startDate!,
      endDate!
    );

    if (!weather) {
      return apiError(
        "Weather is unavailable for this destination right now",
        503
      );
    }

    return apiSuccess({ weather });
  } catch (error) {
    return handleApiError(error);
  }
}
