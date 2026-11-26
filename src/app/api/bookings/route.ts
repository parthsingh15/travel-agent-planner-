import { prisma } from "@/lib/db";
import { requireVerifiedAuth } from "@/lib/auth";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";

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

export function POST() {
  return apiError("This feature has been retired. Open My Trips to plan an itinerary.", 410);
}
