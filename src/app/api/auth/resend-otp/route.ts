import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { sendOtpEmail } from "@/lib/email";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";
import { generateOtp, getOtpExpiry } from "@/lib/utils";
import { z } from "zod";

const resendSchema = z.object({
  email: z.string().email(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = resendSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (!user) {
      return apiError("User not found", 404);
    }

    if (user.emailVerified) {
      return apiError("Email already verified", 400);
    }

    const otp = generateOtp();

    await prisma.otpVerification.create({
      data: {
        userId: user.id,
        code: otp,
        expiresAt: getOtpExpiry(),
      },
    });

    await sendOtpEmail(user.email, user.name, otp);

    return apiSuccess({ message: "OTP resent successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}
