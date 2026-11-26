type EmailParams = {
  to: string;
  subject: string;
  htmlContent: string;
};

export async function sendEmail(params: EmailParams): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || "noreply@example.com";
  const senderName = process.env.BREVO_SENDER_NAME || "Travel Planner";

  if (!apiKey) {
    if (process.env.NODE_ENV !== "development") return false;
    console.log("[DEV EMAIL]", params.to, params.subject, params.htmlContent);
    return true;
  }

  if (!process.env.BREVO_SENDER_EMAIL) return false;

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: params.to }],
        subject: params.subject,
        htmlContent: params.htmlContent,
      }),
    });

    if (!response.ok) {
      console.error("Brevo email request failed", response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Failed to send email:", error);
    return false;
  }
}

export async function sendOtpEmail(email: string, name: string, otp: string) {
  return sendEmail({
    to: email,
    subject: "Verify your Travel Planner account",
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Travel Planner, ${name}!</h2>
        <p>Your verification code is:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 20px; background: #f3f4f6; text-align: center; border-radius: 8px;">
          ${otp}
        </div>
        <p>This code expires in ${process.env.OTP_EXPIRY_MINUTES || 10} minutes.</p>
        <p>If you didn't create an account, please ignore this email.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  name: string,
  resetUrl: string
) {
  return sendEmail({
    to: email,
    subject: "Reset your Travel Planner password",
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>Hi ${name},</p>
        <p>Click the button below to reset your password:</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">
          Reset Password
        </a>
        <p>This link expires in ${process.env.PASSWORD_RESET_EXPIRY_MINUTES || 60} minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
      </div>
    `,
  });
}
