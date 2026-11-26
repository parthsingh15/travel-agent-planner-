import { NextRequest } from "next/server";
import { requireVerifiedAuth } from "@/lib/auth";
import { apiError, apiSuccess, handleApiError } from "@/lib/api-response";
import { flightSearchSchema } from "@/lib/validators";
import { QuoteError, signQuote, searchFlights, readQuote } from "@/lib/services/live-quotes";

export async function GET(request: NextRequest) {
  try {
    const user = await requireVerifiedAuth();
    const { searchParams } = new URL(request.url);

    const query = flightSearchSchema.parse(
      Object.fromEntries(
        [
          "origin",
          "destination",
          "departDate",
          "returnDate",
          "passengers",
          "cabinClass",
          "currency",
          "maxPrice",
        ]
          .map((key) => [key, searchParams.get(key) ?? undefined])
          .filter(([, value]) => value !== undefined)
      )
    );

    const selection = searchParams.get("outbound");
    const outbound = selection ? await readQuote<{
      query: typeof query;
      selection: { token: string; itinerary: string; label: string };
    }>(selection, user.id, "outbound") : undefined;
    if (outbound && JSON.stringify(outbound.query) !== JSON.stringify(query)) {
      return apiError("Search parameters changed. Select a new outbound flight.", 422);
    }
    const { offers, selections } = await searchFlights(query, outbound?.selection);
    return apiSuccess({
      offers: await Promise.all(offers.map(async (quote) => ({
        ...quote, bookingToken: undefined, token: await signQuote(quote, user.id, "quote"),
        bookable: !!quote.bookingToken,
      }))),
      selections: await Promise.all(selections.map(async ({ label, ...selection }) => ({
        label, token: await signQuote({ query, selection: { label, ...selection } }, user.id, "outbound"),
      }))),
    });
  } catch (error) {
    if (error instanceof QuoteError) return apiError(error.message, error.status);
    return handleApiError(error);
  }
}
