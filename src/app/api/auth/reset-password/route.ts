import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";
import { resetPasswordSchema } from "@/lib/validators";
import { AuditAction } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = resetPasswordSchema.parse(body);

    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        token: data.token,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!resetToken) {
      return apiError("Invalid or expired reset token", 400);
    }

    const passwordHash = await hashPassword(data.password);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      }),
    ]);

    await createAuditLog({
      userId: resetToken.userId,
      action: AuditAction.PASSWORD_RESET,
      entity: "User",
      entityId: resetToken.userId,
      ipAddress: getClientIp(request),
    });

    return apiSuccess({ message: "Password reset successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}
