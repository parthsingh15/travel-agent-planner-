import { NextRequest } from "next/server";
import { requireVerifiedAuth } from "@/lib/auth";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { hotelSearchSchema } from "@/lib/validators";
import { getInventoryProvider } from "@/lib/services/travel-inventory";

export async function GET(request: NextRequest) {
  try {
    await requireVerifiedAuth();
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

    const provider = getInventoryProvider();
    const offers = await provider.searchHotels(query);

    return apiSuccess({
      offers,
      meta: {
        count: offers.length,
        provider: provider.name,
        live: provider.live,
        cheapestPrice: offers[0]?.comparison.cheapestPrice ?? null,
        query,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
