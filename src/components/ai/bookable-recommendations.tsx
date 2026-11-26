"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DEFAULT_CURRENCY, formatCurrency } from "@/lib/utils";
import { Ticket, Bell } from "lucide-react";

type BookableItem = {
  id: string;
  type: "FLIGHT" | "STAY" | "ACTIVITY";
  title: string;
  subtitle?: string;
  price: number;
  currency: string;
  metadata?: Record<string, unknown>;
};

export function BookableRecommendations({
  generation,
  tripId,
  currency = DEFAULT_CURRENCY,
}: {
  generation: Record<string, unknown>;
  tripId: string;
  currency?: string;
}) {
  const items: BookableItem[] = [];

  const flights = generation.flightsOutput as {
    flights?: Array<{
      id: string;
      airline: string;
      flightNumber: string;
      origin: string;
      destination: string;
      price: number;
      currency?: string;
    }>;
  } | null;

  flights?.flights?.forEach((f) => {
    items.push({
      id: f.id,
      type: "FLIGHT",
      title: `${f.airline} ${f.flightNumber}`,
      subtitle: `${f.origin} → ${f.destination}`,
      price: f.price,
      currency: f.currency || currency,
      metadata: f as unknown as Record<string, unknown>,
    });
  });

  const stays = generation.staysOutput as {
    stays?: Array<{
      id: string;
      name: string;
      area: string;
      totalPrice: number;
      currency?: string;
      nights: number;
    }>;
  } | null;

  stays?.stays?.forEach((s) => {
    items.push({
      id: s.id,
      type: "STAY",
      title: s.name,
      subtitle: `${s.area} · ${s.nights} nights`,
      price: s.totalPrice,
      currency: s.currency || currency,
      metadata: s as unknown as Record<string, unknown>,
    });
  });

  const activities = generation.activitiesOutput as {
    activities?: Array<{
      id?: string;
      name: string;
      duration: string;
      cost: number;
      category: string;
    }>;
  } | null;

  activities?.activities?.forEach((a, i) => {
    items.push({
      id: a.id || `act-${i}`,
      type: "ACTIVITY",
      title: a.name,
      subtitle: `${a.duration} · ${a.category}`,
      price: a.cost,
      currency,
      metadata: a as unknown as Record<string, unknown>,
    });
  });

  const handleBook = async (item: BookableItem) => {
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tripId,
        type: item.type,
        title: item.title,
        description: item.subtitle,
        amount: item.price,
        currency: item.currency,
        metadata: item.metadata,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      alert(`Draft saved. Use Search to find a live provider offer.`);
      window.location.href = "/bookings";
    } else {
      alert(data.error || "Booking failed");
    }
  };

  const handlePriceAlert = async (item: BookableItem) => {
    const targetPrice = prompt(
      `Set target price for "${item.title}" (current: ${formatCurrency(item.price, item.currency)}):`,
      String(Math.round(item.price * 0.9))
    );
    if (!targetPrice) return;

    const res = await fetch("/api/price-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tripId,
        type: item.type,
        title: item.title,
        targetPrice: parseFloat(targetPrice),
        currentPrice: item.price,
        currency: item.currency,
        metadata: item.metadata,
      }),
    });
    if (res.ok) {
      alert("Recommendation saved. Set an alert on a live search result to track current quotes.");
    } else {
      const data = await res.json();
      alert(data.error || "Failed to create alert");
    }
  };

  if (items.length === 0) {
    return (
      <p className="text-slate-500 text-center py-8">
        Bookable recommendations appear after Flights, Stays, and Activities agents complete.
      </p>
    );
  }

  const supervisor = generation.supervisorOutput as {
    recommendedBundle?: {
      flightId?: string;
      stayId?: string;
      activityIds?: string[];
      totalEstimatedCost?: number;
    };
    supervisorScore?: number;
  } | null;

  return (
    <div className="space-y-4">
      {supervisor?.recommendedBundle && (
        <Card className="border-primary-200 bg-primary-50">
          <CardContent className="py-4">
            <p className="font-semibold text-primary-800">
              Supervisor Recommended Bundle
              {supervisor.supervisorScore && ` — Score: ${supervisor.supervisorScore}/100`}
            </p>
            {supervisor.recommendedBundle.totalEstimatedCost && (
              <p className="text-sm text-primary-700 mt-1">
                Estimated total: {formatCurrency(supervisor.recommendedBundle.totalEstimatedCost, currency)}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {items.map((item) => {
        const isRecommended =
          supervisor?.recommendedBundle?.flightId === item.id ||
          supervisor?.recommendedBundle?.stayId === item.id ||
          supervisor?.recommendedBundle?.activityIds?.includes(item.id);

        return (
          <Card key={`${item.type}-${item.id}`} className={isRecommended ? "border-primary-300" : ""}>
            <CardContent className="py-4">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 text-xs font-medium rounded bg-slate-100">
                      {item.type}
                    </span>
                    {isRecommended && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded bg-primary-100 text-primary-700">
                        Supervisor Pick
                      </span>
                    )}
                  </div>
                  <h4 className="font-semibold">{item.title}</h4>
                  {item.subtitle && (
                    <p className="text-sm text-slate-600">{item.subtitle}</p>
                  )}
                  <p className="text-sm font-medium mt-1">
                    {formatCurrency(item.price, item.currency)}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Button size="sm" onClick={() => handleBook(item)}>
                    <Ticket className="h-3 w-3" />
                    Book
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handlePriceAlert(item)}>
                    <Bell className="h-3 w-3" />
                    Price Alert
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
