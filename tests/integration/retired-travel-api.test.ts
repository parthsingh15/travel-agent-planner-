// @vitest-environment node
import { expect, it } from "vitest";
import { GET as flights } from "@/app/api/search/flights/route";
import { GET as hotels } from "@/app/api/search/hotels/route";
import { POST as createBooking } from "@/app/api/bookings/route";
import { PATCH as updateBooking, DELETE as cancelBooking } from "@/app/api/bookings/[id]/route";
import { POST as createPayment } from "@/app/api/payments/route";
import { POST as confirmPayment } from "@/app/api/payments/[id]/confirm/route";
import { POST as createAlert, PATCH as updateAlert } from "@/app/api/price-alerts/route";

it.each([
  ["flight search", flights], ["hotel search", hotels],
  ["create booking", createBooking], ["update booking", updateBooking], ["cancel booking", cancelBooking],
  ["create payment", createPayment], ["confirm payment", confirmPayment],
  ["create or check alert", createAlert], ["update alert", updateAlert],
])("returns Gone for retired %s", async (_name, handler) => {
  const response = handler();
  expect(response.status).toBe(410);
  expect((await response.json()).error).toMatch(/retired/);
});
