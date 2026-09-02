import { ExpenseCategory } from "@prisma/client";

export type ExpenseLike = {
  category: ExpenseCategory;
  amount: number;
  currency: string;
};

export type ExpenseSummary = {
  totalSpent: number;
  budget: number;
  remaining: number;
  percentUsed: number;
  overBudget: boolean;
  currency: string;
  byCategory: {
    category: ExpenseCategory;
    amount: number;
    percentOfSpend: number;
  }[];
  /** Currencies present that differ from the trip currency; totals exclude them. */
  ignoredCurrencies: string[];
};

/**
 * Roll expenses up against the trip budget.
 *
 * Deliberately does NOT convert currencies: inventing an FX rate would produce
 * a confidently wrong total. Foreign-currency expenses are excluded from the
 * total and reported separately so the number shown is one the user can trust.
 */
export function summariseExpenses(
  expenses: ExpenseLike[],
  budget: number,
  currency: string
): ExpenseSummary {
  const matching = expenses.filter((e) => e.currency === currency);
  const ignoredCurrencies = [
    ...new Set(
      expenses.filter((e) => e.currency !== currency).map((e) => e.currency)
    ),
  ].sort();

  const totalSpent = round2(matching.reduce((sum, e) => sum + e.amount, 0));

  const totals = new Map<ExpenseCategory, number>();
  for (const expense of matching) {
    totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount);
  }

  const byCategory = [...totals.entries()]
    .map(([category, amount]) => ({
      category,
      amount: round2(amount),
      percentOfSpend: totalSpent > 0 ? round2((amount / totalSpent) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    totalSpent,
    budget,
    remaining: round2(budget - totalSpent),
    percentUsed: budget > 0 ? round2((totalSpent / budget) * 100) : 0,
    overBudget: totalSpent > budget,
    currency,
    byCategory,
    ignoredCurrencies,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
