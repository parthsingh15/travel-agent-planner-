import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createToken, setAuthCookie } from "@/lib/auth";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";
import { verifyOtpSchema } from "@/lib/validators";
import { AuditAction } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = verifyOtpSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (!user) {
      return apiError("User not found", 404);
    }

    const otp = await prisma.otpVerification.findFirst({
      where: {
        userId: user.id,
        code: data.code,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otp) {
      return apiError("Invalid or expired OTP", 400);
    }

    const verified = await prisma.$transaction(async (tx) => {
      const claimed = await tx.user.updateMany({
        where: { id: user.id, emailVerified: false },
        data: { emailVerified: true },
      });
      if (!claimed.count) return false;
      await tx.otpVerification.update({
        where: { id: otp.id, used: false, expiresAt: { gt: new Date() } },
        data: { used: true },
      });
      return true;
    });
    if (!verified) return apiError("Email already verified. Please sign in.", 400);

    const token = await createToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: true,
    });

    await setAuthCookie(token);

    await createAuditLog({
      userId: user.id,
      action: AuditAction.EMAIL_VERIFIED,
      entity: "User",
      entityId: user.id,
      ipAddress: getClientIp(request),
    });

    return apiSuccess({
      message: "Email verified successfully",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: true,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
