import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireVerifiedAuth } from "@/lib/auth";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const session = await requireVerifiedAuth();
    const { id } = await params;

    const booking = await prisma.booking.findFirst({
      where: { id, userId: session.id },
      include: { trip: true },
    });

    if (!booking) return apiError("Booking not found", 404);
    return apiSuccess({ booking });
  } catch (error) {
    return handleApiError(error);
  }
}

export function PATCH() {
  return apiError("This feature has been retired. Open My Trips to plan an itinerary.", 410);
}

export function DELETE() {
  return apiError("This feature has been retired. Open My Trips to plan an itinerary.", 410);
}
