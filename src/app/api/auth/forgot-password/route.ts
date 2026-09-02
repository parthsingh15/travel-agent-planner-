import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { forgotPasswordSchema } from "@/lib/validators";
import { getPasswordResetExpiry } from "@/lib/utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = forgotPasswordSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (!user) {
      return apiSuccess({
        message: "If an account exists, a reset link has been sent.",
      });
    }

    const token = randomBytes(32).toString("hex");

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: getPasswordResetExpiry(),
      },
    });

    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`;
    await sendPasswordResetEmail(user.email, user.name, resetUrl);

    return apiSuccess({
      message: "If an account exists, a reset link has been sent.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
