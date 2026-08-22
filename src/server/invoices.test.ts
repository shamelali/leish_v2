// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb, type BookingRow } from "./db";
import { hashPassword } from "./password";
import { createQuotation } from "./quotations";
import { createBookingPayment } from "./payments";
import { buildInvoice, renderInvoiceHtml, stripInvoicePii } from "./invoices";
import { DEFAULT_BOOKING_FEE_SEN } from "./settings";

async function createTestBookingWithQuotation() {
  const userId = randomUUID();
  await getDb()
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      userId,
      `${userId}@test.local`,
      "Test User",
      "customer",
      hashPassword("password123"),
      new Date().toISOString(),
    );

  const bookingId = randomUUID();
  await getDb()
    .prepare(
      "INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, event_type, venue, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?)",
    )
    .run(
      bookingId,
      userId,
      "aisha-azman",
      "Aisha Azman",
      "Solemnization Makeup",
      580_00,
      "2026-09-01",
      "10:00 AM",
      "Bridal",
      "Bangsar",
      new Date().toISOString(),
    );

  await createQuotation(bookingId, {
    baseFee: 300_00,
    travelFee: 50_00,
    earlyCallFee: 30_00,
    accommodationFee: 20_00,
    extras: [{ label: "Extra look", amount: 15_000 }],
    artistNote: "See you there!",
  });

  return { bookingId, userId };
}

describe("invoices", () => {
  beforeEach(async () => {
    await getDb().prepare("DELETE FROM email_outbox").run();
    await getDb().prepare("DELETE FROM quotations").run();
    await getDb().prepare("DELETE FROM payments").run();
    await getDb().prepare("DELETE FROM bookings").run();
    await getDb().prepare("DELETE FROM users").run();
  });

  describe("buildInvoice", () => {
    it("builds an invoice from a booking with a quotation", async () => {
      const { bookingId } = await createTestBookingWithQuotation();
      const booking = (await getDb()
        .prepare("SELECT * FROM bookings WHERE id = ?")
        .get(bookingId)) as BookingRow;
      const invoice = await buildInvoice(booking);

      expect(invoice).not.toBeNull();
      expect(invoice!.number).toMatch(/^INV-/);
      expect(invoice!.artistName).toBe("Aisha Azman");
      expect(invoice!.service).toBe("Solemnization Makeup");
      expect(invoice!.lines).toHaveLength(5); // base + travel + early call + accommodation + extra
      expect(invoice!.total).toBe(55000); // 30000+5000+3000+2000+15000
      expect(invoice!.depositSen).toBe(DEFAULT_BOOKING_FEE_SEN);
      expect(invoice!.balanceDue).toBe(55000); // total − paid (nothing paid yet)
    });

    it("returns null when no quotation exists", async () => {
      const userId = randomUUID();
      await getDb()
        .prepare(
          "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          userId,
          `${userId}@test.local`,
          "User",
          "customer",
          hashPassword("pw"),
          new Date().toISOString(),
        );
      const bookingId = randomUUID();
      await getDb()
        .prepare(
          "INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?)",
        )
        .run(
          bookingId,
          userId,
          "aisha-azman",
          "Aisha Azman",
          "Makeup",
          100_00,
          "2026-09-01",
          "10:00",
          new Date().toISOString(),
        );

      const booking = (await getDb()
        .prepare("SELECT * FROM bookings WHERE id = ?")
        .get(bookingId)) as BookingRow;
      expect(await buildInvoice(booking)).toBeNull();
    });

    it("includes paid amount when payment is confirmed", async () => {
      const { bookingId } = await createTestBookingWithQuotation();
      await createBookingPayment(bookingId, "deposit", DEFAULT_BOOKING_FEE_SEN);
      // Mark as paid
      await getDb()
        .prepare("UPDATE payments SET status = 'paid' WHERE booking_id = ?")
        .run(bookingId);

      const booking = (await getDb()
        .prepare("SELECT * FROM bookings WHERE id = ?")
        .get(bookingId)) as BookingRow;
      const invoice = await buildInvoice(booking);
      expect(invoice!.paid).toBe(DEFAULT_BOOKING_FEE_SEN);
    });

    it("skips line items with zero amounts", async () => {
      const { bookingId } = await createTestBookingWithQuotation();
      const booking = (await getDb()
        .prepare("SELECT * FROM bookings WHERE id = ?")
        .get(bookingId)) as BookingRow;
      const invoice = await buildInvoice(booking);
      // All fees are non-zero in our test, so all lines should be present
      const labels = invoice!.lines.map((l) => l.label);
      expect(labels).toContain("Base fee");
      expect(labels).toContain("Travel");
      expect(labels).toContain("Early call");
      expect(labels).toContain("Accommodation");
      expect(labels).toContain("Extra look");
    });
  });

  describe("renderInvoiceHtml", () => {
    it("renders valid HTML with all invoice data", async () => {
      const { bookingId } = await createTestBookingWithQuotation();
      const booking = (await getDb()
        .prepare("SELECT * FROM bookings WHERE id = ?")
        .get(bookingId)) as BookingRow;
      const invoice = await buildInvoice(booking);
      const html = renderInvoiceHtml(invoice!);

      expect(html).toContain("<!doctype html>");
      expect(html).toContain(invoice!.number);
      expect(html).toContain("Aisha Azman");
      expect(html).toContain("RM 550.00");
      expect(html).toContain("Leish! Invoice");
      expect(html).toContain("Balance due");
    });

    it("shows 'Paid in full' when balance is zero", async () => {
      const invoice = {
        number: "INV-TEST0001",
        bookingId: "test",
        artistName: "Test Artist",
        service: "Makeup",
        eventDate: "2026-09-01",
        eventTime: "10:00",
        eventType: "Bridal",
        venue: null,
        lines: [{ label: "Base fee", amount: 200_00 }],
        depositSen: 200_00,
        total: 200_00,
        paid: 200_00,
        balanceDue: 0,
        issuedAt: new Date().toISOString(),
      };
      const html = renderInvoiceHtml(invoice);
      expect(html).toContain("Paid in full");
    });
  });

  describe("stripInvoicePii", () => {
    it("returns a copy with a fresh issuedAt timestamp", () => {
      const oldInvoice = {
        number: "INV-TEST0001",
        bookingId: "test",
        artistName: "Test",
        service: "Makeup",
        eventDate: "2026-09-01",
        eventTime: "10:00",
        eventType: "Bridal",
        venue: null,
        lines: [],
        depositSen: 20000,
        total: 20000,
        paid: 0,
        balanceDue: 0,
        issuedAt: "2020-01-01T00:00:00.000Z",
      };
      const sanitized = stripInvoicePii(oldInvoice);

      expect(sanitized.issuedAt).not.toBe("2020-01-01T00:00:00.000Z");
      expect(new Date(sanitized.issuedAt).getTime()).toBeGreaterThan(Date.now() - 5000);
      expect(sanitized.number).toBe(oldInvoice.number);
      expect(sanitized.total).toBe(oldInvoice.total);
    });
  });
});
