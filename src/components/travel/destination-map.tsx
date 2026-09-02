"use client";

import { useEffect, useState } from "react";
import { ExternalLink, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState, ErrorState } from "@/components/ui/states";

type Coordinates = { latitude: number; longitude: number; label: string };

/**
 * OpenStreetMap embed. Deliberately an iframe rather than a JS mapping
 * library: it needs no API key, no bundle weight, and no tile-usage account.
 */
export function DestinationMap({
  destination,
  points = [],
  height = 320,
}: {
  destination: string;
  points?: Coordinates[];
  height?: number;
}) {
  const [center, setCenter] = useState<Coordinates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetch(`/api/geocode?destination=${encodeURIComponent(destination)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not locate destination");
        if (cancelled) return;
        setCenter({
          latitude: data.location.latitude,
          longitude: data.location.longitude,
          label: [data.location.name, data.location.country]
            .filter(Boolean)
            .join(", "),
        });
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [destination]);

  const marker = points[0] ?? center;

  return (
    <Card>
      <CardHeader className="flex items-center justify-between flex-row">
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary-600" />
          Location
        </CardTitle>
        {center && (
          <a
            href={`https://www.openstreetmap.org/?mlat=${center.latitude}&mlon=${center.longitude}#map=12/${center.latitude}/${center.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary-600 hover:underline inline-flex items-center gap-1"
          >
            Open larger map
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {loading && <LoadingState message="Locating destination..." />}
        {!loading && error && <ErrorState message={error} />}
        {!loading && !error && center && marker && (
          <div>
            <iframe
              title={`Map of ${center.label}`}
              className="w-full rounded-b-xl border-0"
              style={{ height }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${
                center.longitude - 0.12
              }%2C${center.latitude - 0.06}%2C${center.longitude + 0.12}%2C${
                center.latitude + 0.06
              }&layer=mapnik&marker=${marker.latitude}%2C${marker.longitude}`}
            />
            <p className="px-6 py-3 text-sm text-slate-600">{center.label}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
