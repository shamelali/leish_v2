import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifyWebhookSignature } from "@/lib/payments/billplz";
import type { BillplzWebhookPayload } from "@/lib/payments/types";

/**
 * Billplz sends this as application/x-www-form-urlencoded, not JSON.
 * Always verify x_signature before trusting anything in the payload —
 * this is the only auth on this endpoint since it's a public URL by
 * necessity (Billplz calls it directly, no session).
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const payload = Object.fromEntries(formData.entries()) as unknown as BillplzWebhookPayload;

  let signatureValid: boolean;
  try {
    signatureValid = verifyWebhookSignature(payload);
  } catch (err) {
    console.error("[billplz/webhook] signature verification error", err);
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  if (!signatureValid) {
    console.warn("[billplz/webhook] invalid signature — rejecting", { billId: payload.id });
    return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
  }

  const bookingId = payload.reference_1 ?? payload["reference_1"];
  const isPaid = payload.paid === "true";

  const supabase = createServiceRoleClient();

  // Idempotent — Billplz can retry webhook delivery. The unique constraint
  // on billplz_bill_id means a duplicate insert is a no-op error we can
  // safely swallow after logging.
  const { error: logError } = await supabase.from("payment_transactions").insert({
    booking_id: bookingId,
    billplz_bill_id: payload.id,
    amount: Number(payload.paid_amount) / 100,
    paid: isPaid,
    raw_payload: payload,
  });

  if (logError && logError.code !== "23505") {
    console.error("[billplz/webhook] failed to log transaction", logError);
    return NextResponse.json({ error: "Logging failed." }, { status: 500 });
  }

  if (isPaid && bookingId) {
    const { error: updateError } = await supabase
      .from("bookings")
      .update({ status: "confirmed" })
      .eq("id", bookingId)
      .eq("status", "pending_payment"); // don't clobber an already-processed booking

    if (updateError) {
      console.error("[billplz/webhook] failed to confirm booking", updateError);
      return NextResponse.json({ error: "Booking update failed." }, { status: 500 });
    }

    // TODO: send bookingConfirmationEmail via lib/email/brevo.ts here,
    // fetching client + provider + service details for the template.
  }

  return NextResponse.json({ ok: true });
}
