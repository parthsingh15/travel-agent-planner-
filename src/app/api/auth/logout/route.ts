import { NextRequest } from "next/server";
import { clearAuthCookie, getSession } from "@/lib/auth";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { AuditAction } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (session) {
      await createAuditLog({
        userId: session.id,
        action: AuditAction.USER_LOGOUT,
        entity: "User",
        entityId: session.id,
        ipAddress: getClientIp(request),
      });
    }

    await clearAuthCookie();
    return apiSuccess({ message: "Logged out successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}
