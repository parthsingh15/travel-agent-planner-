"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { DEFAULT_CURRENCY, formatCurrency, formatDate } from "@/lib/utils";
import { CreditCard, CheckCircle } from "lucide-react";

type Payment = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  description?: string;
  stripePaymentId?: string;
  metadata?: { checkoutStatus?: string; mode?: string };
  createdAt: string;
  trip?: { title: string; destination: string };
};

function paymentLabel(payment: Payment) {
  const labels: Record<string, string> = {
    paid: "Succeeded", cancelled: "Cancelled", failed: "Failed", expired: "Expired", pending: "Pending",
  };
  if (payment.status === "REFUNDED") return "Refunded";
  if (payment.metadata?.mode === "demo" || payment.stripePaymentId?.startsWith("demo_")) return "Legacy demo";
  return labels[payment.metadata?.checkoutStatus ?? ""] ?? payment.status;
}

function PaymentsContent() {
  const searchParams = useSearchParams();
  const tripId = searchParams.get("tripId");
  const returnedPayment = searchParams.get("payment");
  const cancelled = searchParams.get("cancel") === "1";
  const [notice, setNotice] = useState("");
  const [verifying, setVerifying] = useState("");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState("49.99");
  const [description, setDescription] = useState("Premium itinerary generation");

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/payments");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPayments(data.payments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payments");
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyPayment = useCallback(async (id: string, cancel = false) => {
    setVerifying(id);
    setError("");
    try {
      const res = await fetch(`/api/payments/${id}/confirm`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNotice(`Stripe test checkout · ${paymentLabel(data.payment)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify Stripe checkout.");
    } finally {
      setVerifying("");
      await fetchPayments();
    }
  }, [fetchPayments]);

  useEffect(() => {
    if (returnedPayment) void verifyPayment(returnedPayment, cancelled);
    else void fetchPayments();
  }, [returnedPayment, cancelled, verifyPayment, fetchPayments]);

  const handlePayment = async () => {
    setError("");
    setPaying(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: tripId || undefined,
          amount: parseFloat(amount),
          currency: DEFAULT_CURRENCY,
          description,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (!data.checkoutUrl) throw new Error("Stripe checkout URL is unavailable.");
      window.location.assign(data.checkoutUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setPaying(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">Payments</h1>
          <p className="text-slate-600 mt-1">
            Sandbox payment gateway for demonstration (no card details stored)
          </p>
        </div>

        {notice && <p role="status" className="text-sm text-slate-700">{notice}</p>}
        {error && <ErrorState message={error} />}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Make a Payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label={`Amount (${DEFAULT_CURRENCY})`}
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Input
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            {tripId && (
              <p className="text-sm text-slate-600">Linked to trip: {tripId}</p>
            )}
            <Button onClick={handlePayment} loading={paying}>
              Pay {formatCurrency(parseFloat(amount) || 0)}
            </Button>
            <p className="text-xs text-slate-500">
              This is a demo/sandbox payment. No real charges will be made.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <LoadingState />

            ) : payments.length === 0 ? (
              <EmptyState title="No payments yet" />
            ) : (
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">
                        {formatCurrency(payment.amount, payment.currency)}
                      </p>
                      <p className="text-sm text-slate-600">
                        {payment.description || "Payment"}
                      </p>
                      {payment.trip && (
                        <p className="text-xs text-slate-500">
                          {payment.trip.title} - {payment.trip.destination}
                        </p>
                      )}
                      <p className="text-xs text-slate-400 mt-1">
                        {formatDate(payment.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {paymentLabel(payment) === "Succeeded" && (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      )}
                      <span
                        className={`text-sm font-medium ${
                          payment.status === "SUCCEEDED"
                            ? "text-green-600"
                            : payment.status === "FAILED"
                              ? "text-red-600"
                              : "text-yellow-600"
                        }`}
                      >
                        {paymentLabel(payment)}
                      </span>
                      {payment.stripePaymentId?.startsWith("cs_test_") && payment.status !== "SUCCEEDED" && payment.status !== "REFUNDED" && (
                        <Button size="sm" variant="outline" loading={verifying === payment.id}
                          onClick={() => verifyPayment(payment.id)}>Check status</Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <PaymentsContent />
    </Suspense>
  );
}
