import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Invoice } from "./invoices";

/**
 * Renders an Invoice as a real PDF (A4) using pdf-lib (pure JS, no native
 * deps). Used by GET /api/bookings/[id]/invoice.pdf and referenced from the
 * completion email.
 */

const ROSE = rgb(0.88, 0.11, 0.3);
const DARK = rgb(0.11, 0.09, 0.09);
const MUTED = rgb(0.47, 0.44, 0.42);
const LIGHT_LINE = rgb(0.9, 0.89, 0.88);

function rm(sen: number): string {
  return `RM ${(sen / 100).toFixed(2)}`;
}

export async function buildInvoicePdf(invoice: Invoice): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const { width } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = 800;

  // Header
  page.drawText("LEISH!", { x: 50, y, size: 26, font: bold, color: ROSE });
  page.drawText("INVOICE", { x: width - 50 - 90, y, size: 20, font: bold, color: DARK });
  y -= 28;
  page.drawText(`No. ${invoice.number}`, {
    x: width - 50 - 90,
    y,
    size: 10,
    font,
    color: MUTED,
  });
  page.drawText(`Issued ${new Date(invoice.issuedAt).toLocaleString("en-MY")}`, {
    x: width - 50 - 90,
    y: y - 14,
    size: 10,
    font,
    color: MUTED,
  });
  y -= 60;

  // Artist + event block
  page.drawText(invoice.artistName, { x: 50, y, size: 14, font: bold, color: DARK });
  y -= 20;
  page.drawText(`${invoice.service} · ${invoice.eventDate} at ${invoice.eventTime}`, {
    x: 50,
    y,
    size: 11,
    font,
    color: MUTED,
  });
  y -= 16;
  page.drawText(`${invoice.eventType ?? "Event"}${invoice.venue ? ` · ${invoice.venue}` : ""}`, {
    x: 50,
    y,
    size: 11,
    font,
    color: MUTED,
  });
  y -= 40;

  // Table header
  page.drawText("Item", { x: 50, y, size: 10, font: bold, color: MUTED });
  page.drawText("Amount", { x: width - 150, y, size: 10, font: bold, color: MUTED });
  y -= 12;
  page.drawLine({
    start: { x: 50, y },
    end: { x: width - 50, y },
    thickness: 1,
    color: LIGHT_LINE,
  });
  y -= 18;

  // Line items
  const rows: Array<[string, number]> = invoice.lines.map((l) => [l.label, l.amount]);
  rows.push(["Booking deposit (non-refundable)", invoice.depositSen]);
  rows.push(["Total", invoice.total]);
  rows.push(["Paid", invoice.paid]);
  rows.push(["Balance due", invoice.balanceDue]);

  for (const [label, amount] of rows) {
    const isTotal = label === "Total" || label === "Balance due";
    const isPaid = label === "Paid";
    page.drawText(label, {
      x: 50,
      y,
      size: isTotal ? 11 : 10,
      font: isTotal ? bold : font,
      color: isPaid ? MUTED : DARK,
    });
    page.drawText(rm(amount), {
      x: width - 150,
      y,
      size: isTotal ? 11 : 10,
      font: isTotal ? bold : font,
      color: isPaid ? MUTED : DARK,
    });
    if (label === "Booking fee (non-refundable)" || label === "Total") {
      y -= 6;
      page.drawLine({
        start: { x: 50, y },
        end: { x: width - 50, y },
        thickness: 1,
        color: LIGHT_LINE,
      });
      y -= 6;
    }
    y -= 18;
  }

  // Footer
  page.drawText(
    invoice.balanceDue > 0
      ? `Outstanding balance of ${rm(invoice.balanceDue)} — due 3 days before the event.`
      : "Paid in full — thank you for booking with Leish!",
    { x: 50, y: 60, size: 10, font, color: MUTED },
  );
  page.drawText("Leish! · Book beauty anywhere.", {
    x: 50,
    y: 44,
    size: 10,
    font,
    color: ROSE,
  });

  return doc.save();
}
