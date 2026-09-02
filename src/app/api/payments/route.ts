import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireVerifiedAuth } from "@/lib/auth";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";
import { paymentSchema } from "@/lib/validators";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { AuditAction, PaymentStatus } from "@prisma/client";

export async function GET() {
  try {
    const session = await requireVerifiedAuth();

    const payments = await prisma.payment.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      include: {
        trip: { select: { id: true, title: true, destination: true } },
      },
    });

    return apiSuccess({ payments });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireVerifiedAuth();
    const body = await request.json();
    const data = paymentSchema.parse(body);

    if (data.tripId) {
      const trip = await prisma.trip.findFirst({
        where: { id: data.tripId, userId: session.id },
      });
      if (!trip) {
        return apiError("Trip not found", 404);
      }
    }

    const payment = await prisma.payment.create({
      data: {
        userId: session.id,
        tripId: data.tripId,
        amount: data.amount,
        currency: data.currency,
        description: data.description || "Travel planning service",
        status: PaymentStatus.PENDING,
      },
    });

    await createAuditLog({
      userId: session.id,
      action: AuditAction.PAYMENT_CREATED,
      entity: "Payment",
      entityId: payment.id,
      ipAddress: getClientIp(request),
    });

    if (!isStripeConfigured()) {
      const completed = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.SUCCEEDED,
          stripePaymentId: `demo_${payment.id}`,
          metadata: { mode: "demo", note: "Stripe not configured - demo payment" },
        },
      });

      await createAuditLog({
        userId: session.id,
        action: AuditAction.PAYMENT_SUCCEEDED,
        entity: "Payment",
        entityId: payment.id,
      });

      return apiSuccess({
        payment: completed,
        demo: true,
        message: "Demo payment completed (Stripe not configured)",
      }, 201);
    }

    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(data.amount * 100),
      currency: data.currency.toLowerCase(),
      metadata: {
        paymentId: payment.id,
        userId: session.id,
        tripId: data.tripId || "",
      },
      automatic_payment_methods: { enabled: true },
    });

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: { stripePaymentId: paymentIntent.id },
    });

    return apiSuccess({
      payment: updated,
      clientSecret: paymentIntent.client_secret,
    }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
