import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const DEFAULT_CURRENCY = process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || "INR";
export const DEFAULT_LOCALE = process.env.NEXT_PUBLIC_DEFAULT_LOCALE || "en-IN";

/**
 * Format money for display. Defaults to INR with the en-IN locale, which also
 * gives the Indian digit grouping (lakh/crore): ₹1,20,000 rather than ₹120,000.
 */
export function formatCurrency(
  amount: number,
  currency = DEFAULT_CURRENCY,
  options: Intl.NumberFormatOptions = {}
) {
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: "currency",
    currency,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    ...options,
  }).format(amount);
}

/** Compact money for dense UI: ₹1.2L, ₹25K. Falls back to full format when small. */
export function formatCurrencyCompact(
  amount: number,
  currency = DEFAULT_CURRENCY
) {
  if (currency === "INR") {
    // Trim trailing zeros so 1.20 renders as 1.2 and 1.00 as 1.
    const trim = (n: number, digits: number) =>
      n.toFixed(digits).replace(/\.?0+$/, "");

    if (Math.abs(amount) >= 10000000) return `₹${trim(amount / 10000000, 2)}Cr`;
    if (Math.abs(amount) >= 100000) return `₹${trim(amount / 100000, 2)}L`;
    if (Math.abs(amount) >= 1000) return `₹${trim(amount / 1000, 1)}K`;
  }
  return formatCurrency(amount, currency);
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function generateOtp(): string {
  return (100000 + crypto.getRandomValues(new Uint32Array(1))[0] % 900000).toString();
}

export function getOtpExpiry(): Date {
  const minutes = parseInt(process.env.OTP_EXPIRY_MINUTES || "10", 10);
  return new Date(Date.now() + minutes * 60 * 1000);
}

export function getPasswordResetExpiry(): Date {
  const minutes = parseInt(process.env.PASSWORD_RESET_EXPIRY_MINUTES || "60", 10);
  return new Date(Date.now() + minutes * 60 * 1000);
}
