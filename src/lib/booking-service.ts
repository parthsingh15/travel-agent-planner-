import { Prisma } from "@prisma/client";
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
  if (step === BookingWorkflowStep.CONFIRMED) throw new Error("FORBIDDEN");
  const result = await prisma.booking.updateMany({
    where: { id: bookingId, userId, status: BookingStatus.DRAFT },
    data: { workflowStep: step },
  });
  if (!result.count) throw new Error("FORBIDDEN");
  return prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
}

export async function cancelBooking(bookingId: string, userId: string) {
  const booking = await prisma.booking.update({
    where: { id: bookingId, userId, status: BookingStatus.DRAFT },
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
