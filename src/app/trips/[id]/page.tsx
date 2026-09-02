"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { WeatherPanel } from "@/components/travel/weather-panel";
import { DestinationMap } from "@/components/travel/destination-map";
import { ExpenseTracker } from "@/components/travel/expense-tracker";
import {
  ItineraryTimeline,
  type AnyDay,
} from "@/components/travel/itinerary-timeline";
import {
  BudgetBreakdown,
  type Breakdown,
  type SourceRef,
} from "@/components/travel/budget-breakdown";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  Sparkles,
  MapPin,
  Calendar,
  Users,
  IndianRupee,
  MessageSquare,
  Bookmark,
  CreditCard,
} from "lucide-react";

type StoredMetadata = {
  breakdown?: Breakdown;
  downgrades?: { step: string; savedApprox: number }[];
  budgetShortfall?: number | null;
  sources?: SourceRef[];
  verification?: { approved: boolean; score: number };
};


type Trip = {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget: number;
  currency: string;
  travelers: number;
  interests: string[];
  travelStyle: string;
  status: string;
  notes?: string;
  versions: {
    id: string;
    versionNumber: number;
    title: string;
    summary?: string;
    dayByDay: AnyDay[];
    metadata?: StoredMetadata | null;
    totalBudget?: number;
    createdAt: string;
  }[];
  generations: { id: string; status: string; createdAt: string }[];
};

export default function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedVersion, setSelectedVersion] = useState(0);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchTrip = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/trips/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTrip(data.trip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trip");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSave = async () => {
    if (!trip?.versions[selectedVersion] || !saveName) return;
    setSaving(true);
    try {
      const res = await fetch("/api/itineraries/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: trip.versions[selectedVersion].id,
          name: saveName,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      alert("Itinerary saved!");
      setSaveName("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };


  if (loading) {
    return (
      <DashboardLayout>
        <LoadingState message="Loading trip..." />
      </DashboardLayout>
    );
  }

  if (error || !trip) {
    return (
      <DashboardLayout>
        <ErrorState message={error || "Trip not found"} onRetry={fetchTrip} />
      </DashboardLayout>
    );
  }

  const version = trip.versions[selectedVersion];
  const days = (version?.dayByDay || []) as AnyDay[];
  const metadata = (version?.metadata ?? null) as StoredMetadata | null;
  const breakdown = metadata?.breakdown ?? null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{trip.title}</h1>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-600">
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" /> {trip.destination}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatDate(trip.startDate)} - {formatDate(trip.endDate)}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" /> {trip.travelers} travelers
              </span>
              <span className="flex items-center gap-1">
                <IndianRupee className="h-4 w-4" />
                {formatCurrency(trip.budget, trip.currency)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/trips/${trip.id}/ai-planner`}>
              <Button>
                <Sparkles className="h-4 w-4" />
                AI Multi-Agent Planner
              </Button>
            </Link>
            <Link href={`/chat?tripId=${trip.id}`}>
              <Button variant="outline">
                <MessageSquare className="h-4 w-4" />
                AI Chat
              </Button>
            </Link>
            <Link href={`/payments?tripId=${trip.id}`}>
              <Button variant="outline">
                <CreditCard className="h-4 w-4" />
                Pay
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="px-3 py-1 text-sm rounded-full bg-slate-100">{trip.status}</span>
          <span className="px-3 py-1 text-sm rounded-full bg-slate-100">{trip.travelStyle.replace("_", " ")}</span>
          {trip.interests.map((i) => (
            <span key={i} className="px-3 py-1 text-sm rounded-full bg-primary-50 text-primary-700">
              {i}
            </span>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <WeatherPanel tripId={trip.id} />
          <DestinationMap destination={trip.destination} />
        </div>

        <ExpenseTracker tripId={trip.id} currency={trip.currency} />

        {trip.versions.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Itinerary Versions (History)</CardTitle>
                <select
                  value={selectedVersion}
                  onChange={(e) => setSelectedVersion(parseInt(e.target.value, 10))}
                  className="px-3 py-1 border rounded-lg text-sm"
                >
                  {trip.versions.map((v, i) => (
                    <option key={v.id} value={i}>
                      v{v.versionNumber} - {formatDate(v.createdAt)}
                    </option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardContent>
              {version && (
                <>
                  <h3 className="font-semibold text-lg mb-1">{version.title}</h3>
                  {version.summary && (
                    <p className="text-slate-600 mb-4">{version.summary}</p>
                  )}
                  {version.totalBudget && (
                    <p className="text-sm font-medium mb-4">
                      Estimated total: {formatCurrency(version.totalBudget, trip.currency)}
                    </p>
                  )}

                  <ItineraryTimeline days={days} currency={trip.currency} />

                  {breakdown && (
                    <div className="mt-6">
                      <h4 className="font-semibold text-slate-900 mb-3">
                        Complete expense breakdown
                      </h4>
                      <BudgetBreakdown
                        breakdown={breakdown}
                        downgrades={metadata?.downgrades ?? []}
                        shortfall={metadata?.budgetShortfall ?? null}
                        sources={metadata?.sources ?? []}
                      />
                    </div>
                  )}

                  <div className="mt-6 flex gap-2 items-end">
                    <input
                      type="text"
                      placeholder="Save as..."
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm"
                    />
                    <Button onClick={handleSave} loading={saving} disabled={!saveName}>
                      <Bookmark className="h-4 w-4" />
                      Save
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {trip.versions.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Sparkles className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 mb-2 font-medium">
                No itinerary yet — launch the Multi-Agent AI Planner
              </p>
              <p className="text-sm text-slate-500 mb-6">
                Nine specialized AI agents research your destination and plan flights,
                hotels, activities, restaurants, transportation, and budget — then a critic
                validates the day-by-day itinerary before it is saved.
              </p>
              <Link href={`/trips/${trip.id}/ai-planner`}>
                <Button>
                  <Sparkles className="h-4 w-4" />
                  Open AI Multi-Agent Planner
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {trip.generations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Generation History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {trip.generations.map((gen) => (
                  <div key={gen.id} className="flex justify-between text-sm p-2 rounded bg-slate-50">
                    <span>{formatDate(gen.createdAt)}</span>
                    <span className={`font-medium ${
                      gen.status === "COMPLETED" ? "text-green-600" :
                      gen.status === "FAILED" ? "text-red-600" : "text-yellow-600"
                    }`}>
                      {gen.status}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
