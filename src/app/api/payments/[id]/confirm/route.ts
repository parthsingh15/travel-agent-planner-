import { apiError } from "@/lib/api-response";

export function POST() {
  return apiError("Checkout has been retired.", 410);
}
