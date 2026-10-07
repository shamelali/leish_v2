// @vitest-environment node

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  CRON_JOBS,
  dueJobs,
  claimCronSlot,
  isTrafficSchedulerEnabled,
  __resetCronSchedulerThrottle,
} from "./cron-scheduler";
import { getDb } from "./db";

describe("dueJobs", () => {
  // 2026-10-05 09:30 UTC — inside the morning-sweep hour.
  const MORNING = Date.UTC(2026, 9, 5, 9, 30, 0);

  it("fires everything on first run (no timestamps)", () => {
    const due = dueJobs(new Map(), MORNING);
    expect(due.map((j) => j.name).sort()).toEqual(CRON_JOBS.map((j) => j.name).sort());
  });

  it("respects intervals (email-retries ran 1 min ago)", () => {
    const last = new Map([
      ["cron_last_email-retries", MORNING - 60_000],
      ["cron_last_quotation-expiry", MORNING - 61 * 60_000],
    ]);
    const due = dueJobs(last, MORNING);
    expect(due.map((j) => j.name)).not.toContain("email-retries");
    expect(due.map((j) => j.name)).toContain("quotation-expiry");
  });

  it("fires email-retries after 15 minutes", () => {
    const last = new Map([["cron_last_email-retries", MORNING - 15 * 60_000]]);
    expect(dueJobs(last, MORNING).map((j) => j.name)).toContain("email-retries");
  });

  it("holds daily jobs until their UTC hour", () => {
    const early = Date.UTC(2026, 9, 5, 1, 0, 0);
    const due = dueJobs(new Map(), early);
    expect(due.map((j) => j.name)).not.toContain("retention");
    expect(due.map((j) => j.name)).not.toContain("balance-reminders");
    // Hourly + 5-minute jobs have no hour gate.
    expect(due.map((j) => j.name)).toContain("booking-transitions");
  });

  it("holds daily jobs until the interval passes even after their hour", () => {
    const last = new Map([["cron_last_retention", MORNING - 60_000]]);
    // Ran 1 min ago at 09:29 — interval (22h) not met despite hour gate.
    expect(dueJobs(last, MORNING).map((j) => j.name)).not.toContain("retention");
  });
});

describe("claimCronSlot", () => {
  const KEY = "cron_last_test-claim";

  beforeEach(async () => {
    __resetCronSchedulerThrottle();
    await getDb().prepare("DELETE FROM platform_settings WHERE key = @key").run({ key: KEY });
  });

  it("first claimant wins, second loses", async () => {
    const now = Date.now();
    expect(await claimCronSlot(KEY, now, 60_000)).toBe(true);
    expect(await claimCronSlot(KEY, now + 1_000, 60_000)).toBe(false);
  });

  it("slot re-opens after the interval", async () => {
    const now = Date.now();
    expect(await claimCronSlot(KEY, now, 60_000)).toBe(true);
    expect(await claimCronSlot(KEY, now + 61_000, 60_000)).toBe(true);
  });
});

describe("isTrafficSchedulerEnabled", () => {
  const OLD = process.env.CRON_TRAFFIC_SCHEDULER;

  afterEach(() => {
    if (OLD === undefined) delete process.env.CRON_TRAFFIC_SCHEDULER;
    else process.env.CRON_TRAFFIC_SCHEDULER = OLD;
  });

  it("is off by default", () => {
    delete process.env.CRON_TRAFFIC_SCHEDULER;
    expect(isTrafficSchedulerEnabled()).toBe(false);
  });

  it("is on only with explicit 1", () => {
    process.env.CRON_TRAFFIC_SCHEDULER = "1";
    expect(isTrafficSchedulerEnabled()).toBe(true);
    process.env.CRON_TRAFFIC_SCHEDULER = "true";
    expect(isTrafficSchedulerEnabled()).toBe(false);
  });
});
