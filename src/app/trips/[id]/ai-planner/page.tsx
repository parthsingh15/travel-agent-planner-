"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { AgentPipeline } from "@/components/ai/agent-pipeline";
import { AgentOutputs } from "@/components/ai/agent-outputs";
import { BookableRecommendations } from "@/components/ai/bookable-recommendations";
import { formatCurrency } from "@/lib/utils";
import {
  Sparkles,
  MapPin,
  ArrowLeft,
  Bot,
  Calendar,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type DayPlan = {
  day: number;
  date: string;
  title: string;
  activities: { time: string; title: string; description: string }[];
  meals: { type: string; restaurant: string }[];
};

type Generation = {
  id: string;
  status: string;
  currentAgent?: string | null;
  errorMessage?: string | null;
  destinationResearch?: unknown;
  flightsOutput?: unknown;
  staysOutput?: unknown;
  supervisorOutput?: unknown;
  activitiesOutput?: unknown;
  budgetOutput?: unknown;
  itineraryOutput?: unknown;
  validationOutput?: unknown;
  orchestratorNotes?: string | null;
  versions?: { id: string; versionNumber: number; title: string }[];
  trip?: {
    title: string;
    destination: string;
    budget: number;
    currency: string;
  };
};

type Trip = {
  id: string;
  title: string;
  destination: string;
  budget: number;
  currency: string;
};

export default function AIPlannerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [activeTab, setActiveTab] = useState<"pipeline" | "outputs" | "book" | "itinerary">("pipeline");
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1]));

  const fetchTrip = useCallback(async () => {
    const res = await fetch(`/api/trips/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setTrip(data.trip);
    return data.trip;
  }, [id]);

  const pollGeneration = useCallback(
    async (generationId: string) => {
      const res = await fetch(`/api/trips/${id}/generations/${generationId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGeneration(data.generation);
      return data.generation as Generation;
    },
    [id]
  );

  useEffect(() => {
    fetchTrip()
      .then(async () => {
        const gensRes = await fetch(`/api/trips/${id}/generate`);
        const gensData = await gensRes.json();
        if (gensData.generations?.length > 0) {
          const latest = gensData.generations[0];
          await pollGeneration(latest.id);
          if (latest.status === "IN_PROGRESS") {
            setActiveTab("pipeline");
          }
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [fetchTrip, pollGeneration, id]);

  useEffect(() => {
    if (!generation || generation.status !== "IN_PROGRESS") return;

    const interval = setInterval(async () => {
      const updated = await pollGeneration(generation.id);
      if (updated.status !== "IN_PROGRESS") {
        clearInterval(interval);
        if (updated.status === "COMPLETED") {
          setActiveTab("itinerary");
        }
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [generation, pollGeneration]);

  const handleStart = async () => {
    setStarting(true);
    setError("");
    try {
      const res = await fetch(`/api/trips/${id}/generate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setActiveTab("pipeline");
      await pollGeneration(data.generationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start generation");
    } finally {
      setStarting(false);
    }
  };

  const itinerary = generation?.itineraryOutput as {
    title?: string;
    summary?: string;
    totalBudget?: number;
    days?: DayPlan[];
    tips?: string[];
  } | null;

  const validation = generation?.validationOutput as {
    score?: number;
    approved?: boolean;
    strengths?: string[];
    improvements?: string[];
  } | null;

  if (loading) {
    return (
      <DashboardLayout>
        <LoadingState message="Loading AI Planner..." />
      </DashboardLayout>
    );
  }

  if (error && !trip) {
    return (
      <DashboardLayout>
        <ErrorState message={error} />
      </DashboardLayout>
    );
  }

  const isRunning = generation?.status === "IN_PROGRESS";
  const isComplete = generation?.status === "COMPLETED";
  const isFailed = generation?.status === "FAILED";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href={`/trips/${id}`} className="text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Bot className="h-6 w-6 text-primary-600" />
              <h1 className="text-2xl font-bold">Multi-Agent AI Itinerary Generator</h1>
            </div>
            {trip && (
              <p className="text-slate-600 mt-1 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {trip.title} — {trip.destination}
              </p>
            )}
          </div>
          <Button onClick={handleStart} loading={starting || isRunning} disabled={isRunning}>
            <Sparkles className="h-4 w-4" />
            {isRunning ? "Agents Working..." : isComplete ? "Regenerate Itinerary" : "Start AI Planning"}
          </Button>
        </div>

        <Card className="bg-gradient-to-r from-primary-50 to-purple-50 border-primary-200">
          <CardContent className="py-4">
            <p className="text-sm text-slate-700">
              <strong>Supervisor Agent</strong> coordinates dedicated <strong>Flight</strong>, <strong>Hotel</strong>, <strong>Activity</strong>, <strong>Restaurant</strong> and <strong>Transportation</strong> agents, grounded by <strong>Destination Research</strong>.
              Book recommendations or set price drop alerts. Complete bookings through the confirmation workflow.
            </p>
          </CardContent>
        </Card>

        {isFailed && (
          <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">
            Generation failed: {generation?.errorMessage || "Unknown error"}
          </div>
        )}

        {validation && isComplete && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-green-800">
                    Validation Score: {validation.score}/100
                    {validation.approved ? " ✓ Approved" : ""}
                  </p>
                  {validation.strengths && (
                    <p className="text-sm text-green-700 mt-1">
                      Strengths: {validation.strengths.join(", ")}
                    </p>
                  )}
                </div>
                {generation?.versions?.[0] && (
                  <Link href={`/trips/${id}`}>
                    <Button variant="outline" size="sm">
                      View Full Trip
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2 border-b border-slate-200">
          {(["pipeline", "outputs", "book", "itinerary"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-primary-600 text-primary-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab === "pipeline" && "Agent Pipeline"}
              {tab === "outputs" && "Agent Outputs"}
              {tab === "book" && "Book & Alerts"}
              {tab === "itinerary" && "Final Itinerary"}
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {activeTab === "pipeline" && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary-600" />
                  AI Agent Pipeline
                  {isRunning && (
                    <span className="text-sm font-normal text-primary-600 animate-pulse">
                      — Orchestrator running...
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {generation ? (
                  <AgentPipeline generation={generation} />
                ) : (
                  <div className="text-center py-12">
                    <Bot className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-600 mb-4">
                      Click &quot;Start AI Planning&quot; to launch the multi-agent system
                    </p>
                    <Button onClick={handleStart} loading={starting}>
                      <Sparkles className="h-4 w-4" />
                      Start AI Planning
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "outputs" && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Individual Agent Research & Outputs</CardTitle>
              </CardHeader>
              <CardContent>
                {generation ? (
                  <AgentOutputs generation={generation as Record<string, unknown>} />
                ) : (
                  <p className="text-slate-500 text-center py-8">No agent outputs yet</p>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "book" && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Book Flights, Stays & Activities</CardTitle>
              </CardHeader>
              <CardContent>
                {generation ? (
                  <BookableRecommendations
                    generation={generation as Record<string, unknown>}
                    tripId={id}
                    currency={trip?.currency}
                  />
                ) : (
                  <p className="text-slate-500 text-center py-8">Run AI planning first</p>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "itinerary" && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Day-by-Day Itinerary
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!itinerary?.days ? (
                  <p className="text-slate-500 text-center py-8">
                    {isRunning
                      ? "Itinerary will appear once the generator agent completes..."
                      : "Start AI planning to generate your itinerary"}
                  </p>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-xl font-bold">{itinerary.title}</h3>
                      {itinerary.summary && (
                        <p className="text-slate-600 mt-1">{itinerary.summary}</p>
                      )}
                      {itinerary.totalBudget && trip && (
                        <p className="text-sm font-medium mt-2">
                          Total Budget: {formatCurrency(itinerary.totalBudget, trip.currency)}
                        </p>
                      )}
                    </div>

                    {itinerary.days.map((day) => (
                      <div key={day.day} className="border rounded-lg">
                        <button
                          onClick={() => {
                            const next = new Set(expandedDays);
                            if (next.has(day.day)) next.delete(day.day);
                            else next.add(day.day);
                            setExpandedDays(next);
                          }}
                          className="w-full flex justify-between items-center p-4 hover:bg-slate-50"
                        >
                          <div className="text-left">
                            <p className="font-semibold">Day {day.day}: {day.title}</p>
                            <p className="text-sm text-slate-500">{day.date}</p>
                          </div>
                          {expandedDays.has(day.day) ? (
                            <ChevronUp className="h-5 w-5" />
                          ) : (
                            <ChevronDown className="h-5 w-5" />
                          )}
                        </button>
                        {expandedDays.has(day.day) && (
                          <div className="px-4 pb-4 space-y-2">
                            {day.activities.map((act, i) => (
                              <div key={i} className="pl-3 border-l-2 border-primary-300">
                                <p className="text-sm font-medium">{act.time} — {act.title}</p>
                                <p className="text-sm text-slate-600">{act.description}</p>
                              </div>
                            ))}
                            {day.meals?.map((meal, i) => (
                              <p key={i} className="text-sm text-slate-600">
                                {meal.type}: {meal.restaurant}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}

                    {itinerary.tips && (
                      <div className="bg-amber-50 p-4 rounded-lg">
                        <p className="font-medium text-amber-800 mb-2">Travel Tips</p>
                        <ul className="text-sm text-amber-700 space-y-1">
                          {itinerary.tips.map((tip, i) => (
                            <li key={i}>• {tip}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {generation?.orchestratorNotes && (
          <p className="text-xs text-slate-400 text-center">{generation.orchestratorNotes}</p>
        )}
      </div>
    </DashboardLayout>
  );
}
