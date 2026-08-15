import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifyWebhookSignature } from "@/lib/payments/billplz";
import { sendTransactionalEmail } from "@/lib/email/brevo";
import { bookingConfirmationEmail } from "@/lib/email/templates";
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

    // Send confirmation email via Brevo
    try {
      const { data: bookingData } = await supabase
        .from("bookings")
        .select(
          `
          id,
          amount,
          deposit_amount,
          client_id,
          profiles ( full_name, phone ),
          providers ( display_name ),
          services ( name ),
          availability_slots ( start_at )
        `,
        )
        .eq("id", bookingId)
        .single();

      if (bookingData) {
        let clientEmail: string | undefined = payload.email || undefined;
        if (!clientEmail && bookingData.client_id) {
          const { data: userData } = await supabase.auth.admin.getUserById(bookingData.client_id);
          clientEmail = userData.user?.email;
        }

        if (clientEmail) {
          const profile = Array.isArray(bookingData.profiles)
            ? bookingData.profiles[0]
            : bookingData.profiles;
          const provider = Array.isArray(bookingData.providers)
            ? bookingData.providers[0]
            : bookingData.providers;
          const service = Array.isArray(bookingData.services)
            ? bookingData.services[0]
            : bookingData.services;
          const slot = Array.isArray(bookingData.availability_slots)
            ? bookingData.availability_slots[0]
            : bookingData.availability_slots;

          const clientName = profile?.full_name || payload.name || "Client";
          const providerName = provider?.display_name || "Artist";
          const serviceName = service?.name || "Beauty Service";
          const dateTime = slot?.start_at
            ? new Date(slot.start_at).toLocaleString("en-MY", {
                dateStyle: "full",
                timeStyle: "short",
                timeZone: "Asia/Kuala_Lumpur",
              })
            : "Scheduled Date";

          const template = bookingConfirmationEmail({
            clientName,
            providerName,
            serviceName,
            dateTime,
            amount: Number(bookingData.amount),
          });

          await sendTransactionalEmail({
            to: [{ email: clientEmail, name: clientName }],
            subject: template.subject,
            htmlContent: template.htmlContent,
          });
        }
      }
    } catch (emailErr) {
      // Non-fatal: logged to prevent dropping webhook confirmation response
      console.error("[billplz/webhook] failed to send confirmation email", emailErr);
    }
  }

  return NextResponse.json({ ok: true });
}
