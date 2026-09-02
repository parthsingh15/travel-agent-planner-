/**
 * Destination weather via the Open-Meteo forecast and archive APIs.
 *
 * Open-Meteo forecasts run ~16 days out. Trips are routinely planned further
 * ahead than that, so for distant dates we fall back to last year's recorded
 * weather for the same calendar days and label it as a seasonal expectation
 * rather than passing it off as a forecast.
 */
import { geocodeDestination, type GeoLocation } from "./geocode";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const FORECAST_HORIZON_DAYS = 16;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DailyWeather = {
  date: string;
  weatherCode: number;
  description: string;
  maxTempC: number;
  minTempC: number;
  precipitationMm: number;
  precipitationChance: number | null;
  windSpeedKph: number | null;
};

export type WeatherReport = {
  location: GeoLocation;
  source: "forecast" | "seasonal-average";
  /** Set when `source` is "seasonal-average": the year the readings came from. */
  referenceYear?: number;
  days: DailyWeather[];
  summary: string;
};

/** WMO weather interpretation codes used by Open-Meteo. */
const WMO_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snowfall",
  73: "Moderate snowfall",
  75: "Heavy snowfall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

export function describeWeatherCode(code: number): string {
  return WMO_CODES[code] ?? "Unsettled";
}

function toIsoDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function shiftYear(isoDate: string, years: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return toIsoDate(date);
}

/** Open-Meteo caps a request at 16 days; clamp long trips to that window. */
function clampRange(startDate: string, endDate: string, maxDays: number) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const spanDays = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;

  if (spanDays <= maxDays) return { start: startDate, end: endDate };

  const clamped = new Date(start.getTime() + (maxDays - 1) * MS_PER_DAY);
  return { start: startDate, end: toIsoDate(clamped) };
}

type DailyPayload = {
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
    precipitation_probability_max?: (number | null)[];
    wind_speed_10m_max?: (number | null)[];
  };
};

function mapDays(payload: DailyPayload, relabelYear?: number): DailyWeather[] {
  const daily = payload.daily;
  if (!daily?.time?.length) return [];

  return daily.time.map((date, i) => {
    const code = daily.weather_code?.[i] ?? 0;
    return {
      // Archive readings carry last year's dates; restore the trip's own dates.
      date: relabelYear
        ? `${relabelYear}${date.slice(4)}`
        : date,
      weatherCode: code,
      description: describeWeatherCode(code),
      maxTempC: daily.temperature_2m_max?.[i] ?? 0,
      minTempC: daily.temperature_2m_min?.[i] ?? 0,
      precipitationMm: daily.precipitation_sum?.[i] ?? 0,
      precipitationChance: daily.precipitation_probability_max?.[i] ?? null,
      windSpeedKph: daily.wind_speed_10m_max?.[i] ?? null,
    };
  });
}

function summarise(days: DailyWeather[], source: WeatherReport["source"]): string {
  if (!days.length) return "No weather data available for these dates.";

  const avgMax = days.reduce((s, d) => s + d.maxTempC, 0) / days.length;
  const avgMin = days.reduce((s, d) => s + d.minTempC, 0) / days.length;
  const wetDays = days.filter((d) => d.precipitationMm >= 1).length;

  const lead =
    source === "forecast"
      ? "Forecast"
      : "Typical conditions for these dates";

  const rain =
    wetDays === 0
      ? "no significant rain expected"
      : `${wetDays} of ${days.length} days with rain`;

  return `${lead}: highs around ${Math.round(avgMax)}°C, lows around ${Math.round(
    avgMin
  )}°C, ${rain}.`;
}

async function fetchDaily(
  url: string,
  params: Record<string, string>
): Promise<DailyPayload | null> {
  const query = new URLSearchParams({
    ...params,
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
    timezone: "auto",
  });

  try {
    const response = await fetch(`${url}?${query}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.error("[weather] upstream error", response.status);
      return null;
    }
    return (await response.json()) as DailyPayload;
  } catch (error) {
    console.error("[weather] fetch failed:", error);
    return null;
  }
}

export async function getDestinationWeather(
  destination: string,
  startDate: string,
  endDate: string
): Promise<WeatherReport | null> {
  const location = await geocodeDestination(destination);
  if (!location) return null;

  const coords = {
    latitude: String(location.latitude),
    longitude: String(location.longitude),
  };

  const daysUntilStart = Math.floor(
    (new Date(`${startDate}T00:00:00Z`).getTime() - Date.now()) / MS_PER_DAY
  );
  const withinForecast = daysUntilStart <= FORECAST_HORIZON_DAYS;

  if (withinForecast) {
    const range = clampRange(startDate, endDate, FORECAST_HORIZON_DAYS);
    const payload = await fetchDaily(FORECAST_URL, {
      ...coords,
      start_date: range.start,
      end_date: range.end,
    });

    const days = payload ? mapDays(payload) : [];
    if (days.length) {
      return {
        location,
        source: "forecast",
        days,
        summary: summarise(days, "forecast"),
      };
    }
  }

  // Too far out to forecast (or the forecast call failed): use last year's
  // recorded weather for the same calendar dates as a seasonal expectation.
  const referenceYear = new Date(`${startDate}T00:00:00Z`).getUTCFullYear() - 1;
  const payload = await fetchDaily(ARCHIVE_URL, {
    ...coords,
    start_date: shiftYear(startDate, -1),
    end_date: shiftYear(endDate, -1),
  });

  const tripYear = new Date(`${startDate}T00:00:00Z`).getUTCFullYear();
  const days = payload ? mapDays(payload, tripYear) : [];
  if (!days.length) return null;

  return {
    location,
    source: "seasonal-average",
    referenceYear,
    days,
    summary: summarise(days, "seasonal-average"),
  };
}
