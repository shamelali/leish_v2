import { describe, expect, it } from "vitest";
import {
  balanceReminderHtml,
  bookingCreatedHtml,
  bookingStatusChangedHtml,
  invoiceEmailHtml,
  quotationEmailHtml,
  quotationExpiredHtml,
  verifyEmailHtml,
} from "./email-templates";

const base = {
  artistName: "Siti Nurhaliza",
  service: "Bridal Makeup",
  date: "2026-09-12",
  time: "10:00",
  bookingId: "12345678-abcd-ef01-2345-6789abcdef01",
  dashboardUrl: "https://leish.my/dashboard",
};

describe("email templates", () => {
  it("all templates produce a full branded HTML document", () => {
    const htmls = [
      bookingCreatedHtml(base),
      quotationEmailHtml({ ...base, total: "1,200", expires: "2026-08-23 10:00" }),
      invoiceEmailHtml({
        ...base,
        invoiceUrl: "https://leish.my/invoices/1",
        invoicePdfUrl: "https://leish.my/invoices/1.pdf",
      }),
      quotationExpiredHtml({ artistName: base.artistName, service: base.service, dashboardUrl: base.dashboardUrl }),
      balanceReminderHtml({ ...base, balanceAmount: "800", balanceDueDate: "2026-09-05" }),
      bookingStatusChangedHtml({ ...base, status: "confirmed", headline: "was confirmed" }),
      verifyEmailHtml({ name: "Aina", verifyUrl: "https://leish.my/verify?token=abc" }),
    ];

    for (const html of htmls) {
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Leish! — Your beauty, your booking.");
      expect(html).toContain("/images/logo.png");
      expect(html).toContain("Manage email preferences");
    }
  });

  it("bookingCreatedHtml includes service, date and short reference", () => {
    const html = bookingCreatedHtml(base);
    expect(html).toContain("Siti Nurhaliza");
    expect(html).toContain("Bridal Makeup");
    expect(html).toContain("#12345678");
    expect(html).toContain('href="https://leish.my/dashboard"');
    expect(html).toContain("View Booking");
  });

  it("quotationEmailHtml shows total and expiry", () => {
    const html = quotationEmailHtml({ ...base, total: "1,200", expires: "2026-08-23 10:00" });
    expect(html).toContain("RM 1,200");
    expect(html).toContain("24 hours");
    expect(html).toContain("Review Quotation");
  });

  it("invoiceEmailHtml links both invoice views", () => {
    const html = invoiceEmailHtml({
      ...base,
      invoiceUrl: "https://leish.my/invoices/1",
      invoicePdfUrl: "https://leish.my/invoices/1.pdf",
    });
    expect(html).toContain('href="https://leish.my/invoices/1"');
    expect(html).toContain('href="https://leish.my/invoices/1.pdf"');
    expect(html).toContain("Download PDF");
  });

  it("balanceReminderHtml shows amount and due date", () => {
    const html = balanceReminderHtml({ ...base, balanceAmount: "800", balanceDueDate: "2026-09-05" });
    expect(html).toContain("RM 800 by 2026-09-05");
  });

  it("bookingStatusChangedHtml maps known statuses to badge colors", () => {
    for (const [status, color] of [
      ["requested", "#f59e0b"],
      ["accepted", "#3b82f6"],
      ["confirmed", "#10b981"],
      ["completed", "#6366f1"],
      ["cancelled", "#ef4444"],
    ] as const) {
      const html = bookingStatusChangedHtml({ ...base, status, headline: "was updated" });
      expect(html).toContain(`background-color:${color}`);
      expect(html).toContain(status.toUpperCase());
    }
  });

  it("bookingStatusChangedHtml falls back to grey for unknown statuses", () => {
    const html = bookingStatusChangedHtml({
      ...base,
      status: "mystery",
      headline: "was updated",
    });
    expect(html).toContain("background-color:#6b7280");
  });

  it("verifyEmailHtml greets the user and links the verify URL", () => {
    const html = verifyEmailHtml({ name: "Aina", verifyUrl: "https://leish.my/verify?token=abc" });
    expect(html).toContain("Hi Aina");
    expect(html).toContain('href="https://leish.my/verify?token=abc"');
    expect(html).toContain("Verify Email");
  });
});
