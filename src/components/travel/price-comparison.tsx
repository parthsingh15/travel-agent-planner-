"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Check, Tag } from "lucide-react";
import { DEFAULT_CURRENCY, formatCurrency } from "@/lib/utils";

export type VendorQuote = {
  vendor: string;
  price: number;
  currency: string;
  premium: number;
  refundable: boolean;
  baggageIncluded: boolean;
};

export type PriceComparison = {
  quotes: VendorQuote[];
  cheapestVendor: string;
  cheapestPrice: number;
  highestPrice: number;
  maxSaving: number;
};

/** Vendor-by-vendor pricing for a single offer, collapsed by default. */
export function PriceComparisonTable({
  comparison,
  label = "prices",
}: {
  comparison: PriceComparison;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const currency = comparison.quotes[0]?.currency ?? DEFAULT_CURRENCY;

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 text-sm font-medium text-primary-700 hover:text-primary-800"
      >
        {open ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
        Compare {comparison.quotes.length} {label}
        {comparison.maxSaving > 0 && (
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
            <Tag className="h-3 w-3" />
            Save up to {formatCurrency(comparison.maxSaving, currency)}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4 font-medium">Vendor</th>
                <th className="py-2 pr-4 font-medium">Price</th>
                <th className="py-2 pr-4 font-medium">vs cheapest</th>
                <th className="py-2 pr-4 font-medium">Includes</th>
              </tr>
            </thead>
            <tbody>
              {comparison.quotes.map((quote) => {
                const cheapest = quote.premium === 0;
                return (
                  <tr
                    key={quote.vendor}
                    className={
                      cheapest
                        ? "bg-green-50 font-medium text-green-900"
                        : "text-slate-700"
                    }
                  >
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        {cheapest && <Check className="h-3.5 w-3.5 text-green-600" />}
                        {quote.vendor}
                      </span>
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {formatCurrency(quote.price, quote.currency)}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap text-slate-500">
                      {cheapest ? "—" : `+${formatCurrency(quote.premium, quote.currency)}`}
                    </td>
                    <td className="py-2 pr-4 text-xs text-slate-500">
                      {[
                        quote.refundable ? "Refundable" : null,
                        quote.baggageIncluded ? "Baggage" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Base fare only"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
