import { createHash, timingSafeEqual } from "node:crypto";
import { checkPriceAlerts } from "@/lib/price-alert-service";
import { apiError, apiSuccess, handleApiError } from "@/lib/api-response";

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!secret || !timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`))) {
    return apiError("Unauthorized", 401);
  }
  if (!process.env.SERPAPI_API_KEY) return apiError("Live quote provider unavailable", 503);
  try {
    const checks = await checkPriceAlerts();
    return apiSuccess({ checked: checks.length, triggered: checks.filter((check) => check.triggered).length });
  } catch (error) {
    return handleApiError(error);
  }
}
