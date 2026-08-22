// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hashPassword } from "./password";
import {
  notifyBookingCreated,
  sendQuotationEmail,
  sendInvoiceEmail,
  sendQuotationExpiredEmail,
  sendBalanceReminder,
  notifyBookingStatusChanged,
} from "./booking-emails";

async function createTestUser() {
  const userId = randomUUID();
  const email = `${userId}@test.local`;
  await getDb()
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      userId,
      email,
      "Test User",
      "customer",
      hashPassword("password123"),
      new Date().toISOString(),
    );
  return { userId, email };
}

async function getLastOutboxEmail() {
  return (await getDb()
    .prepare("SELECT * FROM email_outbox ORDER BY created_at DESC LIMIT 1")
    .get()) as { to_email: string; subject: string; text: string } | undefined;
}

const baseParams = {
  bookingId: randomUUID(),
  artistName: "Aisha Azman",
  service: "Solemnization Makeup",
  date: "2026-09-01",
  time: "10:00 AM",
};

describe("booking-emails", () => {
  beforeEach(async () => {
    await getDb().prepare("DELETE FROM email_outbox").run();
    await getDb().prepare("DELETE FROM quotations").run();
    await getDb().prepare("DELETE FROM payments").run();
    await getDb().prepare("DELETE FROM bookings").run();
    await getDb().prepare("DELETE FROM users").run();
  });

  describe("notifyBookingCreated", () => {
    it("sends an email to the booking owner", async () => {
      const { userId, email } = await createTestUser();
      await notifyBookingCreated({ ...baseParams, ownerUserId: userId });
      const outbox = await getLastOutboxEmail();
      expect(outbox).toBeDefined();
      expect(outbox!.to_email).toBe(email);
      expect(outbox!.subject).toContain("Booking request received");
      expect(outbox!.text).toContain("Aisha Azman");
    });

    it("silently skips when user has no email", async () => {
      await notifyBookingCreated({ ...baseParams, ownerUserId: "nonexistent" });
      const outbox = await getLastOutboxEmail();
      expect(outbox).toBeUndefined();
    });
  });

  describe("sendQuotationEmail", () => {
    it("sends a quotation email with total and expiry", async () => {
      const { userId, email } = await createTestUser();
      await sendQuotationEmail({
        ...baseParams,
        ownerUserId: userId,
        totalSen: 77_000,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
      const outbox = await getLastOutboxEmail();
      expect(outbox).toBeDefined();
      expect(outbox!.to_email).toBe(email);
      expect(outbox!.subject).toContain("quotation");
      expect(outbox!.text).toContain("RM 770.00");
    });

    it("silently skips when user has no email", async () => {
      await sendQuotationEmail({
        ...baseParams,
        ownerUserId: "nonexistent",
        totalSen: 77_000,
        expiresAt: new Date().toISOString(),
      });
      expect(await getLastOutboxEmail()).toBeUndefined();
    });
  });

  describe("sendInvoiceEmail", () => {
    it("sends an invoice email with links", async () => {
      const { userId, email } = await createTestUser();
      await sendInvoiceEmail({ ...baseParams, ownerUserId: userId });
      const outbox = await getLastOutboxEmail();
      expect(outbox).toBeDefined();
      expect(outbox!.to_email).toBe(email);
      expect(outbox!.subject).toContain("Invoice");
      expect(outbox!.text).toContain("/invoice");
    });

    it("silently skips when user has no email", async () => {
      await sendInvoiceEmail({ ...baseParams, ownerUserId: "nonexistent" });
      expect(await getLastOutboxEmail()).toBeUndefined();
    });
  });

  describe("sendQuotationExpiredEmail", () => {
    it("sends an expiry notification", async () => {
      const { userId, email } = await createTestUser();
      await sendQuotationExpiredEmail({
        bookingId: baseParams.bookingId,
        ownerUserId: userId,
        artistName: baseParams.artistName,
        service: baseParams.service,
      });
      const outbox = await getLastOutboxEmail();
      expect(outbox).toBeDefined();
      expect(outbox!.to_email).toBe(email);
      expect(outbox!.subject).toContain("expired");
      expect(outbox!.text).toContain("24-hour");
    });

    it("silently skips when user has no email", async () => {
      await sendQuotationExpiredEmail({
        bookingId: baseParams.bookingId,
        ownerUserId: "nonexistent",
        artistName: baseParams.artistName,
        service: baseParams.service,
      });
      expect(await getLastOutboxEmail()).toBeUndefined();
    });
  });

  describe("sendBalanceReminder", () => {
    it("sends a balance reminder with amount", async () => {
      const { userId, email } = await createTestUser();
      await sendBalanceReminder({
        ...baseParams,
        ownerUserId: userId,
        balanceAmount: 57_000,
        balanceDueDate: "2026-08-29",
      });
      const outbox = await getLastOutboxEmail();
      expect(outbox).toBeDefined();
      expect(outbox!.to_email).toBe(email);
      expect(outbox!.subject).toContain("Balance due");
      expect(outbox!.text).toContain("RM 570.00");
    });

    it("silently skips when user has no email", async () => {
      await sendBalanceReminder({
        ...baseParams,
        ownerUserId: "nonexistent",
        balanceAmount: 57_000,
        balanceDueDate: "2026-08-29",
      });
      expect(await getLastOutboxEmail()).toBeUndefined();
    });
  });

  describe("notifyBookingStatusChanged", () => {
    it("sends a status email for each status", async () => {
      const { userId, email } = await createTestUser();
      for (const status of [
        "requested",
        "accepted",
        "confirmed",
        "completed",
        "cancelled",
      ] as const) {
        await getDb().prepare("DELETE FROM email_outbox").run();
        await notifyBookingStatusChanged({ ...baseParams, ownerUserId: userId, status });
        const outbox = await getLastOutboxEmail();
        expect(outbox).toBeDefined();
        expect(outbox!.to_email).toBe(email);
        expect(outbox!.subject).toContain(status);
      }
    });

    it("silently skips when user has no email", async () => {
      await notifyBookingStatusChanged({
        ...baseParams,
        ownerUserId: "nonexistent",
        status: "confirmed",
      });
      expect(await getLastOutboxEmail()).toBeUndefined();
    });
  });
});
