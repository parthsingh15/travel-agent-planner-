import { describe, it, expect } from "vitest";
import { generateOtp, formatCurrency, formatDate } from "@/lib/utils";

describe("Utility Functions", () => {
  it("generates 6-digit OTP", () => {
    const otp = generateOtp();
    expect(otp).toHaveLength(6);
    expect(/^\d{6}$/.test(otp)).toBe(true);
  });

  it("formats currency correctly", () => {
    const formatted = formatCurrency(1234.56, "USD");
    expect(formatted).toContain("1,234.56");
  });

  it("formats dates correctly", () => {
    const formatted = formatDate("2026-04-01");
    expect(formatted).toContain("2026");
    expect(formatted).toContain("Apr");
  });
});
