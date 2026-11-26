"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Plus, MapPin } from "lucide-react";

type Trip = {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget: number;
  currency: string;
  status: string;
  _count: { versions: number; generations: number };
  savedItineraries: { id: string; name: string; versionId: string }[];
};

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchTrips = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/trips");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTrips(data.trips);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trips");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrips();
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">My Trips</h1>
            <p className="text-slate-600 mt-1">Manage all your travel plans</p>
          </div>
          <Link href="/trips/new">
            <Button>
              <Plus className="h-4 w-4" />
              New Trip
            </Button>
          </Link>
        </div>

        {loading ? (
          <LoadingState message="Loading trips..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchTrips} />
        ) : trips.length === 0 ? (
          <EmptyState
            title="No trips yet"
            description="Create your first trip to start planning"
            action={
              <Link href="/trips/new">
                <Button>Create Trip</Button>
              </Link>
            }
          />
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {trips.map((trip) => (
              <Card key={trip.id} className="hover:shadow-md transition-shadow h-full">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-lg">
                      <Link className="hover:underline" href={`/trips/${trip.id}`}>{trip.title}</Link>
                    </h3>
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-700">
                      {trip.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-600 text-sm mb-2">
                    <MapPin className="h-4 w-4" />
                    {trip.destination}
                  </div>
                  <p className="text-sm text-slate-500">
                    {formatDate(trip.startDate)} - {formatDate(trip.endDate)}
                  </p>
                  <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-100">
                    <span className="text-sm font-medium">
                      {formatCurrency(trip.budget, trip.currency)}
                    </span>
                    <span className="text-xs text-slate-500">
                      {trip._count.versions} version{trip._count.versions !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {trip.savedItineraries.length > 0 && (
                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <h4 className="text-sm font-medium">Saved itineraries</h4>
                      <ul className="mt-1 space-y-1">
                        {trip.savedItineraries.map((saved) => (
                          <li key={saved.id}>
                            <Link className="text-sm text-primary-700 hover:underline"
                              href={`/trips/${trip.id}?version=${saved.versionId}`}>{saved.name}</Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
