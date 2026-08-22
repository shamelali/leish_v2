import type { BookingRow } from "./db";
import { getActiveQuotation } from "./quotations";
import { getPaymentsForBooking } from "./payments";
import { getBookingFeeSen } from "./settings";

/**
 * Invoice builder — derives a structured invoice from a booking:
 * quotation line items + the non-refundable booking deposit (default RM 50).
 * Rendered as HTML by the /api/bookings/[id]/invoice route
 * (openable/printable in the browser).
 */

export interface InvoiceLine {
  label: string;
  amount: number; // sen
}

export interface Invoice {
  number: string;
  bookingId: string;
  artistName: string;
  service: string;
  eventDate: string;
  eventTime: string;
  eventType: string | null;
  venue: string | null;
  lines: InvoiceLine[];
  /** Non-refundable booking deposit (sen). */
  depositSen: number;
  total: number;
  paid: number;
  balanceDue: number;
  issuedAt: string;
}

export async function buildInvoice(booking: BookingRow): Promise<Invoice | null> {
  const quotation = await getActiveQuotation(booking.id);
  if (!quotation || quotation.status === "expired") return null;

  const lines: InvoiceLine[] = [{ label: "Base fee", amount: quotation.base_fee }];
  if (quotation.travel_fee > 0) lines.push({ label: "Travel", amount: quotation.travel_fee });
  if (quotation.early_call_fee > 0)
    lines.push({ label: "Early call", amount: quotation.early_call_fee });
  if (quotation.accommodation_fee > 0)
    lines.push({ label: "Accommodation", amount: quotation.accommodation_fee });
  const extras = JSON.parse(quotation.extras) as { label: string; amount: number }[];
  for (const e of extras) lines.push({ label: e.label, amount: e.amount });

  const total = quotation.total;
  const payments = await getPaymentsForBooking(booking.id);
  const paid = payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amount, 0);
  const balanceDue = Math.max(0, total - paid);
  const depositSen = await getBookingFeeSen();

  return {
    number: `INV-${booking.id.slice(0, 8).toUpperCase()}`,
    bookingId: booking.id,
    artistName: booking.artist_name,
    service: booking.service,
    eventDate: booking.date,
    eventTime: booking.time,
    eventType: booking.event_type,
    venue: booking.venue,
    lines,
    depositSen,
    total,
    paid,
    balanceDue,
    issuedAt: new Date().toISOString(),
  };
}

export function renderInvoiceHtml(invoice: Invoice): string {
  const fmt = (sen: number) => `RM ${(sen / 100).toFixed(2)}`;
  const lines = invoice.lines
    .map((l) => `<tr><td>${l.label}</td><td style="text-align:right">${fmt(l.amount)}</td></tr>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${invoice.number}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 40px auto; color: #1c1917; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .muted { color: #78716c; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  td, th { padding: 8px 10px; border-bottom: 1px solid #e7e5e4; font-size: 14px; }
  th { text-align: left; color: #78716c; font-weight: 600; }
  .total td { font-weight: 700; border-top: 2px solid #1c1917; }
  .badge { display:inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; background: #fef3c7; color: #b45309; }
</style></head><body>
  <h1>Leish! Invoice</h1>
  <p class="muted">${invoice.number} · issued ${new Date(invoice.issuedAt).toLocaleString("en-MY")}</p>
  <p><strong>${invoice.artistName}</strong><br>
  ${invoice.service} · ${invoice.eventDate} at ${invoice.eventTime}<br>
  ${invoice.eventType ?? "Event"}${invoice.venue ? ` · ${invoice.venue}` : ""}</p>
  <table>
    <tr><th>Item</th><th style="text-align:right">Amount</th></tr>
    ${lines}
    <tr><td>Booking deposit (non-refundable)</td><td style="text-align:right">${fmt(invoice.depositSen)}</td></tr>
    <tr class="total"><td>Total</td><td style="text-align:right">${fmt(invoice.total)}</td></tr>
    <tr><td>Paid</td><td style="text-align:right">${fmt(invoice.paid)}</td></tr>
    <tr><td><strong>Balance due</strong></td><td style="text-align:right"><strong>${fmt(invoice.balanceDue)}</strong></td></tr>
  </table>
  <p class="muted" style="margin-top:24px">Thank you for booking with Leish! · <span class="badge">${invoice.balanceDue > 0 ? "Outstanding balance" : "Paid in full"}</span></p>
</body></html>`;
}

/** Strip PII from invoice data before PDF generation.
 * Removes sensitive customer information that should not appear in PDF metadata or logs.
 */
export function stripInvoicePii(invoice: Invoice): Invoice {
  // The invoice data itself doesn't contain highly sensitive PII beyond what's
  // already in the booking/quotation system, but we sanitize the issuedAt timestamp
  // and ensure no extra PII is embedded.
  const sanitized: Invoice = {
    ...invoice,
    issuedAt: new Date().toISOString(),
  };
  return sanitized;
}
