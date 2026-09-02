import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireVerifiedAuth } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { AuditAction, PaymentStatus } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const session = await requireVerifiedAuth();
    const { id } = await params;
    const body = await request.json();

    const payment = await prisma.payment.findFirst({
      where: { id, userId: session.id },
    });

    if (!payment) {
      return apiError("Payment not found", 404);
    }

    if (payment.status === PaymentStatus.SUCCEEDED) {
      return apiSuccess({ payment, message: "Already completed" });
    }

    if (!isStripeConfigured()) {
      const completed = await prisma.payment.update({
        where: { id },
        data: {
          status: PaymentStatus.SUCCEEDED,
          metadata: { mode: "demo", confirmedAt: new Date().toISOString() },
        },
      });

      await createAuditLog({
        userId: session.id,
        action: AuditAction.PAYMENT_SUCCEEDED,
        entity: "Payment",
        entityId: id,
      });

      return apiSuccess({ payment: completed, demo: true });
    }

    if (!payment.stripePaymentId) {
      return apiError("No Stripe payment associated", 400);
    }

    const stripe = getStripe();

    if (body.paymentMethodId) {
      await stripe.paymentIntents.confirm(payment.stripePaymentId, {
        payment_method: body.paymentMethodId,
      });
    }

    const intent = await stripe.paymentIntents.retrieve(payment.stripePaymentId);

    const status =
      intent.status === "succeeded"
        ? PaymentStatus.SUCCEEDED
        : intent.status === "canceled"
          ? PaymentStatus.FAILED
          : PaymentStatus.PENDING;

    const updated = await prisma.payment.update({
      where: { id },
      data: {
        status,
        metadata: { stripeStatus: intent.status },
      },
    });

    if (status === PaymentStatus.SUCCEEDED) {
      await createAuditLog({
        userId: session.id,
        action: AuditAction.PAYMENT_SUCCEEDED,
        entity: "Payment",
        entityId: id,
      });
    } else if (status === PaymentStatus.FAILED) {
      await createAuditLog({
        userId: session.id,
        action: AuditAction.PAYMENT_FAILED,
        entity: "Payment",
        entityId: id,
      });
    }

    return apiSuccess({ payment: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
