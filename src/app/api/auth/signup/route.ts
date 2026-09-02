import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  hashPassword,
} from "@/lib/auth";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { sendOtpEmail } from "@/lib/email";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";
import { signupSchema } from "@/lib/validators";
import { generateOtp, getOtpExpiry } from "@/lib/utils";
import { AuditAction } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = signupSchema.parse(body);

    const existing = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (existing) {
      return apiError("Email already registered", 409);
    }

    const passwordHash = await hashPassword(data.password);
    const otp = generateOtp();

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: data.name,
          email: data.email.toLowerCase(),
          passwordHash,
        },
      });

      await tx.otpVerification.create({
        data: {
          userId: newUser.id,
          code: otp,
          expiresAt: getOtpExpiry(),
        },
      });

      return newUser;
    });

    await sendOtpEmail(user.email, user.name, otp);

    await createAuditLog({
      userId: user.id,
      action: AuditAction.USER_SIGNUP,
      entity: "User",
      entityId: user.id,
      ipAddress: getClientIp(request),
    });

    return apiSuccess(
      {
        message: "Account created. Please verify your email with the OTP sent.",
        email: user.email,
        requiresVerification: true,
      },
      201
    );
  } catch (error) {
    return handleApiError(error);
  }
}
