import { describe, it, expect } from "vitest";
import {
  signupSchema,
  loginSchema,
  verifyOtpSchema,
  createTripSchema,
  resetPasswordSchema,
} from "@/lib/validators";

describe("Auth Validators", () => {
  it("validates signup with correct data", () => {
    const result = signupSchema.safeParse({
      name: "John Doe",
      email: "john@example.com",
      password: "Password1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects weak passwords on signup", () => {
    const result = signupSchema.safeParse({
      name: "John Doe",
      email: "john@example.com",
      password: "weak",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email on login", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "Password1",
    });
    expect(result.success).toBe(false);
  });

  it("validates 6-digit OTP", () => {
    const valid = verifyOtpSchema.safeParse({
      email: "test@example.com",
      code: "123456",
    });
    expect(valid.success).toBe(true);

    const invalid = verifyOtpSchema.safeParse({
      email: "test@example.com",
      code: "12345",
    });
    expect(invalid.success).toBe(false);
  });

  it("validates reset password requirements", () => {
    const result = resetPasswordSchema.safeParse({
      token: "abc123",
      password: "NewPass1",
    });
    expect(result.success).toBe(true);
  });
});

describe("Trip Validators", () => {
  it("validates trip creation", () => {
    const result = createTripSchema.safeParse({
      title: "Paris Trip",
      destination: "Paris, France",
      startDate: "2026-06-01",
      endDate: "2026-06-07",
      budget: 2000,
      currency: "USD",
      travelers: 2,
      interests: ["food", "art"],
      travelStyle: "MID_RANGE",
    });
    expect(result.success).toBe(true);
  });

  it("rejects end date before start date", () => {
    const result = createTripSchema.safeParse({
      title: "Paris Trip",
      destination: "Paris, France",
      startDate: "2026-06-07",
      endDate: "2026-06-01",
      budget: 2000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative budget", () => {
    const result = createTripSchema.safeParse({
      title: "Paris Trip",
      destination: "Paris, France",
      startDate: "2026-06-01",
      endDate: "2026-06-07",
      budget: -100,
    });
    expect(result.success).toBe(false);
  });
});
