"use client";

import { AlertTriangle, CheckCircle2, TrendingDown, Link2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ConfidenceBadge, type SourcedValue } from "./itinerary-timeline";

export type CostLine = {
  key: string;
  label: string;
  detail: string;
  amount: SourcedValue;
};

export type Breakdown = {
  lines: CostLine[];
  total: number;
  budget: number;
  remaining: number;
  withinBudget: boolean;
  currency: string;
};

export type SourceRef = {
  method: string;
  label: string;
  url?: string;
  fetchedAt: string;
};

export function BudgetBreakdown({
  breakdown,
  downgrades = [],
  shortfall,
  sources = [],
}: {
  breakdown: Breakdown;
  downgrades?: { step: string; savedApprox: number }[];
  shortfall?: number | null;
  sources?: SourceRef[];
}) {
  const currency = breakdown.currency || "INR";

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {breakdown.lines.map((line) => (
              <tr key={line.key}>
                <td className="px-4 py-2.5">
                  <p className="font-medium text-slate-900">{line.label}</p>
                  <p className="text-xs text-slate-500">{line.detail}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right align-top">
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(line.amount.value, currency)}
                  </span>
                  <ConfidenceBadge value={line.amount} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50">
            <tr className="border-t-2 border-slate-200">
              <td className="px-4 py-2.5 font-semibold text-slate-900">Estimated trip total</td>
              <td className="px-4 py-2.5 text-right font-bold text-slate-900">
                {formatCurrency(breakdown.total, currency)}
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2 text-slate-600">Your budget</td>
              <td className="px-4 py-2 text-right text-slate-700">
                {formatCurrency(breakdown.budget, currency)}
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-semibold text-slate-900">
                {breakdown.withinBudget ? "Remaining" : "Over budget by"}
              </td>
              <td
                className={`px-4 py-2.5 text-right font-bold ${
                  breakdown.withinBudget ? "text-green-600" : "text-red-600"
                }`}
              >
                {formatCurrency(Math.abs(breakdown.remaining), currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {breakdown.withinBudget ? (
        <p className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          This trip fits inside your budget.
        </p>
      ) : (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            Your budget is not sufficient for this trip.
          </p>
          {shortfall ? (
            <p className="mt-1 text-xs">
              Even after using the cheapest researched options, the trip costs{" "}
              {formatCurrency(shortfall, currency)} more than your budget. Consider a
              shorter trip, fewer travellers, or a nearer destination.
            </p>
          ) : null}
        </div>
      )}

      {downgrades.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <TrendingDown className="h-4 w-4" />
            Changes made to fit your budget
          </p>
          <ul className="mt-2 space-y-1">
            {downgrades.map((d, i) => (
              <li key={i} className="text-xs text-amber-800">
                • {d.step}{" "}
                <span className="text-amber-600">
                  (saves about {formatCurrency(d.savedApprox, currency)})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          How these figures were produced
        </p>
        <p className="mt-1.5 text-xs text-slate-600">
          <span className="font-semibold text-green-700">Verified</span> figures come
          from mapped data or a routing engine.{" "}
          <span className="font-semibold text-amber-700">Est</span> figures are
          estimates — no live pricing API is available for Indian hotels, restaurants
          or transport, so those use a documented cost model. Hover any badge for the
          exact rule used.
        </p>
        {sources.length > 0 && (
          <ul className="mt-2 space-y-1">
            {sources.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-500">
                <Link2 className="mt-0.5 h-3 w-3 flex-shrink-0" />
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:underline"
                  >
                    {s.label}
                  </a>
                ) : (
                  <span>{s.label}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
