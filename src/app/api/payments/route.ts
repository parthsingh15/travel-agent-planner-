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

    if (!isStripeConfigured()) return apiError("Stripe test checkout is unavailable.", 503);
    const amount = Math.round(data.amount * 100);
    if (!["INR", "USD"].includes(data.currency) || amount < 50 || amount > 99_999_999) {
      return apiError("Enter a valid INR or USD test amount.", 422);
    }
    const origin = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

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
        amount: amount / 100,
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

    try {
      const stripe = getStripe();
      const returnUrl = new URL("/payments", origin);
      returnUrl.searchParams.set("payment", payment.id);
      const cancelUrl = new URL(returnUrl);
      cancelUrl.searchParams.set("cancel", "1");
      const checkout = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        success_url: returnUrl.href,
        cancel_url: cancelUrl.href,
        client_reference_id: payment.id,
        metadata: { paymentId: payment.id, userId: session.id },
        line_items: [{
          quantity: 1,
          price_data: {
            currency: data.currency.toLowerCase(),
            unit_amount: amount,
            product_data: { name: payment.description || "Travel planning service" },
          },
        }],
      }, { idempotencyKey: payment.id });
      if (!checkout.url || checkout.livemode) throw new Error("Invalid test checkout");
      await prisma.payment.update({ where: { id: payment.id }, data: { stripePaymentId: checkout.id } });
      return apiSuccess({ checkoutUrl: checkout.url }, 201);
    } catch {
      await prisma.payment.update({ where: { id: payment.id }, data: {
        status: "FAILED", metadata: { checkoutStatus: "failed" },
      } });
      return apiError("Could not start Stripe test checkout.", 502);
    }
  } catch (error) {
    return handleApiError(error);
  }
}
