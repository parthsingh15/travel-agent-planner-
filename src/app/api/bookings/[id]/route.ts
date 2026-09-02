import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireVerifiedAuth } from "@/lib/auth";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";
import { advanceBookingWorkflow, cancelBooking } from "@/lib/booking-service";
import { advanceBookingSchema } from "@/lib/validators";
import { BookingWorkflowStep } from "@prisma/client";

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

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const session = await requireVerifiedAuth();
    const { id } = await params;
    const body = await request.json();
    const data = advanceBookingSchema.parse(body);

    const booking = await advanceBookingWorkflow(
      id,
      session.id,
      data.step as BookingWorkflowStep
    );

    return apiSuccess({ booking });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const session = await requireVerifiedAuth();
    const { id } = await params;

    const booking = await cancelBooking(id, session.id);
    return apiSuccess({ booking });
  } catch (error) {
    return handleApiError(error);
  }
}
