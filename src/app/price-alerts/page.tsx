"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Bell } from "lucide-react";

type PriceAlert = {
  id: string;
  type: string;
  title: string;
  targetPrice: number;
  currentPrice?: number;
  currency: string;
  status: string;
  triggeredAt?: string;
  createdAt: string;
  metadata?: {
    quote?: { checkedAt: string; source: string; subtitle: string };
    latestCheck?: { state: string; detail: string; at: string; price?: number; source?: string };
    emailStatus?: string;
  };
};

export default function PriceAlertsPage() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState("");
  const [actionError, setActionError] = useState("");

  const fetchAlerts = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/price-alerts");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAlerts(data.alerts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const updateAlert = async (id: string, method: "POST" | "PATCH") => {
    setChecking(id);
    setActionError("");
    try {
      const res = await fetch("/api/price-alerts", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(method === "POST" ? { action: "check", id } : { id, status: "CANCELLED" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await fetchAlerts();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update the alert.");
    } finally {
      setChecking("");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bell className="h-6 w-6 text-primary-600" />
              Price Drop Alerts
            </h1>
            <p className="text-slate-600 mt-1">
              Track flight and hotel quotes against your target price.
            </p>
          </div>
          <Link className="text-primary-700" href="/search">Search live offers</Link>
        </div>
        {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}

        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchAlerts} />
        ) : alerts.length === 0 ? (
          <EmptyState
            title="No price alerts"
            description="Set a target on a flight or hotel search result."
          />
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <Card
                key={alert.id}
                className={
                  alert.status === "TRIGGERED"
                    ? "border-green-300 bg-green-50"
                    : alert.status === "CANCELLED"
                      ? "opacity-60"
                      : ""
                }
              >
                <CardContent className="py-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 text-xs font-medium rounded bg-slate-100">
                          {alert.type}
                        </span>
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded ${
                            alert.status === "TRIGGERED"
                              ? "bg-green-100 text-green-700"
                              : alert.status === "ACTIVE"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {alert.status}
                        </span>
                      </div>
                      <h3 className="font-medium">{alert.title}</h3>
                      {alert.metadata?.quote?.subtitle && (
                        <p className="text-sm text-slate-600">{alert.metadata.quote.subtitle}</p>
                      )}
                      <div className="flex gap-4 mt-2 text-sm">
                        <span>
                          Target: <strong>{formatCurrency(alert.targetPrice, alert.currency)}</strong>
                        </span>
                        {alert.currentPrice && (
                          <span>
                            Last quoted:{" "}
                            <strong
                              className={
                                alert.currentPrice <= alert.targetPrice
                                  ? "text-green-600"
                                  : "text-slate-700"
                              }
                            >
                              {formatCurrency(alert.currentPrice, alert.currency)}
                            </strong>
                          </span>
                        )}
                      </div>
                      {alert.metadata?.latestCheck ? (
                        <p className="mt-2 text-sm text-slate-600">
                          {alert.metadata.latestCheck.detail} {alert.metadata.latestCheck.source} · {new Date(alert.metadata.latestCheck.at).toLocaleString()}
                        </p>
                      ) : alert.metadata?.quote ? (
                        <p className="mt-2 text-sm text-slate-600">
                          {alert.metadata.quote.source} · Quoted {new Date(alert.metadata.quote.checkedAt).toLocaleString()}
                        </p>
                      ) : (
                        <p className="mt-2 text-sm text-slate-600">Set a new alert from live search to track this trip.</p>
                      )}
                      {alert.triggeredAt && (
                        <p role="status" className="text-sm text-green-700 mt-1">
                          Target reached {formatDate(alert.triggeredAt)}
                          {alert.metadata?.emailStatus === "sent" && " · Email sent"}
                          {alert.metadata?.emailStatus === "failed" && " · Email unavailable"}
                        </p>
                      )}
                    </div>
                    {alert.status === "ACTIVE" && (
                      <div className="flex flex-wrap justify-end gap-2">
                        {alert.metadata?.quote && (
                          <Button size="sm" variant="outline" loading={checking === alert.id}
                            disabled={!!checking} onClick={() => updateAlert(alert.id, "POST")}>Check now</Button>
                        )}
                        <Button size="sm" variant="ghost" disabled={!!checking}
                          onClick={() => updateAlert(alert.id, "PATCH")}>Cancel</Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
