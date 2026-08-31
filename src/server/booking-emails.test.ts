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
  sendBalanceBillEmail,
  notifyPayoutSettled,
  notifyBookingStatusChanged,
} from "./booking-emails";

async function createTestUser(emailPrefs?: Record<string, number>) {
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
  if (emailPrefs) {
    await getDb()
      .prepare(
        `INSERT INTO email_preferences (user_id, booking_created, quotation_sent, invoice_sent, 
         quotation_expiry, balance_reminder, status_changed, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        emailPrefs.booking_created ?? 1,
        emailPrefs.quotation_sent ?? 1,
        emailPrefs.invoice_sent ?? 1,
        emailPrefs.quotation_expiry ?? 1,
        emailPrefs.balance_reminder ?? 1,
        emailPrefs.status_changed ?? 1,
        new Date().toISOString(),
      );
  }
  return { userId, email };
}

async function getLastOutboxEmail() {
  return (await getDb()
    .prepare("SELECT * FROM email_outbox ORDER BY created_at DESC LIMIT 1")
    .get()) as { to_email: string; subject: string; text: string; html: string | null } | undefined;
}

const baseParams = {
  bookingId: randomUUID(),
  artistName: "Aisha Azman",
  service: "Solemnization Makeup",
  date: "2026-09-01",
  time: "10:00 AM",
};

describe("booking-emails", () => {
  const origBrevoKey = process.env.BREVO_API_KEY;

  beforeEach(async () => {
    delete process.env.BREVO_API_KEY;
    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
    delete process.env.POSTMARK_SERVER_TOKEN;
    await getDb().prepare("DELETE FROM email_outbox").run();
    await getDb().prepare("DELETE FROM quotations").run();
    await getDb().prepare("DELETE FROM payments").run();
    await getDb().prepare("DELETE FROM bookings").run();
    await getDb().prepare("DELETE FROM users").run();
    await getDb().prepare("DELETE FROM email_preferences").run();
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

    it("respects email preference booking_created", async () => {
      const { userId, email } = await createTestUser({ booking_created: 0 });
      await notifyBookingCreated({ ...baseParams, ownerUserId: userId });
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

    it("respects email preference quotation_sent", async () => {
      const { userId } = await createTestUser({ quotation_sent: 0 });
      await sendQuotationEmail({
        ...baseParams,
        ownerUserId: userId,
        totalSen: 77_000,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
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

    it("respects email preference invoice_sent", async () => {
      const { userId } = await createTestUser({ invoice_sent: 0 });
      await sendInvoiceEmail({ ...baseParams, ownerUserId: userId });
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

    it("respects email preference quotation_expiry", async () => {
      const { userId } = await createTestUser({ quotation_expiry: 0 });
      await sendQuotationExpiredEmail({
        bookingId: baseParams.bookingId,
        ownerUserId: userId,
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

    it("respects email preference balance_reminder", async () => {
      const { userId } = await createTestUser({ balance_reminder: 0 });
      await sendBalanceReminder({
        ...baseParams,
        ownerUserId: userId,
        balanceAmount: 57_000,
        balanceDueDate: "2026-08-29",
      });
      expect(await getLastOutboxEmail()).toBeUndefined();
    });
  });

  describe("sendBalanceBillEmail", () => {
    it("sends a balance bill email with pay URL", async () => {
      const { userId, email } = await createTestUser();
      await sendBalanceBillEmail({
        ...baseParams,
        ownerUserId: userId,
        balanceAmount: 57_000,
        payUrl: "https://pay.example.com/bill/123",
      });
      const outbox = await getLastOutboxEmail();
      expect(outbox).toBeDefined();
      expect(outbox!.to_email).toBe(email);
      expect(outbox!.subject).toContain("balance payment is ready");
      expect(outbox!.text).toContain("RM 570.00");
      expect(outbox!.text).toContain("https://pay.example.com/bill/123");
    });

    it("silently skips when user has no email", async () => {
      await sendBalanceBillEmail({
        ...baseParams,
        ownerUserId: "nonexistent",
        balanceAmount: 57_000,
        payUrl: "https://pay.example.com/bill/123",
      });
      expect(await getLastOutboxEmail()).toBeUndefined();
    });

    it("respects email preference balance_reminder", async () => {
      const { userId } = await createTestUser({ balance_reminder: 0 });
      await sendBalanceBillEmail({
        ...baseParams,
        ownerUserId: userId,
        balanceAmount: 57_000,
        payUrl: "https://pay.example.com/bill/123",
      });
      expect(await getLastOutboxEmail()).toBeUndefined();
    });
  });

  describe("notifyPayoutSettled", () => {
    it("sends a payout settled email to the artist", async () => {
      const artistId = randomUUID();
      await getDb()
        .prepare(
          "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(artistId, `${artistId}@test.local`, "Test Artist", "artist", "x:y", new Date().toISOString());

      await notifyPayoutSettled({
        artistUserId: artistId,
        service: "Bridal Makeup",
        eventDate: "2026-09-01",
        netSen: 45_000,
      });

      const outbox = await getLastOutboxEmail();
      expect(outbox).toBeDefined();
      expect(outbox!.to_email).toBe(`${artistId}@test.local`);
      expect(outbox!.subject).toContain("payout has been settled");
      expect(outbox!.text).toContain("RM 450.00");
    });

    it("silently skips when artist has no email", async () => {
      await notifyPayoutSettled({
        artistUserId: "nonexistent",
        service: "Bridal Makeup",
        eventDate: "2026-09-01",
        netSen: 45_000,
      });
      expect(await getLastOutboxEmail()).toBeUndefined();
    });

    it("respects email preference status_changed", async () => {
      const artistId = randomUUID();
      await getDb()
        .prepare(
          "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(artistId, `${artistId}@test.local`, "Test Artist", "artist", "x:y", new Date().toISOString());
      await getDb()
        .prepare(
          `INSERT INTO email_preferences (user_id, booking_created, quotation_sent, invoice_sent, 
           quotation_expiry, balance_reminder, status_changed, updated_at)
           VALUES (?, 1, 1, 1, 1, 1, 0, ?)`,
        )
        .run(artistId, new Date().toISOString());

      await notifyPayoutSettled({
        artistUserId: artistId,
        service: "Bridal Makeup",
        eventDate: "2026-09-01",
        netSen: 45_000,
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

    it("respects email preference status_changed", async () => {
      const { userId } = await createTestUser({ status_changed: 0 });
      await notifyBookingStatusChanged({ ...baseParams, ownerUserId: userId, status: "confirmed" });
      expect(await getLastOutboxEmail()).toBeUndefined();
    });

    it("uses correct headline for each status", async () => {
      const { userId } = await createTestUser();
      const headlines: Record<string, string> = {
        requested: "is awaiting the artist's response",
        accepted: "has been accepted — a quotation is waiting for your review",
        confirmed: "has been confirmed 🎉 (deposit paid)",
        completed: "has been completed — enjoy your look!",
        cancelled: "has been cancelled",
      };
      for (const [status, expectedHeadline] of Object.entries(headlines)) {
        await getDb().prepare("DELETE FROM email_outbox").run();
        await notifyBookingStatusChanged({ ...baseParams, ownerUserId: userId, status: status as any });
        const outbox = await getLastOutboxEmail();
        expect(outbox!.text).toContain(expectedHeadline);
      }
    });
  });
});
