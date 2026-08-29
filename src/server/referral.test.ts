// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { getDb, bind } from "./db";
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

const TEST_USER_ID = "test-user-123";
const TEST_ARTIST_ID = "artist-456";
const TEST_STUDIO_ID = "studio-789";

beforeEach(async () => {
  const db = getDb();
  await db.prepare("DELETE FROM referrals WHERE id LIKE ?").run("referral-%");
  await db.prepare("DELETE FROM artists WHERE id = ?").run(TEST_ARTIST_ID);
  await db.prepare("DELETE FROM studios WHERE id = ?").run(TEST_STUDIO_ID);
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
