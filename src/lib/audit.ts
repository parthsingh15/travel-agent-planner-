import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "./db";

type AuditParams = {
  userId?: string;
  action: AuditAction;
  entity?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
};

export async function createAuditLog(params: AuditParams) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        details: (params.details as Prisma.InputJsonValue) ?? undefined,
        ipAddress: params.ipAddress,
      },
    });
  } catch (error) {
    console.error("Failed to create audit log:", error);
  }
}

export function getClientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim();
  }
  return request.headers.get("x-real-ip") ?? undefined;
}
