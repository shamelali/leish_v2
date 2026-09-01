// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hashPassword } from "./password";
import { claimStudioProfile, getClaimedStudioIds, getClaimedStudioProfile, unclaimStudioProfile } from "./studio-profiles";
import { getStudioById } from "./catalog";

async function createTestUser(role = "studio") {
  const userId = randomUUID();
  await getDb()
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(userId, `${userId}@test.local}`, "Test User", role, hashPassword("password123"), new Date().toISOString());
  return userId;
}

beforeEach(async () => {
  await getDb().prepare("DELETE FROM studio_profiles").run();
  await getDb().prepare("DELETE FROM users").run();
  // Use confirmed existing studio ID from catalog
  await getStudioById("bangsar-beauty-bar");
});

describe("studio-profiles", () => {
  describe("claimStudioProfile", () => {
    it("claims a studio profile for a user", async () => {
      const userId = await createTestUser();
      const profile = await claimStudioProfile(userId, "bangsar-beauty-bar");

      expect(profile.user_id).toBe(userId);
      expect(profile.studio_id).toBe("bangsar-beauty-bar");
      expect(profile.claimed_at).toBeDefined();

      const row = await getDb()
        .prepare("SELECT * FROM studio_profiles WHERE user_id = ?")
        .get(userId);
      expect(row).toMatchObject({ user_id: userId, studio_id: "bangsar-beauty-bar" });
    });

    it("throws STUDIO_NOT_FOUND for non-existent studio", async () => {
      const userId = await createTestUser();
      await expect(claimStudioProfile(userId, "non-existent-studio")).rejects.toThrow(
        "STUDIO_NOT_FOUND",
      );
    });

    it("throws ALREADY_CLAIMED when user already claimed a studio", async () => {
      const userId = await createTestUser();
      await claimStudioProfile(userId, "bangsar-beauty-bar");
      await expect(claimStudioProfile(userId, "bangsar-beauty-bar")).rejects.toThrow(
        "ALREADY_CLAIMED",
      );
    });

    it("throws ALREADY_CLAIMED when studio already claimed by another user", async () => {
      const user1 = await createTestUser();
      const user2 = await createTestUser();
      await claimStudioProfile(user1, "bangsar-beauty-bar");
      await expect(claimStudioProfile(user2, "bangsar-beauty-bar")).rejects.toThrow(
        "ALREADY_CLAIMED",
      );
    });
  });

  describe("getClaimedStudioIds", () => {
    it("returns empty array when no claims", async () => {
      const userId = await createTestUser();
      const ids = await getClaimedStudioIds(userId);
      expect(ids).toEqual([]);
    });

    it("returns claimed studio ids", async () => {
      const userId = await createTestUser();
      await claimStudioProfile(userId, "bangsar-beauty-bar");
      const ids = await getClaimedStudioIds(userId);
      expect(ids).toContain("bangsar-beauty-bar");
    });
  });

  describe("getClaimedStudioProfile", () => {
    it("returns null when no claim", async () => {
      const userId = await createTestUser();
      const profile = await getClaimedStudioProfile(userId);
      expect(profile).toBeNull();
    });

    it("returns profile when claimed", async () => {
      const userId = await createTestUser();
      await claimStudioProfile(userId, "bangsar-beauty-bar");
      const profile = await getClaimedStudioProfile(userId);
      expect(profile).toMatchObject({ user_id: userId, studio_id: "bangsar-beauty-bar" });
    });
  });

  describe("unclaimStudioProfile", () => {
    it("returns false when no claim exists", async () => {
      const userId = await createTestUser();
      const result = await unclaimStudioProfile(userId);
      expect(result).toBe(false);
    });

    it("removes claim and returns true", async () => {
      const userId = await createTestUser();
      await claimStudioProfile(userId, "bangsar-beauty-bar");
      const result = await unclaimStudioProfile(userId);
      expect(result).toBe(true);

      const profile = await getClaimedStudioProfile(userId);
      expect(profile).toBeNull();
    });
  });
});