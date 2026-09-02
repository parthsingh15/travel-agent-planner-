import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireVerifiedAuth } from "@/lib/auth";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { createBooking } from "@/lib/booking-service";
import { createBookingSchema } from "@/lib/validators";

export async function GET() {
  try {
    const session = await requireVerifiedAuth();
    const bookings = await prisma.booking.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      include: {
        trip: { select: { id: true, title: true, destination: true } },
      },
    });
    return apiSuccess({ bookings });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireVerifiedAuth();
    const body = await request.json();
    const data = createBookingSchema.parse(body);

    const booking = await createBooking({
      userId: session.id,
      tripId: data.tripId,
      generationId: data.generationId,
      type: data.type,
      title: data.title,
      description: data.description,
      amount: data.amount,
      currency: data.currency,
      metadata: data.metadata,
    });

    return apiSuccess({ booking }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
