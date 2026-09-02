// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireVerifiedAuth, db, createAuditLog } = vi.hoisted(() => ({
  requireVerifiedAuth: vi.fn(),
  createAuditLog: vi.fn(),
  db: {
    expense: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    trip: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ requireVerifiedAuth: () => requireVerifiedAuth() }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/audit", () => ({
  createAuditLog: (...args: unknown[]) => createAuditLog(...args),
  getClientIp: () => "127.0.0.1",
}));

import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/expenses/route";
import { DELETE } from "@/app/api/expenses/[id]/route";

const SESSION = { id: "user-1", email: "a@b.com", name: "A", role: "USER", emailVerified: true };
const TRIP = { id: "trip-1", budget: 2000, currency: "USD" };

function post(body: unknown) {
  return new NextRequest("http://localhost:3000/api/expenses", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const VALID = {
  tripId: "trip-1",
  category: "FOOD",
  description: "Dinner",
  amount: 42.5,
  currency: "USD",
};

beforeEach(() => {
  vi.clearAllMocks();
  requireVerifiedAuth.mockResolvedValue(SESSION);
  db.trip.findFirst.mockResolvedValue(TRIP);
  db.expense.create.mockImplementation(async ({ data }: { data: object }) => ({
    id: "exp-1",
    ...data,
  }));
});

describe("POST /api/expenses", () => {
  it("requires authentication", async () => {
    requireVerifiedAuth.mockRejectedValue(new Error("UNAUTHORIZED"));
    expect((await POST(post(VALID))).status).toBe(401);
  });

  it("creates an expense against a trip the caller owns", async () => {
    const res = await POST(post(VALID));

    expect(res.status).toBe(201);
    expect(db.expense.create.mock.calls[0][0].data.userId).toBe("user-1");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "EXPENSE_CREATED" })
    );
  });

  it("404s when the trip belongs to someone else", async () => {
    db.trip.findFirst.mockResolvedValue(null);

    const res = await POST(post(VALID));

    expect(res.status).toBe(404);
    expect(db.expense.create).not.toHaveBeenCalled();
  });

  it("rejects a non-positive amount", async () => {
    const res = await POST(post({ ...VALID, amount: 0 }));
    expect(res.status).toBe(422);
    expect((await res.json()).details).toHaveProperty("amount");
  });

  it("rejects an unknown category", async () => {
    const res = await POST(post({ ...VALID, category: "YACHTS" }));
    expect(res.status).toBe(422);
    expect((await res.json()).details).toHaveProperty("category");
  });

  it("defaults spentAt to now when omitted", async () => {
    await POST(post(VALID));
    expect(db.expense.create.mock.calls[0][0].data.spentAt).toBeInstanceOf(Date);
  });
});

describe("GET /api/expenses", () => {
  it("requires a tripId", async () => {
    const res = await GET(new NextRequest("http://localhost:3000/api/expenses"));
    expect(res.status).toBe(400);
  });

  it("returns expenses with a budget summary", async () => {
    db.expense.findMany.mockResolvedValue([
      { category: "FLIGHTS", amount: 500, currency: "USD" },
      { category: "FOOD", amount: 250, currency: "USD" },
    ]);

    const res = await GET(
      new NextRequest("http://localhost:3000/api/expenses?tripId=trip-1")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.summary.totalSpent).toBe(750);
    expect(body.summary.remaining).toBe(1250);
    expect(body.summary.overBudget).toBe(false);
    expect(body.summary.byCategory[0].category).toBe("FLIGHTS");
  });

  it("flags an over-budget trip", async () => {
    db.expense.findMany.mockResolvedValue([
      { category: "FLIGHTS", amount: 2500, currency: "USD" },
    ]);

    const res = await GET(
      new NextRequest("http://localhost:3000/api/expenses?tripId=trip-1")
    );

    expect((await res.json()).summary.overBudget).toBe(true);
  });

  it("404s for a trip the caller does not own", async () => {
    db.trip.findFirst.mockResolvedValue(null);

    const res = await GET(
      new NextRequest("http://localhost:3000/api/expenses?tripId=someone-else")
    );

    expect(res.status).toBe(404);
    expect(db.expense.findMany).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/expenses/[id]", () => {
  it("404s rather than deleting another user's expense", async () => {
    db.expense.findFirst.mockResolvedValue(null);

    const res = await DELETE(
      new NextRequest("http://localhost:3000/api/expenses/exp-x", { method: "DELETE" }),
      { params: Promise.resolve({ id: "exp-x" }) }
    );

    expect(res.status).toBe(404);
    expect(db.expense.delete).not.toHaveBeenCalled();
  });

  it("deletes an expense the caller owns", async () => {
    db.expense.findFirst.mockResolvedValue({ id: "exp-1" });

    const res = await DELETE(
      new NextRequest("http://localhost:3000/api/expenses/exp-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "exp-1" }) }
    );

    expect(res.status).toBe(200);
    expect(db.expense.delete).toHaveBeenCalledWith({ where: { id: "exp-1" } });
  });
});
