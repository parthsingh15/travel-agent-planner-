import { NextRequest } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireVerifiedAuth } from "@/lib/auth";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const session = await requireVerifiedAuth();
    const { id } = await params;

    const bookmark = await prisma.bookmark.findFirst({
      where: { id, userId: session.id },
      select: { id: true, type: true, title: true },
    });
    if (!bookmark) return apiError("Bookmark not found", 404);

    await prisma.bookmark.delete({ where: { id: bookmark.id } });

    await createAuditLog({
      userId: session.id,
      action: AuditAction.BOOKMARK_DELETED,
      entity: "Bookmark",
      entityId: bookmark.id,
      details: { type: bookmark.type, title: bookmark.title },
      ipAddress: getClientIp(request),
    });

    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
