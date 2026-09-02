import { NextRequest } from "next/server";
import { AuditAction, ExpenseCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireVerifiedAuth } from "@/lib/auth";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";
import { updateExpenseSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const session = await requireVerifiedAuth();
    const { id } = await params;
    const data = updateExpenseSchema.parse(await request.json());

    const existing = await prisma.expense.findFirst({
      where: { id, userId: session.id },
      select: { id: true },
    });
    if (!existing) return apiError("Expense not found", 404);

    const expense = await prisma.expense.update({
      where: { id: existing.id },
      data: {
        category: data.category as ExpenseCategory | undefined,
        description: data.description,
        amount: data.amount,
        currency: data.currency,
        spentAt: data.spentAt ? new Date(data.spentAt) : undefined,
        notes: data.notes,
      },
    });

    await createAuditLog({
      userId: session.id,
      action: AuditAction.EXPENSE_UPDATED,
      entity: "Expense",
      entityId: expense.id,
      ipAddress: getClientIp(request),
    });

    return apiSuccess({ expense });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const session = await requireVerifiedAuth();
    const { id } = await params;

    const existing = await prisma.expense.findFirst({
      where: { id, userId: session.id },
      select: { id: true },
    });
    if (!existing) return apiError("Expense not found", 404);

    await prisma.expense.delete({ where: { id: existing.id } });

    await createAuditLog({
      userId: session.id,
      action: AuditAction.EXPENSE_DELETED,
      entity: "Expense",
      entityId: id,
      ipAddress: getClientIp(request),
    });

    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
