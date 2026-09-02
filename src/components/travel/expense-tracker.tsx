"use client";

import { useCallback, useEffect, useState } from "react";
import { Wallet, Plus, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { formatCurrency, formatDate } from "@/lib/utils";

const CATEGORIES = [
  "FLIGHTS",
  "ACCOMMODATION",
  "FOOD",
  "ACTIVITIES",
  "TRANSPORT",
  "SHOPPING",
  "OTHER",
] as const;

type Category = (typeof CATEGORIES)[number];

type Expense = {
  id: string;
  category: Category;
  description: string;
  amount: number;
  currency: string;
  spentAt: string;
  notes?: string | null;
};

type Summary = {
  totalSpent: number;
  budget: number;
  remaining: number;
  percentUsed: number;
  overBudget: boolean;
  currency: string;
  byCategory: { category: Category; amount: number; percentOfSpend: number }[];
  ignoredCurrencies: string[];
};

const CATEGORY_LABEL: Record<Category, string> = {
  FLIGHTS: "Flights",
  ACCOMMODATION: "Accommodation",
  FOOD: "Food",
  ACTIVITIES: "Activities",
  TRANSPORT: "Transport",
  SHOPPING: "Shopping",
  OTHER: "Other",
};

export function ExpenseTracker({
  tripId,
  currency,
}: {
  tripId: string;
  currency: string;
}) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Category>("FOOD");
  const [spentAt, setSpentAt] = useState(
    new Date().toISOString().split("T")[0]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/expenses?tripId=${encodeURIComponent(tripId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load expenses");
      setExpenses(data.expenses);
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load expenses");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

  const addExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(amount);
    if (!description.trim() || !Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter a description and an amount greater than zero");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          category,
          description: description.trim(),
          amount: parsed,
          currency,
          spentAt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add expense");

      setDescription("");
      setAmount("");
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add expense");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Could not delete expense");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete expense");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary-600" />
          Expenses
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </CardHeader>

      <CardContent>
        {showForm && (
          <form
            onSubmit={addExpense}
            className="grid gap-3 md:grid-cols-4 mb-5 pb-5 border-b border-slate-100"
          >
            <Input
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Airport taxi"
              required
            />
            <Input
              label={`Amount (${currency})`}
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Date"
              type="date"
              value={spentAt}
              onChange={(e) => setSpentAt(e.target.value)}
            />
            <div className="md:col-span-4">
              <Button type="submit" size="sm" loading={saving}>
                Save expense
              </Button>
            </div>
          </form>
        )}

        {loading && <LoadingState message="Loading expenses..." />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && summary && (
          <>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Spent</p>
                <p className="text-lg font-bold text-slate-900">
                  {formatCurrency(summary.totalSpent, summary.currency)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Budget</p>
                <p className="text-lg font-bold text-slate-900">
                  {formatCurrency(summary.budget, summary.currency)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {summary.overBudget ? "Over by" : "Remaining"}
                </p>
                <p
                  className={`text-lg font-bold ${
                    summary.overBudget ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {formatCurrency(
                    Math.abs(summary.remaining),
                    summary.currency
                  )}
                </p>
              </div>
            </div>

            <div
              className="h-2 w-full rounded-full bg-slate-100 overflow-hidden"
              role="progressbar"
              aria-valuenow={Math.min(100, summary.percentUsed)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Budget used"
            >
              <div
                className={`h-full rounded-full transition-all ${
                  summary.overBudget ? "bg-red-500" : "bg-primary-500"
                }`}
                style={{ width: `${Math.min(100, summary.percentUsed)}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              {summary.percentUsed}% of budget used
            </p>

            {summary.ignoredCurrencies.length > 0 && (
              <p className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                Totals exclude expenses in{" "}
                {summary.ignoredCurrencies.join(", ")} — no exchange rate is
                applied, so those are listed but not converted.
              </p>
            )}

            {summary.byCategory.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {summary.byCategory.map((row) => (
                  <span
                    key={row.category}
                    className="px-2.5 py-1 rounded-full bg-slate-100 text-xs text-slate-700"
                  >
                    {CATEGORY_LABEL[row.category]}{" "}
                    <span className="font-semibold">
                      {formatCurrency(row.amount, summary.currency)}
                    </span>{" "}
                    <span className="text-slate-400">{row.percentOfSpend}%</span>
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        {!loading && !error && expenses.length === 0 && (
          <EmptyState
            title="No expenses logged"
            description="Track what you actually spend against the trip budget."
          />
        )}

        {!loading && expenses.length > 0 && (
          <div className="mt-5 divide-y divide-slate-100">
            {expenses.map((expense) => (
              <div
                key={expense.id}
                className="flex items-center justify-between py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {expense.description}
                  </p>
                  <p className="text-xs text-slate-500">
                    {CATEGORY_LABEL[expense.category]} ·{" "}
                    {formatDate(expense.spentAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-semibold text-slate-900">
                    {formatCurrency(expense.amount, expense.currency)}
                  </span>
                  <button
                    onClick={() => remove(expense.id)}
                    className="text-slate-400 hover:text-red-600 transition-colors"
                    aria-label={`Delete ${expense.description}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
