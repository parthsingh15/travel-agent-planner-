import { NextRequest } from "next/server";
import { requireVerifiedAuth } from "@/lib/auth";
import { apiError, apiSuccess, handleApiError } from "@/lib/api-response";
import { hotelSearchSchema } from "@/lib/validators";
import { QuoteError, signQuote, searchHotels } from "@/lib/services/live-quotes";

export async function GET(request: NextRequest) {
  try {
    const user = await requireVerifiedAuth();
    const { searchParams } = new URL(request.url);

    const query = hotelSearchSchema.parse(
      Object.fromEntries(
        [
          "destination",
          "checkIn",
          "checkOut",
          "guests",
          "rooms",
          "currency",
          "maxPrice",
          "minRating",
        ]
          .map((key) => [key, searchParams.get(key) ?? undefined])
          .filter(([, value]) => value !== undefined)
      )
    );

    const offers = await searchHotels(query);
    return apiSuccess({
      offers: await Promise.all(offers.map(async (quote) => ({
        ...quote, token: await signQuote(quote, user.id, "quote"), bookable: true,
      }))),
    });
  } catch (error) {
    if (error instanceof QuoteError) return apiError(error.message, error.status);
    return handleApiError(error);
  }
}
