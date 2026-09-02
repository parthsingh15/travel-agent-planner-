"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Bookmark as BookmarkIcon,
  Plane,
  Hotel,
  Ticket,
  UtensilsCrossed,
  MapPin,
  CalendarDays,
  Trash2,
} from "lucide-react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { formatCurrency, formatDate } from "@/lib/utils";

type Bookmark = {
  id: string;
  type: "FLIGHT" | "STAY" | "ACTIVITY" | "RESTAURANT" | "PLACE" | "ITINERARY";
  title: string;
  subtitle?: string | null;
  price?: number | null;
  currency: string;
  notes?: string | null;
  createdAt: string;
  trip?: { id: string; title: string; destination: string } | null;
  version?: { id: string; versionNumber: number; title: string } | null;
};

const TYPE_META = {
  FLIGHT: { label: "Flights", icon: Plane },
  STAY: { label: "Hotels", icon: Hotel },
  ACTIVITY: { label: "Activities", icon: Ticket },
  RESTAURANT: { label: "Restaurants", icon: UtensilsCrossed },
  PLACE: { label: "Places", icon: MapPin },
  ITINERARY: { label: "Itineraries", icon: CalendarDays },
} as const;

type BookmarkType = keyof typeof TYPE_META;
type Filter = "ALL" | BookmarkType;

const FILTERS: Filter[] = [
  "ALL",
  ...(Object.keys(TYPE_META) as BookmarkType[]),
];

export default function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/bookmarks");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load saved items");
      setBookmarks(data.bookmarks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load saved items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/bookmarks/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Could not remove");
      }
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove");
    } finally {
      setDeleting(null);
    }
  };

  const visible =
    filter === "ALL" ? bookmarks : bookmarks.filter((b) => b.type === filter);

  const countFor = (type: Filter) =>
    type === "ALL"
      ? bookmarks.length
      : bookmarks.filter((b) => b.type === type).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Saved items</h1>
          <p className="text-slate-600 mt-1">
            Flights, hotels, places and itineraries you bookmarked.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-primary-600 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {f === "ALL" ? "All" : TYPE_META[f].label}
              <span className="ml-1.5 opacity-70">{countFor(f)}</span>
            </button>
          ))}
        </div>

        {loading && <LoadingState message="Loading saved items..." />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && visible.length === 0 && (
          <EmptyState
            title="Nothing saved yet"
            description="Save flights and hotels from the Search page, or bookmark an itinerary from a trip."
            action={
              <Link href="/search">
                <Button>Go to search</Button>
              </Link>
            }
          />
        )}

        {!loading && !error && visible.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {visible.map((bookmark) => {
              const Icon = TYPE_META[bookmark.type].icon;
              return (
                <Card key={bookmark.id}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex gap-3 min-w-0">
                        <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">
                            {bookmark.title}
                          </p>
                          {bookmark.subtitle && (
                            <p className="text-sm text-slate-600 truncate">
                              {bookmark.subtitle}
                            </p>
                          )}
                          <p className="text-xs text-slate-400 mt-1">
                            Saved {formatDate(bookmark.createdAt)}
                          </p>
                          {bookmark.trip && (
                            <Link
                              href={`/trips/${bookmark.trip.id}`}
                              className="text-xs text-primary-600 hover:underline"
                            >
                              {bookmark.trip.title}
                            </Link>
                          )}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        {typeof bookmark.price === "number" && (
                          <p className="font-semibold text-slate-900">
                            {formatCurrency(bookmark.price, bookmark.currency)}
                          </p>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-2 text-red-600 hover:bg-red-50"
                          loading={deleting === bookmark.id}
                          onClick={() => remove(bookmark.id)}
                          aria-label={`Remove ${bookmark.title}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {!loading && !error && bookmarks.length > 0 && (
          <p className="text-xs text-slate-400 flex items-center gap-1">
            <BookmarkIcon className="h-3 w-3" />
            {bookmarks.length} saved item{bookmarks.length === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </DashboardLayout>
  );
}
