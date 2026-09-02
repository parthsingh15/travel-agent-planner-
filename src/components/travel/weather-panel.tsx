"use client";

import { useEffect, useState } from "react";
import { CloudRain, CloudSun, Droplets, Wind } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";

type DailyWeather = {
  date: string;
  weatherCode: number;
  description: string;
  maxTempC: number;
  minTempC: number;
  precipitationMm: number;
  precipitationChance: number | null;
  windSpeedKph: number | null;
};

type WeatherReport = {
  source: "forecast" | "seasonal-average";
  referenceYear?: number;
  summary: string;
  days: DailyWeather[];
  location: { name: string; country: string };
};

function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 57) return "🌦️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌧️";
  if (code <= 86) return "🌨️";
  return "⛈️";
}

function shortDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

export function WeatherPanel({ tripId }: { tripId: string }) {
  const [report, setReport] = useState<WeatherReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetch(`/api/weather?tripId=${encodeURIComponent(tripId)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Weather unavailable");
        if (!cancelled) setReport(data.weather);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [tripId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CloudSun className="h-5 w-5 text-primary-600" />
          Weather
          {report && (
            <span
              className={`ml-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                report.source === "forecast"
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {report.source === "forecast"
                ? "Live forecast"
                : `Seasonal average${
                    report.referenceYear ? ` (${report.referenceYear})` : ""
                  }`}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && <LoadingState message="Checking the forecast..." />}
        {!loading && error && <ErrorState message={error} />}
        {!loading && !error && report && report.days.length === 0 && (
          <EmptyState title="No weather data for these dates" />
        )}
        {!loading && !error && report && report.days.length > 0 && (
          <>
            <p className="text-sm text-slate-600 mb-4">{report.summary}</p>
            {report.source === "seasonal-average" && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                These dates are beyond the 16-day forecast horizon. Showing what
                the weather actually did on the same dates last year.
              </p>
            )}
            <div className="flex gap-3 overflow-x-auto pb-2">
              {report.days.map((day) => (
                <div
                  key={day.date}
                  className="min-w-[132px] flex-shrink-0 rounded-lg border border-slate-200 p-3 text-center"
                >
                  <p className="text-xs font-medium text-slate-500">
                    {shortDate(day.date)}
                  </p>
                  <p className="text-3xl my-1.5" aria-hidden="true">
                    {weatherEmoji(day.weatherCode)}
                  </p>
                  <p className="text-sm font-semibold text-slate-900">
                    {Math.round(day.maxTempC)}°
                    <span className="text-slate-400 font-normal">
                      {" / "}
                      {Math.round(day.minTempC)}°
                    </span>
                  </p>
                  <p className="text-xs text-slate-600 mt-1 leading-tight">
                    {day.description}
                  </p>
                  <div className="mt-2 space-y-0.5 text-[11px] text-slate-500">
                    {day.precipitationMm > 0 && (
                      <p className="flex items-center justify-center gap-1">
                        <Droplets className="h-3 w-3" />
                        {day.precipitationMm.toFixed(1)} mm
                      </p>
                    )}
                    {day.windSpeedKph !== null && (
                      <p className="flex items-center justify-center gap-1">
                        <Wind className="h-3 w-3" />
                        {Math.round(day.windSpeedKph)} km/h
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-3 flex items-center gap-1">
              <CloudRain className="h-3 w-3" />
              Data from Open-Meteo
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
