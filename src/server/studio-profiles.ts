import { getDb } from "./db";
import { getStudioById } from "./catalog";

/**
 * Studio-profile claiming: links a studio-role user account to one of the
 * catalog studios so bookings and studio edits can be scoped to the account
 * that owns the profile (mirrors artist_profiles flow, added via Option B).
 *
 * One claim per user (studio_id is the catalog id, e.g. "glow-studio-kl").
 * UNIQUE(studio_id) prevents two users claiming the same studio.
 */

export interface StudioProfileRow {
  user_id: string;
  studio_id: string;
  claimed_at: string;
}

export async function claimStudioProfile(
  userId: string,
  studioId: string,
): Promise<StudioProfileRow> {
  if (!(await getStudioById(studioId))) {
    throw new Error("STUDIO_NOT_FOUND");
  }
  const db = await getDb();

  const row: StudioProfileRow = {
    user_id: userId,
    studio_id: studioId,
    claimed_at: new Date().toISOString(),
  };

  // Atomic insert — relies on PRIMARY KEY(user_id) + UNIQUE(studio_id) to
  // prevent TOCTOU races and double-claims of the same studio.
  try {
    const result = await db
      .prepare(
        "INSERT INTO studio_profiles (user_id, studio_id, claimed_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO NOTHING",
      )
      .run(row.user_id, row.studio_id, row.claimed_at);

    if (result.changes === 0) {
      throw new Error("ALREADY_CLAIMED");
    }
  } catch (err) {
    // UNIQUE(studio_id) violation → studio already claimed by another user.
    if (err instanceof Error && /UNIQUE|unique|studio_id/i.test(err.message)) {
      throw new Error("ALREADY_CLAIMED");
    }
    throw err;
  }
  return row;
}

export async function getClaimedStudioIds(userId: string): Promise<string[]> {
  const rows = (await getDb()
    .prepare("SELECT studio_id FROM studio_profiles WHERE user_id = ?")
    .all(userId)) as { studio_id: string }[];
  return rows.map((r) => r.studio_id);
}

export async function getClaimedStudioProfile(userId: string): Promise<StudioProfileRow | null> {
  const row = (await getDb()
    .prepare("SELECT * FROM studio_profiles WHERE user_id = ?")
    .get(userId)) as StudioProfileRow | undefined;
  return row ?? null;
}

export async function unclaimStudioProfile(userId: string): Promise<boolean> {
  const result = await getDb().prepare("DELETE FROM studio_profiles WHERE user_id = ?").run(userId);
  return result.changes > 0;
}
