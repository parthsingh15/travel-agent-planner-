import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { Map, Bookmark, Plus } from "lucide-react";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;

  const [trips, savedCount, recentTrips] = await Promise.all([
    prisma.trip.count({ where: { userId: session.id } }),
    prisma.savedItinerary.count({ where: { userId: session.id } }),
    prisma.trip.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        versions: { orderBy: { versionNumber: "desc" }, take: 1 },
      },
    }),
  ]);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Welcome back, {session.name}!</h1>
            <p className="text-slate-600 mt-1">Manage your trips and itineraries</p>
          </div>
          <Link href="/trips/new">
            <Button>
              <Plus className="h-4 w-4" />
              New Trip
            </Button>
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { label: "Total Trips", value: trips, icon: Map, color: "text-blue-600 bg-blue-50" },
            { label: "Saved Itineraries", value: savedCount, icon: Bookmark, color: "text-green-600 bg-green-50" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${stat.color}`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">{stat.label}</p>
                    <p className="text-2xl font-bold">{stat.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Trips</CardTitle>
          </CardHeader>
          <CardContent>
            {recentTrips.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p>No trips yet. Create your first trip to get started!</p>
                <Link href="/trips/new">
                  <Button className="mt-4">Create Trip</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recentTrips.map((trip) => (
                  <Link
                    key={trip.id}
                    href={`/trips/${trip.id}`}
                    className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    <div>
                      <p className="font-medium">{trip.title}</p>
                      <p className="text-sm text-slate-600">
                        {trip.destination} &middot; {formatDate(trip.startDate)} - {formatDate(trip.endDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="inline-block px-2 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-700">
                        {trip.status}
                      </span>
                      {trip.versions[0] && (
                        <p className="text-xs text-slate-500 mt-1">
                          v{trip.versions[0].versionNumber}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
