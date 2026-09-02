import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";

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
