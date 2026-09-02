"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { BOOKING_WORKFLOW_STEPS } from "@/lib/agents/constants";
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
  createdAt: string;
  trip?: { title: string; destination: string };
};

const STEP_ORDER = ["SELECTED", "REVIEWING", "PAYMENT_PENDING", "CONFIRMED"];

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

  const advanceBooking = async (bookingId: string, currentStep: string) => {
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    const nextStep = STEP_ORDER[currentIndex + 1];
    if (!nextStep) return;

    setProcessing(bookingId);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: nextStep }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await fetchBookings();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to advance booking");
    } finally {
      setProcessing(null);
    }
  };

  const cancelBooking = async (bookingId: string) => {
    setProcessing(bookingId);
    try {
      await fetch(`/api/bookings/${bookingId}`, { method: "DELETE" });
      await fetchBookings();
    } catch {
      alert("Failed to cancel booking");
    } finally {
      setProcessing(null);
    }
  };

  const getStepIndex = (step: string) => STEP_ORDER.indexOf(step);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Ticket className="h-6 w-6 text-primary-600" />
            Booking Confirmations
          </h1>
          <p className="text-slate-600 mt-1">
            Manage flight, stay, and activity bookings with confirmation workflows
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Booking Workflow</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {BOOKING_WORKFLOW_STEPS.map((step, i) => (
                <div key={step.id} className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-bold">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{step.label}</p>
                    <p className="text-xs text-slate-500">{step.description}</p>
                  </div>
                  {i < BOOKING_WORKFLOW_STEPS.length - 1 && (
                    <span className="text-slate-300 mx-2">→</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchBookings} />
        ) : bookings.length === 0 ? (
          <EmptyState
            title="No bookings yet"
            description="Book flights, stays, or activities from the AI Planner"
          />
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => {
              const stepIdx = getStepIndex(booking.workflowStep);
              const isConfirmed = booking.workflowStep === "CONFIRMED";
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
                        {booking.confirmationCode && (
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

                      <div className="flex flex-col gap-2 min-w-[200px]">
                        <div className="flex gap-1">
                          {BOOKING_WORKFLOW_STEPS.map((step, i) => (
                            <div
                              key={step.id}
                              className={`flex-1 h-2 rounded-full ${
                                i <= stepIdx ? "bg-primary-500" : "bg-slate-200"
                              }`}
                            />
                          ))}
                        </div>
                        <p className="text-xs text-slate-500 text-center">
                          Step: {booking.workflowStep.replace("_", " ")}
                        </p>
                        {!isConfirmed && !isCancelled && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1"
                              loading={processing === booking.id}
                              onClick={() => advanceBooking(booking.id, booking.workflowStep)}
                            >
                              {booking.workflowStep === "PAYMENT_PENDING" ? "Confirm Booking" : "Next Step"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => cancelBooking(booking.id)}
                            >
                              Cancel
                            </Button>
                          </div>
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
