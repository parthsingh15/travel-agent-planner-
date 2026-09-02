"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_CURRENCY } from "@/lib/utils";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TRAVEL_STYLES = [
  "BUDGET", "MID_RANGE", "LUXURY", "ADVENTURE", "RELAXATION", "CULTURAL",
];

/** Common Indian origin/destination cities, offered as datalist suggestions. */
const INDIAN_CITIES = [
  "Delhi", "Mumbai", "Bengaluru", "Chennai", "Kolkata", "Hyderabad", "Pune",
  "Jaipur", "Agra", "Udaipur", "Jodhpur", "Jaisalmer", "Varanasi", "Amritsar",
  "Rishikesh", "Manali", "Shimla", "Leh", "Srinagar", "Dharamshala",
  "Goa", "Kochi", "Munnar", "Alleppey", "Ooty", "Mysuru", "Hampi",
  "Darjeeling", "Gangtok", "Shillong", "Puri", "Ahmedabad", "Lucknow",
];

export default function NewTripPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [interestsInput, setInterestsInput] = useState("");
  const [form, setForm] = useState({
    title: "",
    destination: "",
    origin: "",
    startDate: "",
    endDate: "",
    budget: "",
    currency: DEFAULT_CURRENCY,
    travelers: "1",
    travelStyle: "MID_RANGE",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const interests = interestsInput
        .split(",")
        .map((i) => i.trim())
        .filter(Boolean);

      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          budget: parseFloat(form.budget),
          travelers: parseInt(form.travelers, 10),
          interests,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      router.push(`/trips/${data.trip.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trip");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Create New Trip</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>
              )}
              <Input
                label="Trip Title"
                required
                placeholder="Summer in Paris"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
              <Input
                label="Destination"
                required
                list="indian-cities"
                placeholder="Jaipur"
                value={form.destination}
                onChange={(e) => setForm({ ...form, destination: e.target.value })}
              />
              <Input
                label="Starting city"
                list="indian-cities"
                placeholder="Delhi"
                value={form.origin}
                onChange={(e) => setForm({ ...form, origin: e.target.value })}
              />
              <datalist id="indian-cities">
                {INDIAN_CITIES.map((city) => (
                  <option key={city} value={city} />
                ))}
              </datalist>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Start Date"
                  type="date"
                  required
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
                <Input
                  label="End Date"
                  type="date"
                  required
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Total budget (₹)"
                  type="number"
                  required
                  min="1"
                  value={form.budget}
                  onChange={(e) => setForm({ ...form, budget: e.target.value })}
                />
                <Select
                  label="Currency"
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                >
                  <option value="INR">₹ INR</option>
                  <option value="USD">$ USD</option>
                  <option value="EUR">€ EUR</option>
                  <option value="GBP">£ GBP</option>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Travelers"
                  type="number"
                  required
                  min="1"
                  max="50"
                  value={form.travelers}
                  onChange={(e) => setForm({ ...form, travelers: e.target.value })}
                />
                <Select
                  label="Travel Style"
                  value={form.travelStyle}
                  onChange={(e) => setForm({ ...form, travelStyle: e.target.value })}
                >
                  {TRAVEL_STYLES.map((style) => (
                    <option key={style} value={style}>
                      {style.replace("_", " ")}
                    </option>
                  ))}
                </Select>
              </div>
              <Input
                label="Interests (comma-separated)"
                placeholder="museums, food, hiking, nightlife"
                value={interestsInput}
                onChange={(e) => setInterestsInput(e.target.value)}
              />
              <Textarea
                label="Notes"
                rows={3}
                placeholder="Any special requirements or preferences..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
              <div className="flex gap-3 pt-2">
                <Button type="submit" loading={loading}>
                  Create Trip
                </Button>
                <Button type="button" variant="outline" onClick={() => router.back()}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
