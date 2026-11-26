"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Ticket, CheckCircle, XCircle, Clock } from "lucide-react";

type Booking = {
  id: string;
  type: string;
  title: string;
  description?: string;
  amount: number;
  currency: string;
  status: string;
  workflowStep: string;
  confirmationCode?: string;
  confirmedAt?: string;
  metadata?: { kind?: string };
  createdAt: string;
  trip?: { title: string; destination: string };
};

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bookings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBookings(data.bookings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bookings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const cancelBooking = async (bookingId: string) => {
    setProcessing(bookingId);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to cancel draft.");
      await fetchBookings();
    } catch {
      alert("Failed to cancel booking");
    } finally {
      setProcessing(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Ticket className="h-6 w-6 text-primary-600" />
            Booking history
          </h1>
          <p className="text-slate-600 mt-1">
            Review provider handoffs and booking drafts.
          </p>
        </div>

        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchBookings} />
        ) : bookings.length === 0 ? (
          <EmptyState
            title="No bookings yet"
            description="Open a live offer from Search to record a provider handoff."
          />
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => {
              const handoff = booking.metadata?.kind === "provider-handoff";
              const legacyDemo = booking.status === "CONFIRMED" && booking.confirmationCode?.startsWith("TP-");
              const isConfirmed = booking.status === "CONFIRMED" && !!booking.confirmationCode && !legacyDemo;
              const isCancelled = booking.status === "CANCELLED";

              return (
                <Card key={booking.id} className={isConfirmed ? "border-green-200" : ""}>
                  <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 text-xs font-medium rounded bg-slate-100">
                            {booking.type}
                          </span>
                          {isConfirmed && <CheckCircle className="h-4 w-4 text-green-600" />}
                          {isCancelled && <XCircle className="h-4 w-4 text-red-600" />}
                          {!isConfirmed && !isCancelled && <Clock className="h-4 w-4 text-yellow-600" />}
                        </div>
                        <h3 className="font-semibold text-lg">{booking.title}</h3>
                        {booking.description && (
                          <p className="text-sm text-slate-600">{booking.description}</p>
                        )}
                        {booking.trip && (
                          <p className="text-xs text-slate-500 mt-1">
                            Trip: {booking.trip.title} — {booking.trip.destination}
                          </p>
                        )}
                        <p className="text-sm font-medium mt-2">
                          {formatCurrency(booking.amount, booking.currency)}
                        </p>
                        {isConfirmed && (
                          <div className="mt-2 p-2 bg-green-50 rounded-lg inline-block">
                            <p className="text-xs text-green-700">Confirmation Code</p>
                            <p className="font-mono font-bold text-green-800">{booking.confirmationCode}</p>
                            {booking.confirmedAt && (
                              <p className="text-xs text-green-600">
                                Confirmed {formatDate(booking.confirmedAt)}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-start gap-2">
                        <p className="text-sm text-slate-600">
                          {handoff && !isConfirmed && !isCancelled ? "Provider handoff · Awaiting confirmation"
                            : legacyDemo ? "Legacy demo booking"
                            : isConfirmed ? "Provider confirmed"
                            : isCancelled ? "Cancelled"
                            : booking.status === "DRAFT" ? "Draft" : "Awaiting confirmation"}
                        </p>
                        {booking.status === "DRAFT" && (
                          <Button size="sm" variant="outline" loading={processing === booking.id}
                            onClick={() => cancelBooking(booking.id)}>Cancel draft</Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
