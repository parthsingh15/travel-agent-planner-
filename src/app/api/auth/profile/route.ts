import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { updateProfileSchema } from "@/lib/validators";

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const data = updateProfileSchema.parse(body);

    const user = await prisma.user.update({
      where: { id: session.id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.profile && { profile: data.profile as Prisma.InputJsonValue }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        profile: true,
      },
    });

    return apiSuccess({ user });
  } catch (error) {
    return handleApiError(error);
  }
}
