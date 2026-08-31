// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "./db";
import {
  generateReferralCode,
  isValidReferralCode,
  parseReferralCode,
  assignReferralCode,
  getOrCreateReferralCode,
  findReferrerByCode,
  createReferral,
  getReferralsByReferrer,
  getReferralStats,
  qualifyReferral,
  payReferral,
  updateReferralReward,
  getAllReferrals,
} from "./referral";

interface ArtistRow {
  id: string;
  referral_code: string;
}

interface StudioRow {
  id: string;
  referral_code: string;
}

interface ReferralRow {
  id: string;
  status: string;
  reward_sen: number;
  referrer_type: string;
  referrer_id: string;
  referee_id: string;
  qualified_at: string | null;
  paid_at: string | null;
}

async function seedArtist(id: string) {
  const db = getDb();
  await db
    .prepare(
      `INSERT INTO artists (id, slug, name, tagline, bio, image, state, area, price_from,
                          specialties, services, referral_code, referred_by, referral_earnings, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      `artist-${id}`,
      `Artist ${id}`,
      "Tagline",
      "Bio",
      "/images/hero.jpg",
      "Selangor",
      "Cyberjaya",
      500,
      "[]",
      "[]",
      "",
      null,
      0,
      new Date().toISOString(),
      new Date().toISOString(),
    );
}

async function seedStudio(id: string) {
  const db = getDb();
  await db
    .prepare(
      `INSERT INTO studios (id, slug, name, tagline, description, image, state, area, address,
                          services, price_from, hours, phone, referral_code, referred_by, referral_earnings, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      `studio-${id}`,
      `Studio ${id}`,
      "Tagline",
      "Description",
      "/images/hero.jpg",
      "Kuala Lumpur",
      "Bangsar",
      "123 Main St",
      "[]",
      500,
      "9am-6pm",
      "+60123456789",
      "",
      null,
      0,
      new Date().toISOString(),
      new Date().toISOString(),
    );
}

beforeEach(async () => {
  const db = getDb();
  await db.prepare("DELETE FROM referrals").run();
  await db.prepare("DELETE FROM artists").run();
  await db.prepare("DELETE FROM studios").run();
});

describe("referral code generation", () => {
  it("generateReferralCode produces LEISH- format", () => {
    const code = generateReferralCode();
    expect(isValidReferralCode(code)).toBe(true);
    expect(code).toMatch(/^LEISH-[A-F0-9]{8}$/);
  });

  it("isValidReferralCode validates correctly", () => {
    expect(isValidReferralCode("LEISH-ABCDEF01")).toBe(true);
    expect(isValidReferralCode("LEISH-12345678")).toBe(true);
    expect(isValidReferralCode("LEISH-ABCDEF")).toBe(false);
    expect(isValidReferralCode("LEISH-ABCDEFGHI")).toBe(false);
    expect(isValidReferralCode("ABCDEFGH")).toBe(false);
    expect(isValidReferralCode("")).toBe(false);
  });

  it("parseReferralCode extracts random part", () => {
    expect(parseReferralCode("LEISH-ABCDEF01")).toBe("ABCDEF01");
    expect(parseReferralCode("LEISH-12345678")).toBe("12345678");
    expect(parseReferralCode("INVALID")).toBe(null);
    expect(parseReferralCode("")).toBe(null);
  });
});

describe("referral code assignment and lookup", () => {
  it("assignReferralCode creates a unique code and stores it", async () => {
    await seedArtist("artist-1");
    const code = await assignReferralCode("artist", "artist-1");
    expect(isValidReferralCode(code)).toBe(true);

    const row = await getDb().prepare("SELECT referral_code FROM artists WHERE id = ?").get("artist-1") as ArtistRow | undefined;
    expect(row).toBeDefined();
    expect(row?.referral_code).toBe(code);
  });

  it("getOrCreateReferralCode returns existing code if present", async () => {
    await seedArtist("artist-2");
    await getDb().prepare("UPDATE artists SET referral_code = ? WHERE id = ?").run("LEISH-EXISTING", "artist-2");
    const code = await getOrCreateReferralCode("artist", "artist-2");
    expect(code).toBe("LEISH-EXISTING");
  });

  it("getOrCreateReferralCode generates new code if missing", async () => {
    await seedArtist("artist-3");
    await getDb().prepare("UPDATE artists SET referral_code = '' WHERE id = ?").run("artist-3");
    const code = await getOrCreateReferralCode("artist", "artist-3");
    expect(isValidReferralCode(code)).toBe(true);
  });

  it("findReferrerByCode finds artist by referral code", async () => {
    await seedArtist("artist-4");
    await assignReferralCode("artist", "artist-4");
    const artist = await getDb().prepare("SELECT referral_code FROM artists WHERE id = ?").get("artist-4") as ArtistRow | undefined;
    const found = await findReferrerByCode(artist?.referral_code ?? "");
    expect(found).not.toBeNull();
    expect(found?.type).toBe("artist");
    expect(found?.id).toBe("artist-4");
  });

  it("findReferrerByCode finds studio by referral code", async () => {
    await seedStudio("studio-1");
    await assignReferralCode("studio", "studio-1");
    const studio = await getDb().prepare("SELECT referral_code FROM studios WHERE id = ?").get("studio-1") as StudioRow | undefined;
    const found = await findReferrerByCode(studio?.referral_code ?? "");
    expect(found).not.toBeNull();
    expect(found?.type).toBe("studio");
    expect(found?.id).toBe("studio-1");
  });

  it("findReferrerByCode returns null for invalid or unknown code", async () => {
    expect(await findReferrerByCode("INVALID")).toBeNull();
    expect(await findReferrerByCode("LEISH-UNKNOWN00")).toBeNull();
  });
});

describe("referral creation and queries", () => {
  beforeEach(async () => {
    await seedArtist("referrer-1");
    await seedArtist("referee-1");
  });

  it("createReferral inserts a new referral record", async () => {
    const referral = await createReferral({
      referrerType: "artist",
      referrerId: "referrer-1",
      refereeType: "artist",
      refereeId: "referee-1",
    });
    expect(referral.id).toBeDefined();
    expect(referral.referrer_type).toBe("artist");
    expect(referral.referrer_id).toBe("referrer-1");
    expect(referral.referee_type).toBe("artist");
    expect(referral.referee_id).toBe("referee-1");
    expect(referral.status).toBe("pending");
    expect(referral.reward_sen).toBe(0);
  });

  it("getReferralsByReferrer returns referrals with names", async () => {
    await createReferral({
      referrerType: "artist",
      referrerId: "referrer-1",
      refereeType: "artist",
      refereeId: "referee-1",
    });
    const referrals = await getReferralsByReferrer("artist", "referrer-1");
    expect(referrals.length).toBe(1);
    expect(referrals[0].referrer_name).toBe("Artist referrer-1");
    expect(referrals[0].referee_name).toBe("Artist referee-1");
  });

  it("getReferralStats calculates correct aggregates", async () => {
    const r1 = await createReferral({
      referrerType: "artist",
      referrerId: "referrer-1",
      refereeType: "artist",
      refereeId: "referee-1",
    });
    await createReferral({
      referrerType: "artist",
      referrerId: "referrer-1",
      refereeType: "artist",
      refereeId: "referee-2",
    });

    // Qualify one
    await getDb().prepare("UPDATE referrals SET status = 'qualified', reward_sen = 5000, qualified_at = ? WHERE id = ?")
      .run(new Date().toISOString(), r1.id);

    const stats = await getReferralStats("artist", "referrer-1");
    expect(stats.totalReferrals).toBe(2);
    expect(stats.qualifiedReferrals).toBe(1);
    expect(stats.paidReferrals).toBe(0);
    expect(stats.totalEarningsSen).toBe(0);
    expect(stats.pendingEarningsSen).toBe(5000);
  });

  it("getAllReferrals returns all referrals with names", async () => {
    await seedStudio("studio-ref");
    await createReferral({
      referrerType: "artist",
      referrerId: "referrer-1",
      refereeType: "studio",
      refereeId: "studio-ref",
    });
    const all = await getAllReferrals();
    expect(all.length).toBeGreaterThanOrEqual(1);
    const found = all.find((r) => r.referee_id === "studio-ref");
    expect(found).toBeDefined();
    expect(found?.referee_name).toBe("Studio studio-ref");
  });
});

describe("referral qualification and payment", () => {
  beforeEach(async () => {
    await seedArtist("referrer-qual");
    await seedArtist("referee-qual");
  });

  it("qualifyReferral marks referral as qualified and updates earnings", async () => {
    await createReferral({
      referrerType: "artist",
      referrerId: "referrer-qual",
      refereeType: "artist",
      refereeId: "referee-qual",
    });

    const result = await qualifyReferral("artist", "referee-qual", 5000);
    expect(result).toBe(true);

    const referral = await getDb().prepare("SELECT * FROM referrals WHERE referee_id = ?").get("referee-qual") as ReferralRow | undefined;
    expect(referral?.status).toBe("qualified");
    expect(referral?.reward_sen).toBe(5000);

    const artist = await getDb().prepare("SELECT referral_earnings FROM artists WHERE id = ?").get("referrer-qual") as { referral_earnings: number } | undefined;
    expect(artist?.referral_earnings).toBe(5000);
  });

  it("qualifyReferral returns false when no pending referral exists", async () => {
    const result = await qualifyReferral("artist", "non-existent", 5000);
    expect(result).toBe(false);
  });

  it("payReferral marks qualified referral as paid", async () => {
    const r = await createReferral({
      referrerType: "artist",
      referrerId: "referrer-qual",
      refereeType: "artist",
      refereeId: "referee-qual",
    });
    await getDb().prepare("UPDATE referrals SET status = 'qualified', reward_sen = 5000, qualified_at = ? WHERE id = ?")
      .run(new Date().toISOString(), r.id);

    const result = await payReferral(r.id);
    expect(result).toBe(true);

    const referral = await getDb().prepare("SELECT * FROM referrals WHERE id = ?").get(r.id) as ReferralRow | undefined;
    expect(referral?.status).toBe("paid");
    expect(referral?.paid_at).not.toBeNull();
  });

  it("payReferral returns false for non-qualified referral", async () => {
    const r = await createReferral({
      referrerType: "artist",
      referrerId: "referrer-qual",
      refereeType: "artist",
      refereeId: "referee-qual",
    });
    const result = await payReferral(r.id);
    expect(result).toBe(false);
  });

  it("updateReferralReward adjusts reward and referrer earnings", async () => {
    const r = await createReferral({
      referrerType: "artist",
      referrerId: "referrer-qual",
      refereeType: "artist",
      refereeId: "referee-qual",
    });
    // Use qualifyReferral to properly set up the referral with earnings
    await qualifyReferral("artist", "referee-qual", 5000);

    const result = await updateReferralReward(r.id, 10000);
    expect(result).toBe(true);

    const referral = await getDb().prepare("SELECT * FROM referrals WHERE id = ?").get(r.id) as ReferralRow | undefined;
    expect(referral?.reward_sen).toBe(10000);

    const artist = await getDb().prepare("SELECT referral_earnings FROM artists WHERE id = ?").get("referrer-qual") as { referral_earnings: number } | undefined;
    expect(artist?.referral_earnings).toBe(10000);
  });

  it("updateReferralReward returns false for non-existent referral", async () => {
    const result = await updateReferralReward("non-existent", 10000);
    expect(result).toBe(false);
  });
});
