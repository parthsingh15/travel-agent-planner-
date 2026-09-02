import { describe, it, expect } from "vitest";
import { summariseExpenses } from "@/lib/expense-service";
import { ExpenseCategory } from "@prisma/client";

const usd = (amount: number, category: ExpenseCategory) => ({
  amount,
  category,
  currency: "USD",
});

describe("expense summary", () => {
  it("totals spend and remaining budget", () => {
    const summary = summariseExpenses(
      [usd(400, "FLIGHTS"), usd(600, "ACCOMMODATION"), usd(150, "FOOD")],
      2000,
      "USD"
    );

    expect(summary.totalSpent).toBe(1150);
    expect(summary.remaining).toBe(850);
    expect(summary.percentUsed).toBe(57.5);
    expect(summary.overBudget).toBe(false);
  });

  it("flags going over budget with a negative remainder", () => {
    const summary = summariseExpenses([usd(2500, "FLIGHTS")], 2000, "USD");
    expect(summary.overBudget).toBe(true);
    expect(summary.remaining).toBe(-500);
    expect(summary.percentUsed).toBe(125);
  });

  it("groups by category, largest first", () => {
    const summary = summariseExpenses(
      [usd(100, "FOOD"), usd(500, "FLIGHTS"), usd(50, "FOOD")],
      1000,
      "USD"
    );

    expect(summary.byCategory[0]).toEqual({
      category: "FLIGHTS",
      amount: 500,
      percentOfSpend: 76.92,
    });
    expect(summary.byCategory[1].category).toBe("FOOD");
    expect(summary.byCategory[1].amount).toBe(150);
  });

  it("excludes foreign-currency expenses rather than inventing an FX rate", () => {
    const summary = summariseExpenses(
      [
        usd(300, "FLIGHTS"),
        { amount: 900, category: "FOOD" as ExpenseCategory, currency: "JPY" },
      ],
      2000,
      "USD"
    );

    expect(summary.totalSpent).toBe(300);
    expect(summary.ignoredCurrencies).toEqual(["JPY"]);
  });

  it("handles a trip with no expenses", () => {
    const summary = summariseExpenses([], 1500, "USD");
    expect(summary.totalSpent).toBe(0);
    expect(summary.percentUsed).toBe(0);
    expect(summary.byCategory).toEqual([]);
    expect(summary.overBudget).toBe(false);
  });

  it("avoids dividing by a zero budget", () => {
    const summary = summariseExpenses([usd(50, "FOOD")], 0, "USD");
    expect(summary.percentUsed).toBe(0);
    expect(summary.overBudget).toBe(true);
  });
});
