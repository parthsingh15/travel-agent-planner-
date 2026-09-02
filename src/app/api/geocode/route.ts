import { NextRequest } from "next/server";
import { z } from "zod";
import { requireVerifiedAuth } from "@/lib/auth";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";
import { geocodeDestination } from "@/lib/services/geocode";

const querySchema = z.object({
  destination: z.string().min(2).max(200),
});

export async function GET(request: NextRequest) {
  try {
    await requireVerifiedAuth();
    const { searchParams } = new URL(request.url);
    const { destination } = querySchema.parse({
      destination: searchParams.get("destination") ?? undefined,
    });

    const location = await geocodeDestination(destination);
    if (!location) {
      return apiError(`Could not find a location matching "${destination}"`, 404);
    }

    return apiSuccess({ location });
  } catch (error) {
    return handleApiError(error);
  }
}
