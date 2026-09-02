"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Bell, TrendingDown, Plus } from "lucide-react";

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
  trip?: { title: string; destination: string };
};

export default function PriceAlertsPage() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    type: "FLIGHT",
    title: "",
    targetPrice: "",
    currentPrice: "",
  });

  const fetchAlerts = async () => {
    setLoading(true);
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

  const checkPrices = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/price-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.triggered?.length > 0) {
        alert(`${data.triggered.length} price drop alert(s) triggered! Check your email.`);
      } else {
        alert("No price drops detected. Prices were updated.");
      }
      await fetchAlerts();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Check failed");
    } finally {
      setChecking(false);
    }
  };

  const createAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/price-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          title: form.title,
          targetPrice: parseFloat(form.targetPrice),
          currentPrice: form.currentPrice ? parseFloat(form.currentPrice) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm({ type: "FLIGHT", title: "", targetPrice: "", currentPrice: "" });
      setShowForm(false);
      await fetchAlerts();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create alert");
    } finally {
      setCreating(false);
    }
  };

  const cancelAlert = async (id: string) => {
    await fetch("/api/price-alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "CANCELLED" }),
    });
    await fetchAlerts();
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
              Get notified when flight, stay, or activity prices drop to your target
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={checkPrices} loading={checking}>
              <TrendingDown className="h-4 w-4" />
              Check Prices
            </Button>
            <Button onClick={() => setShowForm(!showForm)}>
              <Plus className="h-4 w-4" />
              New Alert
            </Button>
          </div>
        </div>

        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle>Create Price Alert</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={createAlert} className="space-y-4">
                <Select
                  label="Type"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <option value="FLIGHT">Flight</option>
                  <option value="STAY">Stay</option>
                  <option value="ACTIVITY">Activity</option>
                </Select>
                <Input
                  label="Title (e.g. JFK to Tokyo round-trip)"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Target Price (alert when below)"
                    type="number"
                    step="0.01"
                    required
                    value={form.targetPrice}
                    onChange={(e) => setForm({ ...form, targetPrice: e.target.value })}
                  />
                  <Input
                    label="Current Price (optional)"
                    type="number"
                    step="0.01"
                    value={form.currentPrice}
                    onChange={(e) => setForm({ ...form, currentPrice: e.target.value })}
                  />
                </div>
                <Button type="submit" loading={creating}>Create Alert</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchAlerts} />
        ) : alerts.length === 0 ? (
          <EmptyState
            title="No price alerts"
            description="Create alerts from agent recommendations or manually"
            action={<Button onClick={() => setShowForm(true)}>Create Alert</Button>}
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
                      <div className="flex gap-4 mt-2 text-sm">
                        <span>
                          Target: <strong>{formatCurrency(alert.targetPrice, alert.currency)}</strong>
                        </span>
                        {alert.currentPrice && (
                          <span>
                            Current:{" "}
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
                      {alert.triggeredAt && (
                        <p className="text-xs text-green-600 mt-1">
                          Triggered {formatDate(alert.triggeredAt)}
                        </p>
                      )}
                    </div>
                    {alert.status === "ACTIVE" && (
                      <Button size="sm" variant="ghost" onClick={() => cancelAlert(alert.id)}>
                        Cancel
                      </Button>
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
