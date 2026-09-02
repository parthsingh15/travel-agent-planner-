// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted above module scope, so the mocks it closes over must be
// created with vi.hoisted rather than plain consts.
const { requireVerifiedAuth, db, createAuditLog } = vi.hoisted(() => ({
  requireVerifiedAuth: vi.fn(),
  createAuditLog: vi.fn(),
  db: {
    bookmark: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    trip: { findFirst: vi.fn() },
    itineraryVersion: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  requireVerifiedAuth: () => requireVerifiedAuth(),
}));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/audit", () => ({
  createAuditLog: (...args: unknown[]) => createAuditLog(...args),
  getClientIp: () => "127.0.0.1",
}));

import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/bookmarks/route";
import { DELETE } from "@/app/api/bookmarks/[id]/route";

const SESSION = { id: "user-1", email: "a@b.com", name: "A", role: "USER", emailVerified: true };

function post(body: unknown) {
  return new NextRequest("http://localhost:3000/api/bookmarks", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const VALID = {
  type: "FLIGHT",
  title: "Aurora Atlantic AA204",
  externalId: "AA204-2026-06-01",
  price: 412.5,
  currency: "USD",
};

beforeEach(() => {
  vi.clearAllMocks();
  requireVerifiedAuth.mockResolvedValue(SESSION);
  db.bookmark.findUnique.mockResolvedValue(null);
  db.bookmark.create.mockImplementation(async ({ data }: { data: object }) => ({
    id: "bm-1",
    ...data,
  }));
});

describe("POST /api/bookmarks", () => {
  it("requires authentication", async () => {
    requireVerifiedAuth.mockRejectedValue(new Error("UNAUTHORIZED"));
    expect((await POST(post(VALID))).status).toBe(401);
  });

  it("creates a bookmark and writes an audit log", async () => {
    const res = await POST(post(VALID));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.alreadySaved).toBe(false);
    expect(body.bookmark.title).toBe(VALID.title);
    expect(db.bookmark.create).toHaveBeenCalledOnce();
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "BOOKMARK_CREATED", userId: "user-1" })
    );
  });

  it("scopes the created bookmark to the calling user", async () => {
    await POST(post(VALID));
    expect(db.bookmark.create.mock.calls[0][0].data.userId).toBe("user-1");
  });

  it("is idempotent when the same item is saved twice", async () => {
    db.bookmark.findUnique.mockResolvedValue({ id: "bm-existing", ...VALID });

    const res = await POST(post(VALID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.alreadySaved).toBe(true);
    expect(db.bookmark.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid bookmark type with 422", async () => {
    const res = await POST(post({ ...VALID, type: "SPACESHIP" }));
    expect(res.status).toBe(422);
    expect((await res.json()).details).toHaveProperty("type");
  });

  it("refuses to attach a bookmark to someone else's trip", async () => {
    db.trip.findFirst.mockResolvedValue(null);

    const res = await POST(post({ ...VALID, tripId: "trip-of-another-user" }));

    expect(res.status).toBe(404);
    expect(db.bookmark.create).not.toHaveBeenCalled();
  });

  it("refuses to attach a bookmark to someone else's itinerary version", async () => {
    db.itineraryVersion.findFirst.mockResolvedValue(null);

    const res = await POST(post({ ...VALID, versionId: "version-of-another-user" }));

    expect(res.status).toBe(404);
    expect(db.bookmark.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/bookmarks", () => {
  it("only ever queries the caller's own bookmarks", async () => {
    db.bookmark.findMany.mockResolvedValue([]);

    await GET(new NextRequest("http://localhost:3000/api/bookmarks"));

    expect(db.bookmark.findMany.mock.calls[0][0].where.userId).toBe("user-1");
  });

  it("applies a valid type filter and ignores a bogus one", async () => {
    db.bookmark.findMany.mockResolvedValue([]);

    await GET(new NextRequest("http://localhost:3000/api/bookmarks?type=STAY"));
    expect(db.bookmark.findMany.mock.calls[0][0].where.type).toBe("STAY");

    await GET(new NextRequest("http://localhost:3000/api/bookmarks?type=NONSENSE"));
    expect(db.bookmark.findMany.mock.calls[1][0].where.type).toBeUndefined();
  });
});

describe("DELETE /api/bookmarks/[id]", () => {
  it("deletes a bookmark the caller owns", async () => {
    db.bookmark.findFirst.mockResolvedValue({ id: "bm-1", type: "FLIGHT", title: "X" });

    const res = await DELETE(
      new NextRequest("http://localhost:3000/api/bookmarks/bm-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "bm-1" }) }
    );

    expect(res.status).toBe(200);
    expect(db.bookmark.delete).toHaveBeenCalledWith({ where: { id: "bm-1" } });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "BOOKMARK_DELETED" })
    );
  });

  it("404s rather than deleting a bookmark owned by someone else", async () => {
    db.bookmark.findFirst.mockResolvedValue(null);

    const res = await DELETE(
      new NextRequest("http://localhost:3000/api/bookmarks/bm-other", { method: "DELETE" }),
      { params: Promise.resolve({ id: "bm-other" }) }
    );

    expect(res.status).toBe(404);
    expect(db.bookmark.delete).not.toHaveBeenCalled();
  });
});
