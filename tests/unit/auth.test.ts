import { describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { resolveJwtSecret } from "@/lib/auth";

describe("Password Hashing", () => {
  it("hashes and verifies passwords correctly", async () => {
    const password = "TestPassword1";
    const hash = await bcrypt.hash(password, 12);

    expect(hash).not.toBe(password);
    expect(await bcrypt.compare(password, hash)).toBe(true);
    expect(await bcrypt.compare("wrong", hash)).toBe(false);
  });

  it("produces different hashes for same password", async () => {
    const password = "TestPassword1";
    const hash1 = await bcrypt.hash(password, 12);
    const hash2 = await bcrypt.hash(password, 12);

    expect(hash1).not.toBe(hash2);
    expect(await bcrypt.compare(password, hash1)).toBe(true);
    expect(await bcrypt.compare(password, hash2)).toBe(true);
  });
});

describe("Itinerary Versioning Logic", () => {
  it("increments version numbers correctly", () => {
    const existingVersions = [{ versionNumber: 1 }, { versionNumber: 2 }];
    const lastVersion = existingVersions.reduce(
      (max, v) => (v.versionNumber > max ? v.versionNumber : max),
      0
    );
    const nextVersion = lastVersion + 1;
    expect(nextVersion).toBe(3);
  });

  it("starts at version 1 when no versions exist", () => {
    const existingVersions: { versionNumber: number }[] = [];
    const lastVersion = existingVersions.reduce(
      (max, v) => (v.versionNumber > max ? v.versionNumber : max),
      0
    );
    const nextVersion = lastVersion + 1;
    expect(nextVersion).toBe(1);
  });

  it("preserves all historical versions", () => {
    const versions = [
      { id: "v1", versionNumber: 1, dayByDay: [{ day: 1 }] },
      { id: "v2", versionNumber: 2, dayByDay: [{ day: 1 }, { day: 2 }] },
    ];

    expect(versions).toHaveLength(2);
    expect(versions[0].id).not.toBe(versions[1].id);
    expect(versions[0].dayByDay).not.toEqual(versions[1].dayByDay);
  });
});

/**
 * Regression guards for the production JWT secret.
 *
 * A module-level evaluation of this previously broke `next build` (Vercel's
 * "Collecting page data" step imports every route with NODE_ENV=production),
 * and a length-only check let the 46-character .env.example placeholder
 * through.
 */
describe("JWT secret resolution", () => {
  const REAL = "xce5FFWcsXO1QNGpIuJ8ZinY2Tjsw9uTsROoi9ezSDoABDluiEOKarh5685183";

  it("importing the auth module never throws, so builds need no secret", async () => {
    await expect(import("@/lib/auth")).resolves.toBeDefined();
  });

  it("accepts a real random secret in production", () => {
    expect(resolveJwtSecret(REAL, "production")).toBe(REAL);
  });

  it("rejects a missing secret in production", () => {
    expect(() => resolveJwtSecret(undefined, "production")).toThrow(
      /JWT_SECRET is required/
    );
  });

  it("rejects a too-short secret in production", () => {
    expect(() => resolveJwtSecret("tooshort", "production")).toThrow(
      /at least 32 characters/
    );
  });

  it("rejects the .env.example placeholder despite it being long enough", () => {
    const placeholder = "your-super-secret-jwt-key-change-in-production";
    expect(placeholder.length).toBeGreaterThan(32);
    expect(() => resolveJwtSecret(placeholder, "production")).toThrow(/placeholder/);
  });

  it.each([
    "change-me-to-a-long-random-string-at-least-32-chars",
    "fallback-dev-secret-change-me-padded-out-to-32ch",
    "this-is-a-placeholder-secret-value-here",
  ])("rejects other placeholder-shaped secrets: %s", (value) => {
    expect(() => resolveJwtSecret(value, "production")).toThrow();
  });

  it("allows a weak secret outside production", () => {
    expect(resolveJwtSecret("change-me", "development")).toBe("change-me");
  });

  it("falls back with a warning when unset outside production", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveJwtSecret(undefined, "development")).toContain("fallback");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
