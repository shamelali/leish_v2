import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifyWebhookSignature } from "@/lib/payments/billplz";
import { sendTransactionalEmail } from "@/lib/email/brevo";
import { bookingConfirmationEmail } from "@/lib/email/templates";
import { logger } from "@/server/logger";
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
      logger.error({ updateError }, "[billplz/webhook] failed to confirm booking");
      return NextResponse.json({ error: "Booking update failed." }, { status: 500 });
    }

    // Send booking confirmation email
    try {
      // Fetch booking details to populate email template
      const { data: booking } = await supabase
        .from("bookings")
        .select(
          `
          id,
          clients:profiles!bookings_client_id_fkey (full_name, email),
          providers:providers (display_name),
          services:name,
          availability_slots (start_at)
        `,
        )
        .eq("id", bookingId)
        .single();

      if (booking) {
        const clientName = booking.clients?.full_name || "Client";
        const clientEmail = booking.clients?.email || "";
        const providerName = booking.providers?.display_name || "Artist";
        const serviceName = booking.services?.name || "Service";
        const dateTime = booking.availability_slots?.start_at
          ? new Date(booking.availability_slots.start_at).toLocaleString()
          : "TBD";

        await sendTransactionalEmail({
          to: [{ email: clientEmail, name: clientName }],
          ...bookingConfirmationEmail({
            clientName,
            providerName,
            serviceName,
            dateTime,
            amount: booking.amount,
          }),
        });
      }
    } catch (emailError) {
      logger.error({ emailError }, "[billplz/webhook] failed to send confirmation email");
      // Don't fail the webhook if email fails — booking is still confirmed
    }
  }

  return NextResponse.json({ ok: true });
}
