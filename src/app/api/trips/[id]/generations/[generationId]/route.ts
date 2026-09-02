import { prisma } from "@/lib/db";
import { requireVerifiedAuth } from "@/lib/auth";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";

type Params = { params: Promise<{ id: string; generationId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const session = await requireVerifiedAuth();
    const { id, generationId } = await params;

    const generation = await prisma.itineraryGeneration.findFirst({
      where: {
        id: generationId,
        tripId: id,
        trip: { userId: session.id },
      },
      include: {
        versions: true,
        trip: {
          select: {
            id: true,
            title: true,
            destination: true,
            budget: true,
            currency: true,
          },
        },
      },
    });

    if (!generation) {
      return apiError("Generation not found", 404);
    }

    return apiSuccess({ generation });
  } catch (error) {
    return handleApiError(error);
  }
}
