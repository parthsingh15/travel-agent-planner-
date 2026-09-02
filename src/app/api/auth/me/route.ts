import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return apiError("Unauthorized", 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        profile: true,
        createdAt: true,
        _count: {
          select: {
            trips: true,
            savedItineraries: true,
            payments: true,
          },
        },
      },
    });

    if (!user) {
      return apiError("User not found", 404);
    }

    return apiSuccess({ user });
  } catch (error) {
    return handleApiError(error);
  }
}
