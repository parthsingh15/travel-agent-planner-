import { apiError } from "@/lib/api-response";

export function GET() {
  return apiError("Standalone travel search has been retired. Open My Trips to plan an itinerary.", 410);
}
