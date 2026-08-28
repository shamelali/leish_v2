import { getDb } from "./db";
import { getArtistById } from "./catalog";

/**
 * Artist-profile claiming: links an artist/studio user account to one of
 * the catalog artists so bookings can be scoped to the account that owns
 * the profile (instead of every artist-role account managing everything).
 *
 * One claim per user (artist_id is the catalog id, e.g. "aisha-azman").
 */

export interface ArtistProfileRow {
  user_id: string;
  artist_id: string;
  claimed_at: string;
}

export async function claimArtistProfile(
  userId: string,
  artistId: string,
): Promise<ArtistProfileRow> {
  if (!(await getArtistById(artistId))) {
    throw new Error("ARTIST_NOT_FOUND");
  }
  const db = await getDb();

  const row: ArtistProfileRow = {
    user_id: userId,
    artist_id: artistId,
    claimed_at: new Date().toISOString(),
  };

  // Atomic insert — relies on PRIMARY KEY(user_id) to prevent TOCTOU races
  // where two concurrent claims both pass a prior SELECT check.
  const result = await db
    .prepare(
      "INSERT INTO artist_profiles (user_id, artist_id, claimed_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO NOTHING",
    )
    .run(row.user_id, row.artist_id, row.claimed_at);

  if (result.changes === 0) {
    throw new Error("ALREADY_CLAIMED");
  }
  return row;
}

export async function getClaimedArtistIds(userId: string): Promise<string[]> {
  const rows = (await getDb()
    .prepare("SELECT artist_id FROM artist_profiles WHERE user_id = ?")
    .all(userId)) as { artist_id: string }[];
  return rows.map((r) => r.artist_id);
}

export async function getClaimedProfile(userId: string): Promise<ArtistProfileRow | null> {
  const row = (await getDb()
    .prepare("SELECT * FROM artist_profiles WHERE user_id = ?")
    .get(userId)) as ArtistProfileRow | undefined;
  return row ?? null;
}
