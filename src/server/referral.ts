import { randomBytes } from "node:crypto";
import { getDb, bind } from "./db.ts";

export type ReferrerType = "artist" | "studio";

export interface ReferralRow {
  id: string;
  referrer_type: ReferrerType;
  referrer_id: string;
  referee_type: ReferrerType;
  referee_id: string;
  status: "pending" | "qualified" | "paid";
  reward_sen: number;
  qualified_at: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface ReferralWithDetails extends ReferralRow {
  referrer_name: string;
  referee_name: string;
}

/** Generate a unique referral code: LEISH-<8-char-random> */
export function generateReferralCode(): string {
  const randomPart = randomBytes(4).toString("hex").toUpperCase();
  return `LEISH-${randomPart}`;
}

/** Validate referral code format */
export function isValidReferralCode(code: string): boolean {
  return /^LEISH-[A-F0-9]{8}$/.test(code);
}

/** Extract the random part from a referral code for lookup */
export function parseReferralCode(code: string): string | null {
  const match = code.match(/^LEISH-([A-F0-9]{8})$/);
  return match ? match[1] : null;
}

/** Ensure a referral code is unique and assign it to an artist/studio */
export async function assignReferralCode(
  entityType: ReferrerType,
  entityId: string,
): Promise<string> {
  const db = getDb();
  const table = entityType === "artist" ? "artists" : "studios";

  for (let attempts = 0; attempts < 10; attempts++) {
    const code = generateReferralCode();
    const exists = await db.prepare(`SELECT 1 FROM ${table} WHERE referral_code = ?`).get(code);
    if (!exists) {
      await db
        .prepare(`UPDATE ${table} SET referral_code = ?, updated_at = ? WHERE id = ?`)
        .run(code, new Date().toISOString(), entityId);
      return code;
    }
  }
  throw new Error("REFERRAL_CODE_GENERATION_FAILED");
}

/** Get referral code for an artist/studio, generating one if missing */
export async function getOrCreateReferralCode(
  entityType: ReferrerType,
  entityId: string,
): Promise<string> {
  const db = getDb();
  const table = entityType === "artist" ? "artists" : "studios";

  const row = (await db
    .prepare(`SELECT referral_code FROM ${table} WHERE id = ?`)
    .get(entityId)) as { referral_code: string } | undefined;

  if (row?.referral_code) return row.referral_code;
  return assignReferralCode(entityType, entityId);
}

/** Find referrer by referral code */
export async function findReferrerByCode(
  code: string,
): Promise<{ type: ReferrerType; id: string; name: string } | null> {
  if (!isValidReferralCode(code)) return null;

  const db = getDb();

  const artist = (await db
    .prepare("SELECT id, name FROM artists WHERE referral_code = ?")
    .get(code)) as { id: string; name: string } | undefined;
  if (artist) return { type: "artist", id: artist.id, name: artist.name };

  const studio = (await db
    .prepare("SELECT id, name FROM studios WHERE referral_code = ?")
    .get(code)) as { id: string; name: string } | undefined;
  if (studio) return { type: "studio", id: studio.id, name: studio.name };

  return null;
}

/** Create a referral record when a new artist/studio signs up with a referral code */
export async function createReferral(input: {
  referrerType: ReferrerType;
  referrerId: string;
  refereeType: ReferrerType;
  refereeId: string;
}): Promise<ReferralRow> {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const row: ReferralRow = {
    id,
    referrer_type: input.referrerType,
    referrer_id: input.referrerId,
    referee_type: input.refereeType,
    referee_id: input.refereeId,
    status: "pending",
    reward_sen: 0,
    qualified_at: null,
    paid_at: null,
    created_at: now,
  };

  await db
    .prepare(
      `INSERT INTO referrals (id, referrer_type, referrer_id, referee_type, referee_id, status, reward_sen, qualified_at, paid_at, created_at)
       VALUES (@id, @referrer_type, @referrer_id, @referee_type, @referee_id, @status, @reward_sen, @qualified_at, @paid_at, @created_at)`,
    )
    .run(bind(row));

  return row;
}

/** Get all referrals made by an artist/studio */
export async function getReferralsByReferrer(
  referrerType: ReferrerType,
  referrerId: string,
): Promise<ReferralWithDetails[]> {
  const db = getDb();
  const refereeTable = "artists";
  const referrerTable = referrerType === "artist" ? "artists" : "studios";

  const rows = (await db
    .prepare(
      `SELECT r.*, 
              ref1.name as referrer_name, 
              ref2.name as referee_name
       FROM referrals r
       JOIN ${referrerTable} ref1 ON ref1.id = r.referrer_id
       JOIN ${refereeTable} ref2 ON ref2.id = r.referee_id
       WHERE r.referrer_type = ? AND r.referrer_id = ?
       ORDER BY r.created_at DESC`,
    )
    .all(referrerType, referrerId)) as ReferralWithDetails[];

  return rows;
}

/** Get referral stats for an artist/studio */
export async function getReferralStats(
  referrerType: ReferrerType,
  referrerId: string,
): Promise<{
  totalReferrals: number;
  qualifiedReferrals: number;
  paidReferrals: number;
  totalEarningsSen: number;
  pendingEarningsSen: number;
}> {
  const db = getDb();

  const stats = (await db
    .prepare(
      `SELECT 
         COUNT(*) as total_referrals,
         SUM(CASE WHEN status = 'qualified' OR status = 'paid' THEN 1 ELSE 0 END) as qualified_referrals,
         SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_referrals,
         SUM(CASE WHEN status = 'paid' THEN reward_sen ELSE 0 END) as total_earnings_sen,
         SUM(CASE WHEN status = 'qualified' THEN reward_sen ELSE 0 END) as pending_earnings_sen
       FROM referrals
       WHERE referrer_type = ? AND referrer_id = ?`,
    )
    .get(referrerType, referrerId)) as {
    total_referrals: number;
    qualified_referrals: number;
    paid_referrals: number;
    total_earnings_sen: number | null;
    pending_earnings_sen: number | null;
  };

  return {
    totalReferrals: stats.total_referrals,
    qualifiedReferrals: stats.qualified_referrals,
    paidReferrals: stats.paid_referrals,
    totalEarningsSen: stats.total_earnings_sen ?? 0,
    pendingEarningsSen: stats.pending_earnings_sen ?? 0,
  };
}

/** Mark a referral as qualified (referee completed first booking) */
export async function qualifyReferral(
  refereeType: ReferrerType,
  refereeId: string,
  rewardSen: number = 5000, // RM 50 default reward
): Promise<boolean> {
  const db = getDb();
  const now = new Date().toISOString();

  // Find the pending referral for this referee
  const referral = (await db
    .prepare(
      `SELECT * FROM referrals WHERE referee_type = ? AND referee_id = ? AND status = 'pending'`,
    )
    .get(refereeType, refereeId)) as ReferralRow | undefined;

  if (!referral) return false;

  // Update referral status
  const result = await db
    .prepare(
      `UPDATE referrals 
       SET status = 'qualified', reward_sen = ?, qualified_at = ? 
       WHERE id = ?`,
    )
    .run(rewardSen, now, referral.id);

  if (result.changes === 0) return false;

  // Update referrer's earnings
  const referrerTable = referral.referrer_type === "artist" ? "artists" : "studios";
  await db
    .prepare(
      `UPDATE ${referrerTable} 
       SET referral_earnings = referral_earnings + ?, updated_at = ? 
       WHERE id = ?`,
    )
    .run(rewardSen, now, referral.referrer_id);

  return true;
}

/** Mark a referral as paid (admin action) */
export async function payReferral(referralId: string): Promise<boolean> {
  const db = getDb();
  const now = new Date().toISOString();

  const result = await db
    .prepare(
      `UPDATE referrals SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'qualified'`,
    )
    .run(now, referralId);

  return result.changes > 0;
}

/** Update referral reward amount (admin action) */
export async function updateReferralReward(
  referralId: string,
  rewardSen: number,
): Promise<boolean> {
  const db = getDb();

  // Get current reward to calculate difference
  const referral = (await db
    .prepare("SELECT reward_sen, referrer_type, referrer_id, status FROM referrals WHERE id = ?")
    .get(referralId)) as
    | { reward_sen: number; referrer_type: ReferrerType; referrer_id: string; status: string }
    | undefined;

  if (!referral) return false;

  const diff = rewardSen - referral.reward_sen;
  if (diff === 0) return true;

  const result = await db
    .prepare("UPDATE referrals SET reward_sen = ? WHERE id = ?")
    .run(rewardSen, referralId);

  if (result.changes === 0) return false;

  // Adjust referrer's earnings if already qualified/paid
  if (referral.status === "qualified" || referral.status === "paid") {
    const referrerTable = referral.referrer_type === "artist" ? "artists" : "studios";
    await db
      .prepare(
        `UPDATE ${referrerTable} SET referral_earnings = referral_earnings + ?, updated_at = ? WHERE id = ?`,
      )
      .run(diff, new Date().toISOString(), referral.referrer_id);
  }

  return true;
}

/** Get all referrals (admin view) */
export async function getAllReferrals(): Promise<ReferralWithDetails[]> {
  const db = getDb();

  const rows = (await db
    .prepare(
      `SELECT r.*, 
              CASE WHEN r.referrer_type = 'artist' THEN a1.name ELSE s1.name END as referrer_name,
              CASE WHEN r.referee_type = 'artist' THEN a2.name ELSE s2.name END as referee_name
       FROM referrals r
       LEFT JOIN artists a1 ON a1.id = r.referrer_id AND r.referrer_type = 'artist'
       LEFT JOIN studios s1 ON s1.id = r.referrer_id AND r.referrer_type = 'studio'
       LEFT JOIN artists a2 ON a2.id = r.referee_id AND r.referee_type = 'artist'
       LEFT JOIN studios s2 ON s2.id = r.referee_id AND r.referee_type = 'studio'
       ORDER BY r.created_at DESC`,
    )
    .all()) as ReferralWithDetails[];

  return rows;
}
