import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireVerifiedAuth } from "@/lib/auth";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { createPriceAlert, checkPriceAlerts } from "@/lib/booking-service";
import { createPriceAlertSchema } from "@/lib/validators";
import { PriceAlertStatus } from "@prisma/client";

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
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireVerifiedAuth();
    const body = await request.json();

    if (body.action === "check") {
      const triggered = await checkPriceAlerts(session.id);
      return apiSuccess({ triggered, message: `${triggered.length} alert(s) triggered` });
    }

    const data = createPriceAlertSchema.parse(body);
    const alert = await createPriceAlert({
      userId: session.id,
      tripId: data.tripId,
      type: data.type,
      title: data.title,
      targetPrice: data.targetPrice,
      currentPrice: data.currentPrice,
      currency: data.currency,
      metadata: data.metadata,
    });

    return apiSuccess({ alert }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireVerifiedAuth();
    const body = await request.json();

    const alert = await prisma.priceAlert.update({
      where: { id: body.id, userId: session.id },
      data: { status: body.status as PriceAlertStatus },
    });

    return apiSuccess({ alert });
  } catch (error) {
    return handleApiError(error);
  }
}
