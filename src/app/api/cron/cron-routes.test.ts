// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/balance-reminders", () => ({
  runBalanceReminderSweep: vi.fn().mockResolvedValue({
    candidates: 2,
    reminded: 1,
    escalated: 0,
    skipped: 1,
  }),
}));

vi.mock("@/server/booking-transitions", () => ({
  runAllAutoTransitions: vi.fn().mockResolvedValue({
    completed: 1,
    cancelled: 0,
    notified: 1,
  }),
}));

vi.mock("@/server/email", () => ({
  retryFailedEmails: vi.fn().mockResolvedValue({
    retried: 1,
    succeeded: 1,
    failed: 0,
  }),
}));

vi.mock("@/server/payout-automation", () => ({
  runPayoutAutomation: vi.fn().mockResolvedValue({
    settled: 1,
    failed: 0,
    pendingRemaining: 0,
  }),
}));

vi.mock("@/server/quotations", () => ({
  findExpiredQuotations: vi.fn().mockResolvedValue([
    { id: "q-1", booking_id: "b-1" },
    { id: "q-missing", booking_id: "b-missing" },
  ]),
  markQuotationExpired: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/server/db", () => ({
  getDb: () => ({
    prepare: () => ({
      get: async (id: string) =>
        id === "b-1"
          ? {
              id: "b-1",
              user_id: "u-1",
              artist_name: "Aisha Azman",
              service: "Bridal Makeup",
            }
          : undefined,
    }),
  }),
}));

vi.mock("@/server/booking-emails", () => ({
  sendQuotationExpiredEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/quotation-recovery", () => ({
  runQuotationRecoverySweep: vi.fn().mockResolvedValue({
    recovered: 1,
    released: 0,
    skipped: 0,
  }),
}));

vi.mock("@/server/review-requests", () => ({
  runReviewRequestSweep: vi.fn().mockResolvedValue({
    requested: 1,
    skipped: 0,
    errors: 0,
  }),
}));

vi.mock("@/server/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import * as balanceReminders from "./balance-reminders/route";
import * as bookingTransitions from "./booking-transitions/route";
import * as emailRetries from "./email-retries/route";
import * as payoutAutomation from "./payout-automation/route";
import * as quotationExpiry from "./quotation-expiry/route";
import * as quotationRecovery from "./quotation-recovery/route";
import * as retention from "./retention/route";
import * as reviewRequests from "./review-requests/route";

const CRON_ROUTES = [
  { name: "balance-reminders", mod: balanceReminders },
  { name: "booking-transitions", mod: bookingTransitions },
  { name: "email-retries", mod: emailRetries },
  { name: "payout-automation", mod: payoutAutomation },
  { name: "quotation-expiry", mod: quotationExpiry },
  { name: "quotation-recovery", mod: quotationRecovery },
  { name: "retention", mod: retention },
  { name: "review-requests", mod: reviewRequests },
] as const;

describe("all cron routes enforce fail-closed CRON_SECRET and maxDuration=60", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(CRON_ROUTES)("$name exports maxDuration=60 and dynamic=force-dynamic", ({ mod }) => {
    expect(mod.maxDuration).toBe(60);
    expect(mod.dynamic).toBe("force-dynamic");
  });

  it.each(CRON_ROUTES)(
    "$name fails closed with 500 when CRON_SECRET is unset in production",
    async ({ name, mod }) => {
      vi.stubEnv("CRON_SECRET", "");
      vi.stubEnv("NODE_ENV", "production");

      const getRes = await mod.GET(new Request(`https://leish.my/api/cron/${name}`));
      expect(getRes.status).toBe(500);

      const postRes = await mod.POST(
        new Request(`https://leish.my/api/cron/${name}`, { method: "POST" }),
      );
      expect(postRes.status).toBe(500);
    },
  );

  it.each(CRON_ROUTES)(
    "$name rejects unauthenticated or wrong-secret requests with 401",
    async ({ name, mod }) => {
      vi.stubEnv("CRON_SECRET", "top-secret");

      const missing = await mod.GET(new Request(`https://leish.my/api/cron/${name}`));
      expect(missing.status).toBe(401);

      const wrong = await mod.GET(
        new Request(`https://leish.my/api/cron/${name}`, {
          headers: { authorization: "Bearer wrong-secret" },
        }),
      );
      expect(wrong.status).toBe(401);
    },
  );

  it.each(CRON_ROUTES)(
    "$name executes and returns 200 when Bearer CRON_SECRET is valid",
    async ({ name, mod }) => {
      vi.stubEnv("CRON_SECRET", "top-secret");

      const res = await mod.GET(
        new Request(`https://leish.my/api/cron/${name}`, {
          headers: { authorization: "Bearer top-secret" },
        }),
      );
      expect(res.status).toBe(200);
    },
  );
});
