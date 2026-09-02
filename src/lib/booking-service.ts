import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { DEFAULT_CURRENCY } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";
import {
  AuditAction,
  BookingStatus,
  BookingType,
  BookingWorkflowStep,
  PriceAlertStatus,
} from "@prisma/client";
import { sendEmail } from "@/lib/email";

export function generateConfirmationCode(): string {
  return `TP-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function createBooking(params: {
  userId: string;
  tripId?: string;
  generationId?: string;
  type: BookingType;
  title: string;
  description?: string;
  amount: number;
  currency?: string;
  metadata?: Record<string, unknown>;
}) {
  const booking = await prisma.booking.create({
    data: {
      userId: params.userId,
      tripId: params.tripId,
      generationId: params.generationId,
      type: params.type,
      title: params.title,
      description: params.description,
      amount: params.amount,
      currency: params.currency || DEFAULT_CURRENCY,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
      status: BookingStatus.DRAFT,
      workflowStep: BookingWorkflowStep.SELECTED,
    },
  });

  await createAuditLog({
    userId: params.userId,
    action: AuditAction.BOOKING_CREATED,
    entity: "Booking",
    entityId: booking.id,
    details: { type: params.type, amount: params.amount },
  });

  return booking;
}

export async function advanceBookingWorkflow(
  bookingId: string,
  userId: string,
  step: BookingWorkflowStep
) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId },
    include: { user: { select: { email: true, name: true } } },
  });

  if (!booking) throw new Error("NOT_FOUND");

  const updates: {
    workflowStep: BookingWorkflowStep;
    status?: BookingStatus;
    confirmationCode?: string;
    confirmedAt?: Date;
  } = { workflowStep: step };

  if (step === BookingWorkflowStep.CONFIRMED) {
    const code = generateConfirmationCode();
    updates.status = BookingStatus.CONFIRMED;
    updates.confirmationCode = code;
    updates.confirmedAt = new Date();

    await sendEmail({
      to: booking.user.email,
      subject: `Booking Confirmed — ${booking.title}`,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Booking Confirmed!</h2>
          <p>Hi ${booking.user.name},</p>
          <p>Your ${booking.type.toLowerCase()} booking has been confirmed.</p>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>${booking.title}</strong></p>
            <p>Confirmation Code: <strong style="font-size: 24px; letter-spacing: 4px;">${code}</strong></p>
            <p>Amount: ${booking.currency} ${booking.amount.toFixed(2)}</p>
          </div>
          <p>Present this confirmation code at check-in or when requested.</p>
        </div>
      `,
    });

    await createAuditLog({
      userId,
      action: AuditAction.BOOKING_CONFIRMED,
      entity: "Booking",
      entityId: bookingId,
      details: { confirmationCode: code },
    });
  } else if (step === BookingWorkflowStep.PAYMENT_PENDING) {
    updates.status = BookingStatus.PENDING_CONFIRMATION;
  }

  return prisma.booking.update({
    where: { id: bookingId },
    data: updates,
  });
}

export async function cancelBooking(bookingId: string, userId: string) {
  const booking = await prisma.booking.update({
    where: { id: bookingId, userId },
    data: {
      status: BookingStatus.CANCELLED,
      workflowStep: BookingWorkflowStep.CANCELLED,
      cancelledAt: new Date(),
    },
  });

  await createAuditLog({
    userId,
    action: AuditAction.BOOKING_CANCELLED,
    entity: "Booking",
    entityId: bookingId,
  });

  return booking;
}

export async function createPriceAlert(params: {
  userId: string;
  tripId?: string;
  type: BookingType;
  title: string;
  targetPrice: number;
  currentPrice?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
  expiresAt?: Date;
}) {
  const alert = await prisma.priceAlert.create({
    data: {
      userId: params.userId,
      tripId: params.tripId,
      type: params.type,
      title: params.title,
      targetPrice: params.targetPrice,
      currentPrice: params.currentPrice,
      currency: params.currency || DEFAULT_CURRENCY,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
      expiresAt: params.expiresAt,
      status: PriceAlertStatus.ACTIVE,
    },
  });

  await createAuditLog({
    userId: params.userId,
    action: AuditAction.PRICE_ALERT_CREATED,
    entity: "PriceAlert",
    entityId: alert.id,
    details: { targetPrice: params.targetPrice, type: params.type },
  });

  return alert;
}

export async function checkPriceAlerts(userId: string) {
  const alerts = await prisma.priceAlert.findMany({
    where: { userId, status: PriceAlertStatus.ACTIVE },
    include: { user: { select: { email: true, name: true } } },
  });

  const triggered = [];

  for (const alert of alerts) {
    const simulatedCurrentPrice = simulatePriceCheck(alert.targetPrice, alert.currentPrice);

    await prisma.priceAlert.update({
      where: { id: alert.id },
      data: { currentPrice: simulatedCurrentPrice },
    });

    if (simulatedCurrentPrice <= alert.targetPrice) {
      const updated = await prisma.priceAlert.update({
        where: { id: alert.id },
        data: {
          status: PriceAlertStatus.TRIGGERED,
          triggeredAt: new Date(),
          currentPrice: simulatedCurrentPrice,
        },
      });

      await sendEmail({
        to: alert.user.email,
        subject: `Price Drop Alert — ${alert.title}`,
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Price Drop Alert!</h2>
            <p>Hi ${alert.user.name},</p>
            <p>Great news! The price for <strong>${alert.title}</strong> has dropped to your target.</p>
            <div style="background: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p>Target Price: ${alert.currency} ${alert.targetPrice.toFixed(2)}</p>
              <p>Current Price: <strong style="color: #059669;">${alert.currency} ${simulatedCurrentPrice.toFixed(2)}</strong></p>
            </div>
            <p>Book now before the price goes back up!</p>
          </div>
        `,
      });

      await createAuditLog({
        userId,
        action: AuditAction.PRICE_ALERT_TRIGGERED,
        entity: "PriceAlert",
        entityId: alert.id,
        details: { currentPrice: simulatedCurrentPrice, targetPrice: alert.targetPrice },
      });

      triggered.push(updated);
    }
  }

  return triggered;
}

function simulatePriceCheck(targetPrice: number, currentPrice?: number | null): number {
  const base = currentPrice ?? targetPrice * 1.15;
  const fluctuation = (Math.random() - 0.5) * targetPrice * 0.2;
  return Math.max(targetPrice * 0.7, Math.round((base + fluctuation) * 100) / 100);
}
