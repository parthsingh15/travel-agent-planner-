"use client";

import { useState } from "react";
import {
  Plane,
  Hotel,
  Search as SearchIcon,
  Bookmark,
  BookmarkCheck,
  Bell,
  Star,
  MapPin,
  Clock,
} from "lucide-react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import {
  PriceComparisonTable,
  type PriceComparison,
} from "@/components/travel/price-comparison";
import { formatCurrency } from "@/lib/utils";

type FlightOffer = {
  id: string;
  airline: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  duration: string;
  stops: number;
  cabinClass: string;
  aircraft: string;
  price: number;
  currency: string;
  seatsRemaining: number;
  comparison: PriceComparison;
};

type HotelOffer = {
  id: string;
  name: string;
  type: string;
  area: string;
  starRating: number;
  guestRating: number;
  reviewCount: number;
  nights: number;
  pricePerNight: number;
  totalPrice: number;
  currency: string;
  amenities: string[];
  distanceToCenterKm: number;
  freeCancellation: boolean;
  comparison: PriceComparison;
};

type Mode = "flights" | "hotels";

function isoInDays(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().split("T")[0];
}

function clockTime(iso: string) {
  return iso.slice(11, 16);
}

export default function SearchPage() {
  const [mode, setMode] = useState<Mode>("flights");

  const [origin, setOrigin] = useState("London (LHR)");
  const [destination, setDestination] = useState("Tokyo (HND)");
  const [departDate, setDepartDate] = useState(isoInDays(30));
  const [returnDate, setReturnDate] = useState(isoInDays(40));
  const [passengers, setPassengers] = useState(1);
  const [cabinClass, setCabinClass] = useState("economy");

  const [hotelDestination, setHotelDestination] = useState("Tokyo, Japan");
  const [checkIn, setCheckIn] = useState(isoInDays(30));
  const [checkOut, setCheckOut] = useState(isoInDays(37));
  const [guests, setGuests] = useState(2);

  const [flights, setFlights] = useState<FlightOffer[] | null>(null);
  const [hotels, setHotels] = useState<HotelOffer[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState("");

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const params =
        mode === "flights"
          ? new URLSearchParams({
              origin,
              destination,
              departDate,
              ...(returnDate ? { returnDate } : {}),
              passengers: String(passengers),
              cabinClass,
            })
          : new URLSearchParams({
              destination: hotelDestination,
              checkIn,
              checkOut,
              guests: String(guests),
            });

      const res = await fetch(`/api/search/${mode}?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");

      if (mode === "flights") {
        setFlights(data.offers);
        setHotels(null);
      } else {
        setHotels(data.offers);
        setFlights(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const saveBookmark = async (
    key: string,
    body: Record<string, unknown>
  ) => {
    try {
      const res = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      setSaved((prev) => ({ ...prev, [key]: true }));
      setNotice(data.alreadySaved ? "Already in your saved items" : "Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  };

  const createAlert = async (body: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/price-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create alert");
      setNotice("Price alert created");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create alert");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Search</h1>
          <p className="text-slate-600 mt-1">
            Compare flight and hotel prices across booking vendors.
          </p>
        </div>

        <div className="flex gap-2">
          {(["flights", "hotels"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === m
                  ? "bg-primary-600 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {m === "flights" ? (
                <Plane className="h-4 w-4" />
              ) : (
                <Hotel className="h-4 w-4" />
              )}
              {m === "flights" ? "Flights" : "Hotels"}
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="py-5">
            <form onSubmit={runSearch} className="grid gap-4 md:grid-cols-4">
              {mode === "flights" ? (
                <>
                  <Input
                    label="From"
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    required
                  />
                  <Input
                    label="To"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    required
                  />
                  <Input
                    label="Depart"
                    type="date"
                    value={departDate}
                    onChange={(e) => setDepartDate(e.target.value)}
                    required
                  />
                  <Input
                    label="Return"
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                  />
                  <Input
                    label="Passengers"
                    type="number"
                    min={1}
                    max={50}
                    value={passengers}
                    onChange={(e) => setPassengers(Number(e.target.value))}
                  />
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Cabin
                    </label>
                    <select
                      value={cabinClass}
                      onChange={(e) => setCabinClass(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="economy">Economy</option>
                      <option value="premium_economy">Premium economy</option>
                      <option value="business">Business</option>
                      <option value="first">First</option>
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <Input
                    label="Destination"
                    value={hotelDestination}
                    onChange={(e) => setHotelDestination(e.target.value)}
                    required
                  />
                  <Input
                    label="Check-in"
                    type="date"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    required
                  />
                  <Input
                    label="Check-out"
                    type="date"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    required
                  />
                  <Input
                    label="Guests"
                    type="number"
                    min={1}
                    max={50}
                    value={guests}
                    onChange={(e) => setGuests(Number(e.target.value))}
                  />
                </>
              )}

              <div className="flex items-end md:col-span-4">
                <Button type="submit" loading={loading}>
                  <SearchIcon className="h-4 w-4" />
                  Search {mode}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {notice && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
            {notice}
          </p>
        )}
        {error && <ErrorState message={error} />}
        {loading && <LoadingState message={`Searching ${mode}...`} />}

        {!loading && flights && flights.length === 0 && (
          <EmptyState
            title="No flights matched"
            description="Try different dates or a wider budget."
          />
        )}
        {!loading && hotels && hotels.length === 0 && (
          <EmptyState
            title="No hotels matched"
            description="Try different dates or a lower minimum rating."
          />
        )}

        {!loading && flights && flights.length > 0 && (
          <div className="space-y-4">
            {flights.map((offer) => {
              const key = `FLIGHT:${offer.id}`;
              return (
                <Card key={offer.id}>
                  <CardContent className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-[240px]">
                        <p className="font-semibold text-slate-900">
                          {offer.airline}{" "}
                          <span className="text-slate-400 font-normal">
                            {offer.flightNumber}
                          </span>
                        </p>
                        <p className="text-sm text-slate-600 mt-1">
                          {clockTime(offer.departure)} {offer.origin} →{" "}
                          {clockTime(offer.arrival)} {offer.destination}
                        </p>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {offer.duration}
                          </span>
                          <span>
                            {offer.stops === 0
                              ? "Non-stop"
                              : `${offer.stops} stop${offer.stops > 1 ? "s" : ""}`}
                          </span>
                          <span>{offer.aircraft}</span>
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-xl font-bold text-slate-900">
                          {formatCurrency(
                            offer.comparison.cheapestPrice,
                            offer.currency
                          )}
                        </p>
                        <p className="text-xs text-slate-500">
                          via {offer.comparison.cheapestVendor}
                        </p>
                        <p className="text-xs text-amber-600 mt-1">
                          {offer.seatsRemaining} seats left
                        </p>
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              saveBookmark(key, {
                                type: "FLIGHT",
                                title: `${offer.airline} ${offer.flightNumber}`,
                                subtitle: `${offer.origin} → ${offer.destination}`,
                                externalId: `${offer.flightNumber}-${offer.departure}`,
                                price: offer.comparison.cheapestPrice,
                                currency: offer.currency,
                                payload: offer as unknown as Record<string, unknown>,
                              })
                            }
                          >
                            {saved[key] ? (
                              <BookmarkCheck className="h-4 w-4" />
                            ) : (
                              <Bookmark className="h-4 w-4" />
                            )}
                            {saved[key] ? "Saved" : "Save"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              createAlert({
                                type: "FLIGHT",
                                title: `${offer.airline} ${offer.flightNumber} — ${offer.origin} → ${offer.destination}`,
                                targetPrice: Math.round(
                                  offer.comparison.cheapestPrice * 0.9
                                ),
                                currentPrice: offer.comparison.cheapestPrice,
                                currency: offer.currency,
                              })
                            }
                          >
                            <Bell className="h-4 w-4" />
                            Alert
                          </Button>
                        </div>
                      </div>
                    </div>

                    <PriceComparisonTable
                      comparison={offer.comparison}
                      label="vendor prices"
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {!loading && hotels && hotels.length > 0 && (
          <div className="space-y-4">
            {hotels.map((offer) => {
              const key = `STAY:${offer.id}`;
              return (
                <Card key={offer.id}>
                  <CardContent className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-[260px]">
                        <p className="font-semibold text-slate-900">
                          {offer.name}
                          <span className="ml-2 text-xs font-medium text-amber-600">
                            {"★".repeat(offer.starRating)}
                          </span>
                        </p>
                        <p className="text-sm text-slate-600 mt-1 flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {offer.area} · {offer.distanceToCenterKm} km from centre
                        </p>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                          <Star className="h-3 w-3 text-amber-500" />
                          {offer.guestRating}/10 ({offer.reviewCount} reviews)
                          {offer.freeCancellation && (
                            <span className="ml-2 text-green-600 font-medium">
                              Free cancellation
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500 mt-2">
                          {offer.amenities.join(" · ")}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-xl font-bold text-slate-900">
                          {formatCurrency(
                            offer.comparison.cheapestPrice,
                            offer.currency
                          )}
                        </p>
                        <p className="text-xs text-slate-500">
                          {offer.nights} nights · via {offer.comparison.cheapestVendor}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatCurrency(offer.pricePerNight, offer.currency)} / night
                        </p>
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              saveBookmark(key, {
                                type: "STAY",
                                title: offer.name,
                                subtitle: `${offer.area} · ${offer.nights} nights`,
                                externalId: `${offer.name}-${offer.area}-${offer.nights}`,
                                price: offer.comparison.cheapestPrice,
                                currency: offer.currency,
                                payload: offer as unknown as Record<string, unknown>,
                              })
                            }
                          >
                            {saved[key] ? (
                              <BookmarkCheck className="h-4 w-4" />
                            ) : (
                              <Bookmark className="h-4 w-4" />
                            )}
                            {saved[key] ? "Saved" : "Save"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              createAlert({
                                type: "STAY",
                                title: `${offer.name} — ${offer.area}`,
                                targetPrice: Math.round(
                                  offer.comparison.cheapestPrice * 0.9
                                ),
                                currentPrice: offer.comparison.cheapestPrice,
                                currency: offer.currency,
                              })
                            }
                          >
                            <Bell className="h-4 w-4" />
                            Alert
                          </Button>
                        </div>
                      </div>
                    </div>

                    <PriceComparisonTable
                      comparison={offer.comparison}
                      label="vendor prices"
                    />
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
