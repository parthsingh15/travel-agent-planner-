import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Admin resource registry.
 *
 * Every managed entity is described once here - which columns are searchable,
 * what to include, how to sort - so the admin API is a single parameterised
 * route rather than nine near-identical files.
 */

export type AdminResourceName =
  | "users"
  | "trips"
  | "itineraries"
  | "generations"
  | "bookings"
  | "bookmarks"
  | "payments"
  | "price-alerts"
  | "audit-logs";

type Delegate = {
  findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  count: (args: Record<string, unknown>) => Promise<number>;
};

type ResourceConfig = {
  /** Prisma delegate for the entity. */
  delegate: () => Delegate;
  /** Build a case-insensitive filter from the `search` query parameter. */
  buildSearch: (term: string) => Record<string, unknown>;
  include?: Record<string, unknown>;
  select?: Record<string, unknown>;
  orderBy: Record<string, "asc" | "desc">;
  /** Optional exact-match filters, e.g. ?status=FAILED */
  filterableFields?: string[];
};

const contains = (field: string, term: string) => ({
  [field]: { contains: term, mode: Prisma.QueryMode.insensitive },
});

export const ADMIN_RESOURCES: Record<AdminResourceName, ResourceConfig> = {
  users: {
    delegate: () => prisma.user as unknown as Delegate,
    buildSearch: (term) => ({
      OR: [contains("name", term), contains("email", term)],
    }),
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      emailVerified: true,
      createdAt: true,
      _count: { select: { trips: true, payments: true, bookings: true } },
    },
    orderBy: { createdAt: "desc" },
    filterableFields: ["role"],
  },

  trips: {
    delegate: () => prisma.trip as unknown as Delegate,
    buildSearch: (term) => ({
      OR: [
        contains("title", term),
        contains("destination", term),
        { user: { email: { contains: term, mode: Prisma.QueryMode.insensitive } } },
      ],
    }),
    include: {
      user: { select: { id: true, name: true, email: true } },
      _count: { select: { versions: true, generations: true, expenses: true } },
    },
    orderBy: { createdAt: "desc" },
    filterableFields: ["status", "travelStyle"],
  },

  itineraries: {
    delegate: () => prisma.itineraryVersion as unknown as Delegate,
    buildSearch: (term) => ({
      OR: [
        contains("title", term),
        { trip: { destination: { contains: term, mode: Prisma.QueryMode.insensitive } } },
      ],
    }),
    include: {
      trip: {
        select: {
          id: true,
          title: true,
          destination: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  },

  generations: {
    delegate: () => prisma.itineraryGeneration as unknown as Delegate,
    buildSearch: (term) => ({
      OR: [
        { trip: { title: { contains: term, mode: Prisma.QueryMode.insensitive } } },
        { trip: { destination: { contains: term, mode: Prisma.QueryMode.insensitive } } },
      ],
    }),
    include: {
      trip: {
        select: {
          id: true,
          title: true,
          destination: true,
          user: { select: { name: true, email: true } },
        },
      },
      _count: { select: { versions: true } },
    },
    orderBy: { createdAt: "desc" },
    filterableFields: ["status"],
  },

  bookings: {
    delegate: () => prisma.booking as unknown as Delegate,
    buildSearch: (term) => ({
      OR: [
        contains("title", term),
        contains("confirmationCode", term),
        { user: { email: { contains: term, mode: Prisma.QueryMode.insensitive } } },
      ],
    }),
    include: {
      user: { select: { id: true, name: true, email: true } },
      trip: { select: { id: true, title: true, destination: true } },
    },
    orderBy: { createdAt: "desc" },
    filterableFields: ["status", "type", "workflowStep"],
  },

  bookmarks: {
    delegate: () => prisma.bookmark as unknown as Delegate,
    buildSearch: (term) => ({
      OR: [
        contains("title", term),
        { user: { email: { contains: term, mode: Prisma.QueryMode.insensitive } } },
      ],
    }),
    include: {
      user: { select: { id: true, name: true, email: true } },
      trip: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
    filterableFields: ["type"],
  },

  payments: {
    delegate: () => prisma.payment as unknown as Delegate,
    buildSearch: (term) => ({
      OR: [
        contains("description", term),
        contains("stripePaymentId", term),
        { user: { email: { contains: term, mode: Prisma.QueryMode.insensitive } } },
      ],
    }),
    include: {
      user: { select: { id: true, name: true, email: true } },
      trip: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
    filterableFields: ["status"],
  },

  "price-alerts": {
    delegate: () => prisma.priceAlert as unknown as Delegate,
    buildSearch: (term) => ({
      OR: [
        contains("title", term),
        { user: { email: { contains: term, mode: Prisma.QueryMode.insensitive } } },
      ],
    }),
    include: {
      user: { select: { id: true, name: true, email: true } },
      trip: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
    filterableFields: ["status", "type"],
  },

  "audit-logs": {
    delegate: () => prisma.auditLog as unknown as Delegate,
    buildSearch: (term) => ({
      OR: [
        contains("entity", term),
        contains("entityId", term),
        { user: { email: { contains: term, mode: Prisma.QueryMode.insensitive } } },
      ],
    }),
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    filterableFields: ["action"],
  },
};

export function isAdminResource(value: string): value is AdminResourceName {
  return Object.hasOwn(ADMIN_RESOURCES, value);
}

export const MAX_PAGE_SIZE = 100;

export type AdminListParams = {
  page: number;
  pageSize: number;
  search?: string;
  filters?: Record<string, string>;
};

export async function listAdminResource(
  name: AdminResourceName,
  { page, pageSize, search, filters }: AdminListParams
) {
  const config = ADMIN_RESOURCES[name];
  const size = Math.min(Math.max(1, pageSize), MAX_PAGE_SIZE);
  const currentPage = Math.max(1, page);

  const where: Record<string, unknown> = {};

  if (search?.trim()) {
    Object.assign(where, config.buildSearch(search.trim()));
  }

  // Only fields the resource explicitly opts into are filterable, so a crafted
  // query string cannot reach arbitrary columns.
  for (const field of config.filterableFields ?? []) {
    const value = filters?.[field];
    if (value) where[field] = value;
  }

  const delegate = config.delegate();

  const [items, total] = await Promise.all([
    delegate.findMany({
      where,
      orderBy: config.orderBy,
      skip: (currentPage - 1) * size,
      take: size,
      ...(config.include ? { include: config.include } : {}),
      ...(config.select ? { select: config.select } : {}),
    }),
    delegate.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page: currentPage,
      pageSize: size,
      total,
      totalPages: Math.max(1, Math.ceil(total / size)),
      hasMore: currentPage * size < total,
    },
  };
}
