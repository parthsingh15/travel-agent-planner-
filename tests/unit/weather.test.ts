import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDestinationWeather, describeWeatherCode } from "@/lib/services/weather";
import { clearGeocodeCache } from "@/lib/services/geocode";

const GEO_HIT = {
  results: [
    {
      name: "Paris",
      country: "France",
      country_code: "FR",
      latitude: 48.85341,
      longitude: 2.3488,
      timezone: "Europe/Paris",
    },
  ],
};

function dailyPayload(dates: string[]) {
  return {
    daily: {
      time: dates,
      weather_code: dates.map(() => 61),
      temperature_2m_max: dates.map(() => 22),
      temperature_2m_min: dates.map(() => 12),
      precipitation_sum: dates.map(() => 4),
      wind_speed_10m_max: dates.map(() => 15),
    },
  };
}

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function isoInDays(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().split("T")[0];
}

describe("weather service", () => {
  beforeEach(() => clearGeocodeCache());
  afterEach(() => vi.unstubAllGlobals());

  it("maps WMO codes to human descriptions", () => {
    expect(describeWeatherCode(0)).toBe("Clear sky");
    expect(describeWeatherCode(95)).toBe("Thunderstorm");
    expect(describeWeatherCode(1234)).toBe("Unsettled");
  });

  it("uses the live forecast for near-term dates", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url.includes("geocoding-api")) return jsonResponse(GEO_HIT);
        return jsonResponse(dailyPayload([isoInDays(3), isoInDays(4)]));
      })
    );

    const report = await getDestinationWeather(
      "Paris, France",
      isoInDays(3),
      isoInDays(4)
    );

    expect(report?.source).toBe("forecast");
    expect(report?.days).toHaveLength(2);
    expect(report?.location.name).toBe("Paris");
    expect(urls.some((u) => u.includes("api.open-meteo.com/v1/forecast"))).toBe(true);
    expect(report?.summary).toMatch(/^Forecast:/);
  });

  it("falls back to last year's readings beyond the forecast horizon", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url.includes("geocoding-api")) return jsonResponse(GEO_HIT);
        return jsonResponse(dailyPayload(["2029-07-01", "2029-07-02"]));
      })
    );

    const report = await getDestinationWeather(
      "Paris, France",
      "2030-07-01",
      "2030-07-02"
    );

    expect(report?.source).toBe("seasonal-average");
    expect(report?.referenceYear).toBe(2029);
    expect(urls.some((u) => u.includes("archive-api"))).toBe(true);
    // Archive rows carry last year's dates; they must be relabelled to the trip.
    expect(report?.days.map((d) => d.date)).toEqual(["2030-07-01", "2030-07-02"]);
    expect(report?.summary).toMatch(/^Typical conditions/);
  });

  it("returns null when the destination cannot be geocoded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ results: [] })));
    expect(await getDestinationWeather("Xyzzy", isoInDays(2), isoInDays(3))).toBeNull();
  });

  it("returns null rather than throwing when the upstream API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("geocoding-api")) return jsonResponse(GEO_HIT);
        return { ok: false, status: 503, json: async () => ({}) } as Response;
      })
    );

    expect(
      await getDestinationWeather("Paris", isoInDays(2), isoInDays(3))
    ).toBeNull();
  });

  it("counts wet days in the summary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("geocoding-api")) return jsonResponse(GEO_HIT);
        return jsonResponse(dailyPayload([isoInDays(1), isoInDays(2), isoInDays(3)]));
      })
    );

    const report = await getDestinationWeather("Paris", isoInDays(1), isoInDays(3));
    expect(report?.summary).toContain("3 of 3 days with rain");
  });
});
