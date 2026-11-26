import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  verifyPassword,
  createToken,
  clearAuthCookie,
  setAuthCookie,
} from "@/lib/auth";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";
import { loginSchema } from "@/lib/validators";
import { AuditAction } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = loginSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (!user) {
      return apiError("Invalid email or password", 401);
    }

    const valid = await verifyPassword(data.password, user.passwordHash);
    if (!valid) {
      return apiError("Invalid email or password", 401);
    }

    if (!user.emailVerified) {
      await clearAuthCookie();
      return apiSuccess({ requiresVerification: true });
    }

    const token = await createToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified,
    });

    await setAuthCookie(token);

    await createAuditLog({
      userId: user.id,
      action: AuditAction.USER_LOGIN,
      entity: "User",
      entityId: user.id,
      ipAddress: getClientIp(request),
    });

    return apiSuccess({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
      },
      requiresVerification: !user.emailVerified,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
