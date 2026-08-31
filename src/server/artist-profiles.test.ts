// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hashPassword } from "./password";
import {
  claimArtistProfile,
  getClaimedArtistIds,
  getClaimedProfile,
  unclaimArtistProfile,
} from "./artist-profiles";
import { getArtistById } from "./catalog";

async function createTestUser(role = "artist") {
  const userId = randomUUID();
  await getDb()
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(userId, `${userId}@test.local`, "Test User", role, hashPassword("password123"), new Date().toISOString());
  return userId;
}

describe("artist-profiles", () => {
  beforeEach(async () => {
    await getDb().prepare("DELETE FROM artist_profiles").run();
    await getDb().prepare("DELETE FROM users").run();
    // Ensure catalog is seeded so getArtistById works
    await getArtistById("aisha-azman");
  });

  describe("claimArtistProfile", () => {
    it("claims an artist profile for a user", async () => {
      const userId = await createTestUser();
      const profile = await claimArtistProfile(userId, "aisha-azman");

      expect(profile.user_id).toBe(userId);
      expect(profile.artist_id).toBe("aisha-azman");
      expect(profile.claimed_at).toBeDefined();

      const row = await getDb()
        .prepare("SELECT * FROM artist_profiles WHERE user_id = ?")
        .get(userId);
      expect(row).toMatchObject({ user_id: userId, artist_id: "aisha-azman" });
    });

    it("throws ARTIST_NOT_FOUND for non-existent artist", async () => {
      const userId = await createTestUser();
      await expect(claimArtistProfile(userId, "non-existent")).rejects.toThrow("ARTIST_NOT_FOUND");
    });

    it("throws ALREADY_CLAIMED when user already claimed an artist", async () => {
      const userId = await createTestUser();
      await claimArtistProfile(userId, "aisha-azman");
      await expect(claimArtistProfile(userId, "maya-tan")).rejects.toThrow("ALREADY_CLAIMED");
    });

    it("throws ALREADY_CLAIMED when artist already claimed by another user", async () => {
      const user1 = await createTestUser();
      const user2 = await createTestUser();
      await claimArtistProfile(user1, "aisha-azman");
      await expect(claimArtistProfile(user2, "aisha-azman")).rejects.toThrow("ALREADY_CLAIMED");
    });
  });

  describe("getClaimedArtistIds", () => {
    it("returns empty array when no claims", async () => {
      const userId = await createTestUser();
      const ids = await getClaimedArtistIds(userId);
      expect(ids).toEqual([]);
    });

    it("returns claimed artist ids", async () => {
      const userId = await createTestUser();
      await claimArtistProfile(userId, "aisha-azman");
      const ids = await getClaimedArtistIds(userId);
      expect(ids).toContain("aisha-azman");
    });
  });

  describe("getClaimedProfile", () => {
    it("returns null when no claim", async () => {
      const userId = await createTestUser();
      const profile = await getClaimedProfile(userId);
      expect(profile).toBeNull();
    });

    it("returns profile when claimed", async () => {
      const userId = await createTestUser();
      await claimArtistProfile(userId, "aisha-azman");
      const profile = await getClaimedProfile(userId);
      expect(profile).toMatchObject({ user_id: userId, artist_id: "aisha-azman" });
    });
  });

  describe("unclaimArtistProfile", () => {
    it("returns false when no claim exists", async () => {
      const userId = await createTestUser();
      const result = await unclaimArtistProfile(userId);
      expect(result).toBe(false);
    });

    it("removes claim and returns true", async () => {
      const userId = await createTestUser();
      await claimArtistProfile(userId, "aisha-azman");
      const result = await unclaimArtistProfile(userId);
      expect(result).toBe(true);

      const profile = await getClaimedProfile(userId);
      expect(profile).toBeNull();
    });
  });
});