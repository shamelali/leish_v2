// @vitest-environment node

import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import type { Invoice } from "./invoices";
import { buildInvoicePdf } from "./invoice-pdf";

/**
 * Decompress every FlateDecode stream, concatenate, then decode the
 * hex-string text operands pdf-lib emits (e.g. <4C4549534821> -> "LEISH!")
 * so drawn text is searchable.
 */
function extractDecompressedText(pdf: Uint8Array): string {
  const raw = Buffer.from(pdf).toString("latin1");
  const parts: string[] = [];
  const re = /stream\r?\n([\s\S]*?)endstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    try {
      parts.push(inflateSync(Buffer.from(m[1], "latin1")).toString("latin1"));
    } catch {
      // not a compressed stream — skip
    }
  }
  return parts
    .join("\n")
    .replace(/<([0-9A-Fa-f]+)>/g, (_, hex) => Buffer.from(hex, "hex").toString("latin1"));
}

const sampleInvoice: Invoice = {
  number: "INV-ABC12345",
  bookingId: "booking-1",
  artistName: "Aisha Azman",
  service: "Solemnization Makeup",
  eventDate: "2026-09-01",
  eventTime: "10:00 AM",
  eventType: "Solemnization",
  venue: "Dewan Tunku",
  lines: [
    { label: "Base fee", amount: 88_000 },
    { label: "Travel", amount: 8_000 },
  ],
  bookingFee: 20_000,
  total: 116_000,
  paid: 20_000,
  balanceDue: 96_000,
  issuedAt: "2026-08-15T00:00:00.000Z",
};

describe("buildInvoicePdf", () => {
  it("produces a valid PDF with the invoice content", async () => {
    const pdf = await buildInvoicePdf(sampleInvoice);

    // PDF magic header.
    const head = Buffer.from(pdf.slice(0, 5)).toString("ascii");
    expect(head).toBe("%PDF-");

    // Has an xref trailer.
    const tail = Buffer.from(pdf.slice(-16)).toString("latin1");
    expect(tail).toContain("%%EOF");
  });

  it("includes the invoice number, balance and line items", async () => {
    const pdf = await buildInvoicePdf(sampleInvoice);
    const text = extractDecompressedText(pdf);

    expect(text).toContain("INV-ABC12345");
    expect(text).toContain("Balance due");
    expect(text).toContain("RM 960.00"); // balance 96_000 sen
    expect(text).toContain("Base fee");
    expect(text).toContain("Booking fee (non-refundable)");
  });
});
