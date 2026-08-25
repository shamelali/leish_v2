// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hashPassword } from "./password";
import {
  clearSettingsCache,
  computeCommission,
  DEFAULT_BOOKING_FEE_SEN,
  getBookingFeeSen,
  getCommissionRateBps,
  getCommissionWaiverSen,
} from "./settings";

describe("computeCommission (pure)", () => {
  it("applies the rate to the full quote total", () => {
    const b = computeCommission(100_000, 1_000, 10_000); // RM1000 @10%
    expect(b.waived).toBe(false);
    expect(b.commissionSen).toBe(10_000);
    expect(b.artistNetSen).toBe(90_000);
  });

  it("waives commission below the threshold", () => {
    const b = computeCommission(9_999, 1_000, 10_000);
    expect(b.waived).toBe(true);
    expect(b.commissionSen).toBe(0);
    expect(b.artistNetSen).toBe(9_999);
  });

  it("charges commission exactly at the threshold", () => {
    expect(computeCommission(10_000, 1_000, 10_000).waived).toBe(false);
  });

  it("rounds half-up on uneven rates", () => {
    // 12.5% of RM333.33 → 4166.625 → rounds to 4167
    expect(computeCommission(33_333, 1_250, 0).commissionSen).toBe(4_167);
  });

  it("clamps negative totals to zero", () => {
    expect(computeCommission(-5, 1_000, 0).commissionSen).toBe(0);
  });
});

describe("settings-backed getters", () => {
  const userId = `settings-${randomUUID()}`;

  async function upsertSetting(key: string, value: string) {
    await getDb()
      .prepare(
        `INSERT INTO platform_settings (key, value, updated_by, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value, null, new Date().toISOString());
  }

  beforeEach(async () => {
    clearSettingsCache();
    await getDb()
      .prepare(
        "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        userId,
        `${userId}@test.local`,
        "Settings Admin",
        "admin",
        hashPassword("pw"),
        new Date().toISOString(),
      );
  });

  afterEach(async () => {
    await getDb().prepare("DELETE FROM platform_settings").run();
    await getDb().prepare("DELETE FROM users WHERE id = ?").run(userId);
    clearSettingsCache();
  });

  it("returns defaults when no settings rows exist", async () => {
    expect(await getBookingFeeSen()).toBe(DEFAULT_BOOKING_FEE_SEN);
    expect(await getBookingFeeSen()).toBe(5_000);
    expect(await getCommissionRateBps()).toBe(1_000);
    expect(await getCommissionWaiverSen()).toBe(10_000);
  });

  it("reads overrides from platform_settings", async () => {
    await upsertSetting("booking_fee_sen", "7500");
    await upsertSetting("commission_rate_bps", "1250");
    await upsertSetting("commission_waiver_sen", "20000");

    expect(await getBookingFeeSen()).toBe(7_500);
    expect(await getCommissionRateBps()).toBe(1_250);
    expect(await getCommissionWaiverSen()).toBe(20_000);
  });

  it("ignores non-numeric values and falls back to defaults", async () => {
    await upsertSetting("booking_fee_sen", "not-a-number");
    await upsertSetting("commission_rate_bps", "");
    expect(await getBookingFeeSen()).toBe(5_000);
    expect(await getCommissionRateBps()).toBe(1_000);
  });

  it("clamps an out-of-range commission rate", async () => {
    await upsertSetting("commission_rate_bps", "90000");
    expect(await getCommissionRateBps()).toBe(5_000); // max 50%

    clearSettingsCache();
    await upsertSetting("commission_rate_bps", "-100");
    expect(await getCommissionRateBps()).toBe(0);
  });
});
