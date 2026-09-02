import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatCurrencyCompact,
  DEFAULT_CURRENCY,
  DEFAULT_LOCALE,
} from "@/lib/utils";

/** Strip non-breaking/narrow spaces Intl inserts, so assertions stay readable. */
const clean = (s: string) => s.replace(/[  ]/g, " ");

describe("INR defaults", () => {
  it("defaults to INR and en-IN", () => {
    expect(DEFAULT_CURRENCY).toBe("INR");
    expect(DEFAULT_LOCALE).toBe("en-IN");
  });

  it("formats with the rupee symbol by default", () => {
    expect(clean(formatCurrency(20000))).toContain("₹");
  });

  it("uses Indian digit grouping (lakh), not thousands grouping", () => {
    // 120000 is 1,20,000 in en-IN - NOT 120,000.
    const out = clean(formatCurrency(120000));
    expect(out).toContain("1,20,000");
    expect(out).not.toContain("120,000");
  });

  it("groups a crore correctly", () => {
    expect(clean(formatCurrency(10000000))).toContain("1,00,00,000");
  });

  it("omits decimals for whole rupee amounts", () => {
    expect(clean(formatCurrency(20000))).toBe("₹20,000");
  });

  it("keeps paise when the amount is fractional", () => {
    expect(clean(formatCurrency(1234.56))).toBe("₹1,234.56");
  });

  it("still honours an explicitly passed currency", () => {
    expect(clean(formatCurrency(1234.56, "USD"))).toContain("$");
  });

  it("handles zero and negative budgets", () => {
    expect(clean(formatCurrency(0))).toBe("₹0");
    expect(clean(formatCurrency(-500))).toContain("500");
  });
});

describe("compact INR formatting", () => {
  it("abbreviates thousands", () => {
    expect(formatCurrencyCompact(20000)).toBe("₹20K");
  });

  it("abbreviates lakhs", () => {
    expect(formatCurrencyCompact(120000)).toBe("₹1.2L");
    expect(formatCurrencyCompact(100000)).toBe("₹1L");
  });

  it("abbreviates crores", () => {
    expect(formatCurrencyCompact(10000000)).toBe("₹1Cr");
  });

  it("leaves small amounts fully formatted", () => {
    expect(clean(formatCurrencyCompact(450))).toBe("₹450");
  });

  it("does not abbreviate non-INR currencies", () => {
    expect(clean(formatCurrencyCompact(120000, "USD"))).toContain("$");
    expect(formatCurrencyCompact(120000, "USD")).not.toContain("L");
  });
});

describe("budget arithmetic the planner depends on", () => {
  it("renders the reference trip budget as ₹20,000", () => {
    expect(clean(formatCurrency(20000, "INR"))).toBe("₹20,000");
  });

  it("renders a remaining balance", () => {
    const budget = 20000;
    const spent = 15500;
    expect(clean(formatCurrency(budget - spent))).toBe("₹4,500");
  });
});
