import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireVerifiedAuth } from "@/lib/auth";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";
import { bookingOption, QuoteError, readQuote, signQuote, type BookingOption, type Quote } from "@/lib/services/live-quotes";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("lookup"), token: z.string().min(1) }),
  z.object({ action: z.literal("continue"), token: z.string().min(1) }),
]);

export async function POST(request: Request) {
  try {
    const user = await requireVerifiedAuth();
    const input = requestSchema.parse(await request.json());
    if (input.action === "lookup") {
      const quote = await readQuote<Quote>(input.token, user.id, "quote");
      const option = await bookingOption(quote);
      return apiSuccess({
        price: option.price, currency: quote.currency, source: option.source, checkedAt: option.checkedAt,
        token: await signQuote({ id: randomUUID(), option, title: quote.title, currency: quote.currency, type: quote.type }, user.id, "booking"),
      });
    }

    const { id, option, title, currency, type } = await readQuote<{
      id: string; option: BookingOption; title: string; currency: string; type: Quote["type"];
    }>(input.token, user.id, "booking");
    if (Date.now() - Date.parse(option.checkedAt) > 10 * 60_000) {
      return apiError("The booking quote expired. Check availability again.", 422);
    }
    await prisma.booking.upsert({
      where: { id }, update: {},
      create: {
        id, userId: user.id, type, title, amount: option.price, currency,
        status: "PENDING_CONFIRMATION", workflowStep: "REVIEWING",
        description: `Provider handoff to ${option.source}`,
        metadata: { kind: "provider-handoff", source: option.source, checkedAt: option.checkedAt },
      },
    });
    return apiSuccess({ url: option.url, postData: option.postData });
  } catch (error) {
    if (error instanceof QuoteError) return apiError(error.message, error.status);
    return handleApiError(error);
  }
}
