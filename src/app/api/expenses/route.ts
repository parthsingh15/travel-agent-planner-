import { NextRequest } from "next/server";
import { AuditAction, ExpenseCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireVerifiedAuth } from "@/lib/auth";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";
import { createExpenseSchema } from "@/lib/validators";
import { summariseExpenses } from "@/lib/expense-service";

export async function GET(request: NextRequest) {
  try {
    const session = await requireVerifiedAuth();
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get("tripId");

    if (!tripId) return apiError("tripId is required", 400);

    const trip = await prisma.trip.findFirst({
      where: { id: tripId, userId: session.id },
      select: { id: true, budget: true, currency: true },
    });
    if (!trip) return apiError("Trip not found", 404);

    const expenses = await prisma.expense.findMany({
      where: { tripId, userId: session.id },
      orderBy: { spentAt: "desc" },
    });

    return apiSuccess({
      expenses,
      summary: summariseExpenses(expenses, trip.budget, trip.currency),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireVerifiedAuth();
    const body = await request.json();
    const data = createExpenseSchema.parse(body);

    const trip = await prisma.trip.findFirst({
      where: { id: data.tripId, userId: session.id },
      select: { id: true },
    });
    if (!trip) return apiError("Trip not found", 404);

    const expense = await prisma.expense.create({
      data: {
        userId: session.id,
        tripId: data.tripId,
        category: data.category as ExpenseCategory,
        description: data.description,
        amount: data.amount,
        currency: data.currency,
        spentAt: data.spentAt ? new Date(data.spentAt) : new Date(),
        notes: data.notes,
      },
    });

    await createAuditLog({
      userId: session.id,
      action: AuditAction.EXPENSE_CREATED,
      entity: "Expense",
      entityId: expense.id,
      details: { tripId: data.tripId, amount: data.amount, category: data.category },
      ipAddress: getClientIp(request),
    });

    return apiSuccess({ expense }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
