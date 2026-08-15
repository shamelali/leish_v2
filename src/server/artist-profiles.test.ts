// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hashPassword } from "./password";
import { claimArtistProfile, getClaimedArtistIds, getClaimedProfile } from "./artist-profiles";

async function createArtistUser() {
  const id = randomUUID();
  await getDb()
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      id,
      `${id}@artist.local`,
      "Artist",
      "artist",
      hashPassword("password123"),
      new Date().toISOString(),
    );
  return id;
}

describe("artist profile claiming", () => {
  beforeEach(async () => {
    await getDb().prepare("DELETE FROM artist_profiles").run();
    await getDb().prepare("DELETE FROM users").run();
  });

  it("claims a catalog artist profile", async () => {
    const userId = await createArtistUser();
    const profile = await claimArtistProfile(userId, "aisha-azman");
    expect(profile.user_id).toBe(userId);
    expect(profile.artist_id).toBe("aisha-azman");
  });

  it("rejects an unknown artist", async () => {
    const userId = await createArtistUser();
    await expect(claimArtistProfile(userId, "no-such-artist")).rejects.toThrow("ARTIST_NOT_FOUND");
  });

  it("rejects a second claim for the same user", async () => {
    const userId = await createArtistUser();
    await claimArtistProfile(userId, "aisha-azman");
    await expect(claimArtistProfile(userId, "maya-tan")).rejects.toThrow("ALREADY_CLAIMED");
  });

  it("lists claimed artist ids and returns the claimed profile", async () => {
    const userId = await createArtistUser();
    await claimArtistProfile(userId, "sofia-rahim");
    expect(await getClaimedArtistIds(userId)).toEqual(["sofia-rahim"]);
    expect((await getClaimedProfile(userId))?.artist_id).toBe("sofia-rahim");
  });

  it("returns empty for users with no claim", async () => {
    const userId = await createArtistUser();
    expect(await getClaimedArtistIds(userId)).toEqual([]);
    expect(await getClaimedProfile(userId)).toBeNull();
  });
});
