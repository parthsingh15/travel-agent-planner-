"use client";

import { useEffect, useRef, useState } from "react";
import { Plane, Hotel, Search as SearchIcon } from "lucide-react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { formatCurrency } from "@/lib/utils";

type Mode = "flights" | "hotels";
type Offer = {
  id: string;
  type: "FLIGHT" | "STAY";
  title: string;
  subtitle: string;
  price: number;
  currency: string;
  source: string;
  checkedAt: string;
  token: string;
  bookable: boolean;
};
type Selection = { label: string; token: string };
type Results = { offers: Offer[]; selections?: Selection[] };
type Booking = Pick<Offer, "price" | "currency" | "source" | "checkedAt" | "token">;

function isoInDays(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().split("T")[0];
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error("Could not reach Travel Planner. Check your connection and try again.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error ?? "Travel Planner could not complete the request.");
  return data;
}

function post<T>(url: string, body: object) {
  return api<T>(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

function QuotePrice({ quote }: { quote: Pick<Offer, "price" | "currency" | "source" | "checkedAt"> }) {
  return (
    <div>
      <p className="text-xl font-semibold">{formatCurrency(quote.price, quote.currency)} {quote.currency}</p>
      <p className="text-xs text-slate-600">{quote.source} · Checked {new Date(quote.checkedAt).toLocaleString()}</p>
    </div>
  );
}

function ResultCard({ offer, saved, onSave }: {
  offer: Offer; saved: boolean; onSave: () => void;
}) {
  const [target, setTarget] = useState("");
  const [showAlert, setShowAlert] = useState(false);
  const [booking, setBooking] = useState<Booking>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function continueBooking() {
    if (!booking) return;
    const handoff = await post<{ url: string; postData?: string }>("/api/bookings/handoff", {
      action: "continue", token: booking.token,
    });
    if (!handoff.postData) {
      window.location.assign(handoff.url);
      return;
    }
    const form = document.createElement("form");
    form.method = "post";
    form.action = handoff.url;
    for (const [name, value] of new URLSearchParams(handoff.postData)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.append(input);
    }
    document.body.append(form);
    HTMLFormElement.prototype.submit.call(form);
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <h2 className="font-semibold">{offer.title}</h2>
            <p className="text-sm text-slate-600">{offer.subtitle}</p>
          </div>
          <QuotePrice quote={offer} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy || saved} onClick={() => act(async () => {
            const { alreadySaved } = await post<{ alreadySaved: boolean }>("/api/bookmarks", {
              token: offer.token,
            });
            onSave();
            setMessage(alreadySaved ? "Already in Saved items." : "Saved.");
          })}>{saved ? "Saved" : "Save"}</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setShowAlert(!showAlert)}>
            Create Alert
          </Button>
          {offer.bookable && <Button size="sm" disabled={busy} onClick={() => act(async () => {
            setBooking(await post<Booking>("/api/bookings/handoff", { action: "lookup", token: offer.token }));
          })}>Check booking availability</Button>}
        </div>
        {showAlert && (
          <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
            event.preventDefault();
            void act(async () => {
              await post("/api/price-alerts", { token: offer.token, targetPrice: Number(target) });
              setShowAlert(false);
              setMessage("Price alert created.");
            });
          }}>
            <Input label={`Target price (${offer.currency})`} type="number" min="0.01" step="0.01"
              required value={target} onChange={(event) => setTarget(event.target.value)} />
            <Button type="submit" size="sm" disabled={busy}>Set alert</Button>
          </form>
        )}
        {booking && (
          <div className="space-y-2 border-t pt-3">
            <QuotePrice quote={booking} />
            <Button size="sm" disabled={busy} onClick={() => act(continueBooking)}>Continue to provider</Button>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="text-sm text-green-700">{message}</p>}
      </CardContent>
    </Card>
  );
}

export default function SearchPage() {
  const [mode, setMode] = useState<Mode>("flights");
  const [origin, setOrigin] = useState("DEL");
  const [destination, setDestination] = useState("BOM");
  const [departDate, setDepartDate] = useState(isoInDays(30));
  const [returnDate, setReturnDate] = useState("");
  const [passengers, setPassengers] = useState(1);
  const [cabinClass, setCabinClass] = useState("economy");
  const [hotelDestination, setHotelDestination] = useState("Mumbai, India");
  const [checkIn, setCheckIn] = useState(isoInDays(30));
  const [checkOut, setCheckOut] = useState(isoInDays(33));
  const [guests, setGuests] = useState(2);
  const [results, setResults] = useState<Results>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const active = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api<{ bookmarks: { externalId: string }[] }>("/api/bookmarks", { signal: controller.signal })
      .then(({ bookmarks }) => setSaved((prev) => [...prev, ...bookmarks.map((item) => item.externalId)]))
      .catch(() => {});
    return () => {
      controller.abort();
      active.current?.abort();
    };
  }, []);

  function switchMode(next: Mode) {
    if (next === mode) return;
    active.current?.abort();
    setMode(next);
    setResults(undefined);
    setError("");
    setLoading(false);
  }

  async function search(outbound?: string) {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setError("");
    setResults(undefined);
    const params = mode === "flights"
      ? { origin, destination, departDate, ...(returnDate ? { returnDate } : {}),
          passengers: String(passengers), cabinClass, ...(outbound ? { outbound } : {}) }
      : { destination: hotelDestination, checkIn, checkOut, guests: String(guests) };
    const query = new URLSearchParams(params as Record<string, string>);
    try {
      const data = await api<Results>(`/api/search/${mode}?${query}`, { signal: controller.signal });
      if (!controller.signal.aborted) setResults(data);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  const runSearch = (event: React.FormEvent) => {
    event.preventDefault();
    void search();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">Search travel</h1>
          <div className="flex gap-4 text-sm text-primary-700">
            <Link href="/bookmarks">Saved items</Link>
            <Link href="/price-alerts">Price alerts</Link>
            <Link href="/bookings">Booking history</Link>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant={mode === "flights" ? "primary" : "outline"} onClick={() => switchMode("flights")}>
            <Plane className="h-4 w-4" /> Flights
          </Button>
          <Button variant={mode === "hotels" ? "primary" : "outline"} onClick={() => switchMode("hotels")}>
            <Hotel className="h-4 w-4" /> Hotels
          </Button>
        </div>
        <Card>
          <CardContent className="py-5">
            <form onSubmit={runSearch} className="grid gap-4 md:grid-cols-4">
              {mode === "flights" ? (
                <>
                  <Input
                    label="From (airport code)"
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    required
                  />
                  <Input
                    label="To (airport code)"
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
                    max={9}
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
                    label="Adults (one room)"
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

        {error && <ErrorState message={error} />}
        {loading && <LoadingState message={`Searching ${mode}…`} />}
        {results && !results.offers.length && !results.selections?.length && (
          <EmptyState title={`No ${mode} matched`} description="Try different dates or destinations." />
        )}
        {!!results?.selections?.length && (
          <div className="space-y-2">
            <h2 className="font-semibold">Choose an outbound flight to see round-trip quotes</h2>
            {results.selections.map((selection) => (
              <div key={selection.token}>
                <Button variant="outline" onClick={() => search(selection.token)}>{selection.label}</Button>
              </div>
            ))}
          </div>
        )}
        {results?.offers.map((offer) => (
          <ResultCard key={offer.id} offer={offer} saved={saved.includes(offer.id)}
            onSave={() => setSaved((prev) => [...prev, offer.id])} />
        ))}
      </div>
    </DashboardLayout>
  );
}
