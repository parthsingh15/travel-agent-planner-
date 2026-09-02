"use client";

import { useEffect, useState, Suspense } from "react";
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
  createdAt: string;
  trip?: { title: string; destination: string };
};

function PaymentsContent() {
  const searchParams = useSearchParams();
  const tripId = searchParams.get("tripId");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState("49.99");
  const [description, setDescription] = useState("Premium itinerary generation");

  const fetchPayments = async () => {
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
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const handlePayment = async () => {
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

      if (data.demo) {
        alert("Demo payment completed successfully!");
        await fetchPayments();
        return;
      }

      if (data.clientSecret) {
        const confirmRes = await fetch(`/api/payments/${data.payment.id}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const confirmData = await confirmRes.json();
        if (confirmRes.ok) {
          alert("Payment processed!");
        } else {
          throw new Error(confirmData.error);
        }
      }

      await fetchPayments();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Payment failed");
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Make a Payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Amount (USD)"
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
            ) : error ? (
              <ErrorState message={error} onRetry={fetchPayments} />
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
                      {payment.status === "SUCCEEDED" && (
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
                        {payment.status}
                      </span>
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
