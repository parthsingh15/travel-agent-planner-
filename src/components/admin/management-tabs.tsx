"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, ShieldOff, BadgeCheck, MailWarning } from "lucide-react";
import { AdminResourceTable, type Column } from "./resource-table";
import { formatCurrency, formatDate } from "@/lib/utils";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  emailVerified: boolean;
  createdAt: string;
  _count: { trips: number };
};

type TripRow = {
  id: string;
  title: string;
  destination: string;
  status: string;
  budget: number;
  currency: string;
  createdAt: string;
  user: { id: string; name: string; email: string };
  _count: { versions: number; generations: number; expenses: number };
};

type ItineraryRow = {
  id: string;
  versionNumber: number;
  title: string;
  totalBudget: number | null;
  createdAt: string;
  trip: {
    id: string;
    title: string;
    destination: string;
    user: { name: string; email: string };
  };
};

type GenerationRow = {
  id: string;
  status: string;
  currentAgent: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  trip: {
    id: string;
    title: string;
    destination: string;
    user: { name: string; email: string };
  };
  _count: { versions: number };
};

type BookingRow = {
  id: string;
  type: string;
  status: string;
  workflowStep: string;
  title: string;
  amount: number;
  currency: string;
  confirmationCode: string | null;
  createdAt: string;
  user: { name: string; email: string };
};

type BookmarkRow = {
  id: string;
  type: string;
  title: string;
  price: number | null;
  currency: string;
  createdAt: string;
  user: { name: string; email: string };
};

type PaymentRow = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  createdAt: string;
  user: { name: string; email: string };
};

type AlertRow = {
  id: string;
  type: string;
  status: string;
  title: string;
  targetPrice: number;
  currentPrice: number | null;
  currency: string;
  createdAt: string;
  user: { name: string; email: string };
};

type AuditRow = {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
};

function Pill({ value, tone }: { value: string; tone: "green" | "red" | "amber" | "slate" }) {
  const tones = {
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tones[tone]}`}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

function statusTone(status: string): "green" | "red" | "amber" | "slate" {
  if (["COMPLETED", "SUCCEEDED", "CONFIRMED", "ACTIVE", "TRIGGERED"].includes(status))
    return "green";
  if (["FAILED", "CANCELLED"].includes(status)) return "red";
  if (["IN_PROGRESS", "PENDING", "PENDING_CONFIRMATION", "DRAFT"].includes(status))
    return "amber";
  return "slate";
}

const userEmail = (row: { user?: { name: string; email: string } | null }) =>
  row.user ? (
    <div>
      <p className="font-medium text-slate-900">{row.user.name}</p>
      <p className="text-xs text-slate-500">{row.user.email}</p>
    </div>
  ) : (
    <span className="text-slate-400">—</span>
  );

export function AdminManagementTabs({ resource }: { resource: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const updateUser = async (
    id: string,
    changes: { role?: "USER" | "ADMIN"; emailVerified?: boolean }
  ) => {
    setBusyUser(id);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyUser(null);
    }
  };

  const userColumns: Column<UserRow>[] = [
    {
      key: "user",
      header: "User",
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.name}</p>
          <p className="text-xs text-slate-500">{row.email}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (row) => <Pill value={row.role} tone={row.role === "ADMIN" ? "green" : "slate"} />,
    },
    {
      key: "verified",
      header: "Verified",
      render: (row) =>
        row.emailVerified ? (
          <BadgeCheck className="h-4 w-4 text-green-600" aria-label="Verified" />
        ) : (
          <MailWarning className="h-4 w-4 text-amber-600" aria-label="Not verified" />
        ),
    },
    {
      key: "activity",
      header: "Activity",
      render: (row) => (
        <span className="text-xs text-slate-500">
          {row._count.trips} trips
        </span>
      ),
    },
    { key: "joined", header: "Joined", render: (row) => formatDate(row.createdAt) },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex gap-2">
          <button
            disabled={busyUser === row.id}
            onClick={() =>
              updateUser(row.id, { role: row.role === "ADMIN" ? "USER" : "ADMIN" })
            }
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline disabled:opacity-50"
          >
            {row.role === "ADMIN" ? (
              <ShieldOff className="h-3.5 w-3.5" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            {row.role === "ADMIN" ? "Demote" : "Make admin"}
          </button>
          {!row.emailVerified && (
            <button
              disabled={busyUser === row.id}
              onClick={() => updateUser(row.id, { emailVerified: true })}
              className="text-xs font-medium text-primary-600 hover:underline disabled:opacity-50"
            >
              Verify
            </button>
          )}
        </div>
      ),
    },
  ];

  const tripColumns: Column<TripRow>[] = [
    {
      key: "trip",
      header: "Trip",
      render: (row) => (
        <Link href={`/trips/${row.id}`} className="font-medium text-primary-600 hover:underline">
          {row.title}
        </Link>
      ),
    },
    { key: "destination", header: "Destination", render: (row) => row.destination },
    { key: "owner", header: "Owner", render: userEmail },
    { key: "status", header: "Status", render: (row) => <Pill value={row.status} tone={statusTone(row.status)} /> },
    {
      key: "budget",
      header: "Budget",
      render: (row) => formatCurrency(row.budget, row.currency),
    },
    {
      key: "counts",
      header: "Data",
      render: (row) => (
        <span className="text-xs text-slate-500">
          {row._count.versions} versions · {row._count.generations} runs ·{" "}
          {row._count.expenses} expenses
        </span>
      ),
    },
    { key: "created", header: "Created", render: (row) => formatDate(row.createdAt) },
  ];

  const itineraryColumns: Column<ItineraryRow>[] = [
    {
      key: "title",
      header: "Itinerary",
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.title}</p>
          <p className="text-xs text-slate-500">v{row.versionNumber}</p>
        </div>
      ),
    },
    {
      key: "trip",
      header: "Trip",
      render: (row) => (
        <Link href={`/trips/${row.trip.id}`} className="text-primary-600 hover:underline">
          {row.trip.title}
        </Link>
      ),
    },
    { key: "destination", header: "Destination", render: (row) => row.trip.destination },
    {
      key: "owner",
      header: "Owner",
      render: (row) => <span className="text-xs text-slate-500">{row.trip.user.email}</span>,
    },
    {
      key: "budget",
      header: "Budget",
      render: (row) => (row.totalBudget !== null ? formatCurrency(row.totalBudget) : "—"),
    },
    { key: "created", header: "Created", render: (row) => formatDate(row.createdAt) },
  ];

  const generationColumns: Column<GenerationRow>[] = [
    {
      key: "trip",
      header: "Trip",
      render: (row) => (
        <div>
          <Link href={`/trips/${row.trip.id}/ai-planner`} className="font-medium text-primary-600 hover:underline">
            {row.trip.title}
          </Link>
          <p className="text-xs text-slate-500">{row.trip.destination}</p>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (row) => <Pill value={row.status} tone={statusTone(row.status)} /> },
    {
      key: "agent",
      header: "Last agent",
      render: (row) => <span className="text-xs">{row.currentAgent ?? "—"}</span>,
    },
    {
      key: "versions",
      header: "Versions",
      render: (row) => row._count.versions,
    },
    {
      key: "error",
      header: "Error",
      className: "max-w-xs",
      render: (row) =>
        row.errorMessage ? (
          <span className="text-xs text-red-600 line-clamp-2">{row.errorMessage}</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    { key: "created", header: "Started", render: (row) => formatDate(row.createdAt) },
  ];

  const bookingColumns: Column<BookingRow>[] = [
    { key: "title", header: "Item", render: (row) => row.title },
    { key: "type", header: "Type", render: (row) => <Pill value={row.type} tone="slate" /> },
    { key: "user", header: "User", render: userEmail },
    { key: "status", header: "Status", render: (row) => <Pill value={row.status} tone={statusTone(row.status)} /> },
    { key: "step", header: "Step", render: (row) => <span className="text-xs">{row.workflowStep.replace(/_/g, " ")}</span> },
    { key: "amount", header: "Amount", render: (row) => formatCurrency(row.amount, row.currency) },
    {
      key: "code",
      header: "Confirmation",
      render: (row) => <span className="font-mono text-xs">{row.confirmationCode ?? "—"}</span>,
    },
  ];

  const bookmarkColumns: Column<BookmarkRow>[] = [
    { key: "title", header: "Saved item", render: (row) => row.title },
    { key: "type", header: "Type", render: (row) => <Pill value={row.type} tone="slate" /> },
    { key: "user", header: "User", render: userEmail },
    {
      key: "price",
      header: "Price",
      render: (row) => (row.price !== null ? formatCurrency(row.price, row.currency) : "—"),
    },
    { key: "created", header: "Saved", render: (row) => formatDate(row.createdAt) },
  ];

  const paymentColumns: Column<PaymentRow>[] = [
    { key: "amount", header: "Amount", render: (row) => formatCurrency(row.amount, row.currency) },
    { key: "user", header: "User", render: userEmail },
    { key: "status", header: "Status", render: (row) => <Pill value={row.status} tone={statusTone(row.status)} /> },
    { key: "description", header: "Description", render: (row) => row.description ?? "—" },
    { key: "created", header: "Date", render: (row) => formatDate(row.createdAt) },
  ];

  const alertColumns: Column<AlertRow>[] = [
    { key: "title", header: "Alert", render: (row) => row.title },
    { key: "type", header: "Type", render: (row) => <Pill value={row.type} tone="slate" /> },
    { key: "user", header: "User", render: userEmail },
    { key: "target", header: "Target", render: (row) => formatCurrency(row.targetPrice, row.currency) },
    {
      key: "current",
      header: "Current",
      render: (row) => (row.currentPrice !== null ? formatCurrency(row.currentPrice, row.currency) : "—"),
    },
    { key: "status", header: "Status", render: (row) => <Pill value={row.status} tone={statusTone(row.status)} /> },
  ];

  const auditColumns: Column<AuditRow>[] = [
    { key: "action", header: "Action", render: (row) => <span className="font-medium">{row.action.replace(/_/g, " ")}</span> },
    { key: "user", header: "User", render: userEmail },
    { key: "entity", header: "Entity", render: (row) => <span className="text-xs">{row.entity ?? "—"}</span> },
    { key: "entityId", header: "Entity ID", render: (row) => <span className="font-mono text-xs text-slate-400">{row.entityId ?? "—"}</span> },
    { key: "ip", header: "IP", render: (row) => <span className="font-mono text-xs text-slate-400">{row.ipAddress ?? "—"}</span> },
    { key: "created", header: "When", render: (row) => formatDate(row.createdAt) },
  ];

  return (
    <div className="space-y-3">
      {actionError && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          {actionError}
        </p>
      )}

      {resource === "users" && (
        <AdminResourceTable<UserRow>
          resource="users"
          columns={userColumns}
          searchPlaceholder="Search name or email"
          filters={[{ field: "role", label: "Role", options: ["USER", "ADMIN"] }]}
          refreshKey={refreshKey}
        />
      )}

      {resource === "trips" && (
        <AdminResourceTable<TripRow>
          resource="trips"
          columns={tripColumns}
          searchPlaceholder="Search title, destination or email"
          filters={[
            {
              field: "status",
              label: "Status",
              options: ["DRAFT", "PLANNING", "PLANNED", "COMPLETED", "CANCELLED"],
            },
          ]}
        />
      )}

      {resource === "itineraries" && (
        <AdminResourceTable<ItineraryRow>
          resource="itineraries"
          columns={itineraryColumns}
          searchPlaceholder="Search itinerary or destination"
        />
      )}

      {resource === "generations" && (
        <AdminResourceTable<GenerationRow>
          resource="generations"
          columns={generationColumns}
          searchPlaceholder="Search trip or destination"
          filters={[
            {
              field: "status",
              label: "Status",
              options: ["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"],
            },
          ]}
        />
      )}

      {resource === "bookings" && (
        <AdminResourceTable<BookingRow>
          resource="bookings"
          columns={bookingColumns}
          searchPlaceholder="Search item, code or email"
          filters={[
            { field: "type", label: "Type", options: ["FLIGHT", "STAY", "ACTIVITY"] },
            {
              field: "status",
              label: "Status",
              options: ["DRAFT", "PENDING_CONFIRMATION", "CONFIRMED", "CANCELLED", "FAILED"],
            },
          ]}
        />
      )}

      {resource === "bookmarks" && (
        <AdminResourceTable<BookmarkRow>
          resource="bookmarks"
          columns={bookmarkColumns}
          searchPlaceholder="Search saved items"
          filters={[
            {
              field: "type",
              label: "Type",
              options: ["FLIGHT", "STAY", "ACTIVITY", "RESTAURANT", "PLACE", "ITINERARY"],
            },
          ]}
        />
      )}

      {resource === "payments" && (
        <AdminResourceTable<PaymentRow>
          resource="payments"
          columns={paymentColumns}
          searchPlaceholder="Search description or email"
          filters={[
            {
              field: "status",
              label: "Status",
              options: ["PENDING", "SUCCEEDED", "FAILED", "REFUNDED"],
            },
          ]}
        />
      )}

      {resource === "price-alerts" && (
        <AdminResourceTable<AlertRow>
          resource="price-alerts"
          columns={alertColumns}
          searchPlaceholder="Search alert or email"
          filters={[
            { field: "type", label: "Type", options: ["FLIGHT", "STAY", "ACTIVITY"] },
            {
              field: "status",
              label: "Status",
              options: ["ACTIVE", "TRIGGERED", "EXPIRED", "CANCELLED"],
            },
          ]}
        />
      )}

      {resource === "audit-logs" && (
        <AdminResourceTable<AuditRow>
          resource="audit-logs"
          columns={auditColumns}
          searchPlaceholder="Search entity or email"
        />
      )}
    </div>
  );
}
