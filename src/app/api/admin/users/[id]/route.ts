import { NextRequest } from "next/server";
import { AuditAction, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";
import { adminUpdateUserSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const data = adminUpdateUserSchema.parse(await request.json());

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, email: true },
    });
    if (!target) return apiError("User not found", 404);

    // Demoting the last admin would lock everyone out of administration.
    if (target.role === Role.ADMIN && data.role === Role.USER) {
      const adminCount = await prisma.user.count({ where: { role: Role.ADMIN } });
      if (adminCount <= 1) {
        return apiError("Cannot demote the last remaining admin", 409);
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        role: data.role as Role | undefined,
        emailVerified: data.emailVerified,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    await createAuditLog({
      userId: admin.id,
      action: AuditAction.ADMIN_ACTION,
      entity: "User",
      entityId: id,
      details: { changes: data, targetEmail: target.email },
      ipAddress: getClientIp(request),
    });

    return apiSuccess({ user });
  } catch (error) {
    return handleApiError(error);
  }
}
