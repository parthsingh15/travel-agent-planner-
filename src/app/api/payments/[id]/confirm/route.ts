import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireVerifiedAuth } from "@/lib/auth";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { createAuditLog } from "@/lib/audit";
import { AuditAction } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireVerifiedAuth();
    const { id } = await params;
    const body = await request.json();
    const payment = await prisma.payment.findFirst({ where: { id, userId: user.id } });
    if (!payment) return apiError("Payment not found", 404);
    if (!payment.stripePaymentId?.startsWith("cs_test_")) return apiError("No Stripe test checkout is associated with this payment.", 422);
    if (!isStripeConfigured()) return apiError("Stripe test checkout is unavailable.", 503);
    if (payment.status === "SUCCEEDED" || payment.status === "REFUNDED") return apiSuccess({ payment });

    const stripe = getStripe();
    const checkout = await (async () => {
      try {
        let current = await stripe.checkout.sessions.retrieve(payment.stripePaymentId!, { expand: ["payment_intent"] });
        if (current.livemode || current.client_reference_id !== id || current.metadata?.userId !== user.id ||
            current.amount_total !== Math.round(payment.amount * 100) ||
            current.currency !== payment.currency.toLowerCase()) return null;
        if (body.cancel === true && current.status === "open") {
          try {
            await stripe.checkout.sessions.expire(current.id);
          } catch {
            // A completion can race the cancellation. Read Stripe's final state.
          }
          current = await stripe.checkout.sessions.retrieve(current.id, { expand: ["payment_intent"] });
        }
        return current;
      } catch {
        return null;
      }
    })();
    if (!checkout) return apiError("Stripe could not verify this checkout.", 502);

    const intent = checkout.payment_intent;
    const checkoutStatus = checkout.status === "complete" && checkout.payment_status === "paid"
      ? "paid"
      : checkout.status === "expired"
        ? (body.cancel === true || (payment.metadata as { checkoutStatus?: string } | null)?.checkoutStatus === "cancelled" ? "cancelled" : "expired")
        : typeof intent === "object" && intent?.last_payment_error
          ? "failed"
          : "pending";
    const status = checkoutStatus === "paid" ? "SUCCEEDED" : checkoutStatus === "pending" ? "PENDING" : "FAILED";
    const result = await prisma.payment.updateMany({
      where: { id, updatedAt: payment.updatedAt, status: { notIn: ["SUCCEEDED", "REFUNDED"] } },
      data: { status, metadata: { checkoutStatus } },
    });
    if (result.count && payment.status !== status && status !== "PENDING") {
      await createAuditLog({
        userId: user.id, entity: "Payment", entityId: id,
        action: status === "SUCCEEDED" ? AuditAction.PAYMENT_SUCCEEDED : AuditAction.PAYMENT_FAILED,
      });
    }
    return apiSuccess({ payment: await prisma.payment.findUniqueOrThrow({ where: { id } }) });
  } catch (error) {
    return handleApiError(error);
  }
}
