import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireVerifiedAuth } from "@/lib/auth";
import { apiError, apiSuccess, handleApiError } from "@/lib/api-response";
import { createPriceAlert } from "@/lib/booking-service";
import { createPriceAlertSchema } from "@/lib/validators";
import { z } from "zod";
import { checkPriceAlerts } from "@/lib/price-alert-service";
import { readQuote, QuoteError, type Quote } from "@/lib/services/live-quotes";

export const maxDuration = 60;

export async function GET() {
  try {
    const session = await requireVerifiedAuth();
    const alerts = await prisma.priceAlert.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      include: {
        trip: { select: { id: true, title: true, destination: true } },
      },
    });
    return apiSuccess({ alerts });
  } catch (error) {
    if (error instanceof QuoteError) return apiError(error.message, error.status);
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireVerifiedAuth();
    const body = await request.json();

    if (body.action === "check") {
      const id = z.string().min(1).parse(body.id);
      const checks = await checkPriceAlerts({ userId: session.id, id });
      if (!checks.length) {
        const existing = await prisma.priceAlert.findFirst({
          where: { id, userId: session.id }, select: { id: true },
        });
        if (!existing) return apiError("Alert not found", 404);
      }
      return apiSuccess({ checks });
    }

    const { token, targetPrice } = z.object({
      token: z.string().optional(), targetPrice: z.number().finite().positive(),
    }).parse(body);
    if (token) {
      const quote = await readQuote<Quote>(token, session.id, "quote");
      const snapshot = { ...quote };
      delete snapshot.bookingToken;
      const alert = await createPriceAlert({
        userId: session.id, title: quote.title, type: quote.type,
        targetPrice, currentPrice: quote.price, currency: quote.currency,
        metadata: { quote: snapshot },
      });
      return apiSuccess({ alert }, 201);
    }

    const data = createPriceAlertSchema.parse(body);
    if (data.tripId && !await prisma.trip.findFirst({
      where: { id: data.tripId, userId: session.id }, select: { id: true },
    })) return apiError("Trip not found", 404);
    const alert = await createPriceAlert({
      userId: session.id,
      tripId: data.tripId,
      type: data.type,
      title: data.title,
      targetPrice: data.targetPrice,
      currentPrice: data.currentPrice,
      currency: data.currency,
      metadata: { recommendation: data.metadata },
    });

    return apiSuccess({ alert }, 201);
  } catch (error) {
    if (error instanceof QuoteError) return apiError(error.message, error.status);
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireVerifiedAuth();
    const body = z.object({ id: z.string(), status: z.literal("CANCELLED") }).parse(await request.json());

    const alert = await prisma.priceAlert.update({
      where: { id: body.id, userId: session.id, status: "ACTIVE" },
      data: { status: body.status },
    });

    return apiSuccess({ alert });
  } catch (error) {
    if (error instanceof QuoteError) return apiError(error.message, error.status);
    return handleApiError(error);
  }
}
