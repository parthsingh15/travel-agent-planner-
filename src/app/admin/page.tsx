"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AdminManagementTabs } from "@/components/admin/management-tabs";
import {
  Users,
  Map,
  Sparkles,
  Wallet,
} from "lucide-react";

type AdminData = {
  analytics: {
    userCount: number;
    tripCount: number;
    generationCount: number;
    totalExpenses: number;
    generationsByStatus: Record<string, number>;
    generationSuccessRate: number | null;
    topDestinations: { destination: string; trips: number }[];
  };
  recentUsers: { id: string; name: string; email: string; role: string; createdAt: string }[];
  recentTrips: { id: string; title: string; destination: string; user: { name: string }; createdAt: string }[];
  recentGenerations: { id: string; status: string; trip: { title: string; destination: string }; createdAt: string }[];
  recentAuditLogs: { id: string; action: string; entity?: string; user?: { name: string }; createdAt: string }[];
};

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "trips", label: "Trips" },
  { id: "itineraries", label: "Itineraries" },
  { id: "generations", label: "AI Generations" },
  { id: "audit-logs", label: "Audit Logs" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("overview");
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          if (res.status === 403) router.push("/dashboard");
          throw new Error(json.error);
        }
        setData(json);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <DashboardLayout>
        <LoadingState message="Loading admin dashboard..." />
      </DashboardLayout>
    );
  }

  if (error || !data) {
    return (
      <DashboardLayout>
        <ErrorState message={error || "Access denied"} />
      </DashboardLayout>
    );
  }

  const { analytics } = data;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-slate-600 mt-1">
            Manage users, trips, itineraries, and AI runs
          </p>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-primary-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab !== "overview" && <AdminManagementTabs resource={tab} />}

        {tab === "overview" && (
        <>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: "Users", value: analytics.userCount, icon: Users },
            { label: "Trips", value: analytics.tripCount, icon: Map },
            { label: "Generations", value: analytics.generationCount, icon: Sparkles },
            {
              label: "Logged expenses",
              value: formatCurrency(analytics.totalExpenses),
              icon: Wallet,
            },
            {
              label: "AI success rate",
              value:
                analytics.generationSuccessRate === null
                  ? "—"
                  : `${analytics.generationSuccessRate}%`,
              icon: Sparkles,
            },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <stat.icon className="h-5 w-5 text-primary-600" />
                  <div>
                    <p className="text-sm text-slate-600">{stat.label}</p>
                    <p className="text-xl font-bold">{stat.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Recent Users</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.recentUsers.map((u) => (
                  <div key={u.id} className="flex justify-between text-sm p-2 bg-slate-50 rounded">
                    <div>
                      <p className="font-medium">{u.name}</p>
                      <p className="text-slate-500">{u.email}</p>
                    </div>
                    <span className="text-xs text-slate-400">{formatDate(u.createdAt)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent Trips</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.recentTrips.map((t) => (
                  <div key={t.id} className="flex justify-between text-sm p-2 bg-slate-50 rounded">
                    <div>
                      <p className="font-medium">{t.title}</p>
                      <p className="text-slate-500">{t.destination} by {t.user.name}</p>
                    </div>
                    <span className="text-xs text-slate-400">{formatDate(t.createdAt)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent Generations</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.recentGenerations.map((g) => (
                  <div key={g.id} className="flex justify-between text-sm p-2 bg-slate-50 rounded">
                    <div>
                      <p className="font-medium">{g.trip.title}</p>
                      <p className="text-slate-500">{g.trip.destination}</p>
                    </div>
                    <span className={`text-xs font-medium ${
                      g.status === "COMPLETED" ? "text-green-600" : "text-yellow-600"
                    }`}>
                      {g.status}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

        </div>

        <Card>
          <CardHeader><CardTitle>Audit Logs</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {data.recentAuditLogs.map((log) => (
                <div key={log.id} className="flex justify-between text-sm p-2 border-b border-slate-100">
                  <div>
                    <span className="font-medium">{log.action}</span>
                    {log.user && <span className="text-slate-500 ml-2">by {log.user.name}</span>}
                    {log.entity && <span className="text-slate-400 ml-2">({log.entity})</span>}
                  </div>
                  <span className="text-xs text-slate-400">{formatDate(log.createdAt)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {analytics.topDestinations.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Top Destinations</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {analytics.topDestinations.map((row) => (
                  <div
                    key={row.destination}
                    className="flex justify-between text-sm p-2 bg-slate-50 rounded"
                  >
                    <span className="font-medium">{row.destination}</span>
                    <span className="text-slate-500">
                      {row.trips} trip{row.trips === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        </>
        )}
      </div>
    </DashboardLayout>
  );
}
