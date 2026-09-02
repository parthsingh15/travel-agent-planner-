// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireAdmin, db, createAuditLog } = vi.hoisted(() => {
  const table = () => ({ findMany: vi.fn(), count: vi.fn() });
  return {
    requireAdmin: vi.fn(),
    createAuditLog: vi.fn(),
    db: {
      user: { ...table(), findUnique: vi.fn(), update: vi.fn() },
      trip: table(),
      itineraryVersion: table(),
      itineraryGeneration: table(),
      booking: table(),
      bookmark: table(),
      payment: table(),
      priceAlert: table(),
      auditLog: table(),
    },
  };
});

vi.mock("@/lib/auth", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/audit", () => ({
  createAuditLog: (...args: unknown[]) => createAuditLog(...args),
  getClientIp: () => "127.0.0.1",
}));

import { NextRequest } from "next/server";
import { GET as listResource } from "@/app/api/admin/resources/[resource]/route";
import { PATCH as updateUser } from "@/app/api/admin/users/[id]/route";

const ADMIN = { id: "admin-1", email: "admin@x.com", name: "Admin", role: "ADMIN", emailVerified: true };

function listRequest(resource: string, query = "") {
  return listResource(
    new NextRequest(`http://localhost:3000/api/admin/resources/${resource}${query}`),
    { params: Promise.resolve({ resource }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(ADMIN);
  for (const model of Object.values(db)) {
    model.findMany?.mockResolvedValue([]);
    model.count?.mockResolvedValue(0);
  }
});

describe("GET /api/admin/resources/[resource]", () => {
  it("rejects non-admin callers with 403", async () => {
    requireAdmin.mockRejectedValue(new Error("FORBIDDEN"));

    const res = await listRequest("users");

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Forbidden");
  });

  it("rejects unauthenticated callers with 401", async () => {
    requireAdmin.mockRejectedValue(new Error("UNAUTHORIZED"));
    expect((await listRequest("users")).status).toBe(401);
  });

  it("404s an unknown resource and lists the valid ones", async () => {
    const res = await listRequest("nuclear-codes");
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.details.available).toContain("users");
  });

  it.each([
    "users",
    "trips",
    "itineraries",
    "generations",
    "bookings",
    "bookmarks",
    "payments",
    "price-alerts",
    "audit-logs",
  ])("serves the %s resource", async (resource) => {
    const res = await listRequest(resource);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.resource).toBe(resource);
    expect(body.pagination).toMatchObject({ page: 1, pageSize: 20 });
  });

  it("paginates with skip and take", async () => {
    db.user.count.mockResolvedValue(95);

    const res = await listRequest("users", "?page=3&pageSize=10");
    const body = await res.json();

    expect(db.user.findMany.mock.calls[0][0]).toMatchObject({ skip: 20, take: 10 });
    expect(body.pagination).toMatchObject({
      page: 3,
      total: 95,
      totalPages: 10,
      hasMore: true,
    });
  });

  it("caps page size to protect the database", async () => {
    await listRequest("users", "?pageSize=100000");
    expect(db.user.findMany.mock.calls[0][0].take).toBe(100);
  });

  it("builds a case-insensitive search filter", async () => {
    await listRequest("users", "?search=alice");

    const where = db.user.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { name: { contains: "alice", mode: "insensitive" } },
      { email: { contains: "alice", mode: "insensitive" } },
    ]);
  });

  it("applies whitelisted filters", async () => {
    await listRequest("generations", "?status=FAILED");
    expect(db.itineraryGeneration.findMany.mock.calls[0][0].where.status).toBe("FAILED");
  });

  it("ignores query params a resource has not opted into", async () => {
    await listRequest("users", "?passwordHash=leak&role=ADMIN");

    const where = db.user.findMany.mock.calls[0][0].where;
    expect(where.role).toBe("ADMIN");
    expect(where).not.toHaveProperty("passwordHash");
  });

  it("never selects password hashes for the users resource", async () => {
    await listRequest("users");

    const select = db.user.findMany.mock.calls[0][0].select;
    expect(select).not.toHaveProperty("passwordHash");
    expect(select.email).toBe(true);
  });
});

describe("PATCH /api/admin/users/[id]", () => {
  function patch(id: string, body: unknown) {
    return updateUser(
      new NextRequest(`http://localhost:3000/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id }) }
    );
  }

  it("rejects non-admin callers", async () => {
    requireAdmin.mockRejectedValue(new Error("FORBIDDEN"));
    expect((await patch("user-2", { role: "ADMIN" })).status).toBe(403);
  });

  it("promotes a user and records an audit entry", async () => {
    db.user.findUnique.mockResolvedValue({ id: "user-2", role: "USER", email: "u@x.com" });
    db.user.update.mockResolvedValue({ id: "user-2", role: "ADMIN" });

    const res = await patch("user-2", { role: "ADMIN" });

    expect(res.status).toBe(200);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ADMIN_ACTION", entityId: "user-2" })
    );
  });

  it("404s for a user that does not exist", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect((await patch("ghost", { role: "ADMIN" })).status).toBe(404);
  });

  it("refuses to demote the last remaining admin", async () => {
    db.user.findUnique.mockResolvedValue({ id: "admin-1", role: "ADMIN", email: "a@x.com" });
    db.user.count.mockResolvedValue(1);

    const res = await patch("admin-1", { role: "USER" });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/last remaining admin/i);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("allows demoting an admin when others remain", async () => {
    db.user.findUnique.mockResolvedValue({ id: "admin-2", role: "ADMIN", email: "a2@x.com" });
    db.user.count.mockResolvedValue(3);
    db.user.update.mockResolvedValue({ id: "admin-2", role: "USER" });

    expect((await patch("admin-2", { role: "USER" })).status).toBe(200);
    expect(db.user.update).toHaveBeenCalled();
  });

  it("rejects an invalid role with 422", async () => {
    db.user.findUnique.mockResolvedValue({ id: "user-2", role: "USER", email: "u@x.com" });
    expect((await patch("user-2", { role: "SUPERUSER" })).status).toBe(422);
  });
});
