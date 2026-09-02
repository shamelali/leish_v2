import { getDb, type UserRow } from "./db";
import { sendEmail, isEmailEnabled } from "./email";
import type { BookingStatus } from "./bookings";
import {
  bookingCreatedHtml,
  quotationEmailHtml,
  invoiceEmailHtml,
  quotationExpiredHtml,
  quotationRecoveryHtml,
  balanceReminderHtml,
  balanceOverdueHtml,
  balanceBillHtml,
  payoutSettledHtml,
  bookingStatusChangedHtml,
  reviewRequestHtml,
} from "./email-templates";

/**
 * Booking lifecycle notifications sent through the email service.
 * Each message is addressed to the booking owner (the client).
 */

async function getOwnerEmail(bookingUserId: string): Promise<string | null> {
  const user = (await getDb().prepare("SELECT * FROM users WHERE id = ?").get(bookingUserId)) as
    UserRow | undefined;
  return user?.email ?? null;
}

export async function notifyBookingCreated(params: {
  bookingId: string;
  ownerUserId: string;
  artistName: string;
  service: string;
  date: string;
  time: string;
}) {
  if (!(await isEmailEnabled(params.ownerUserId, "booking_created"))) return;
  const email = await getOwnerEmail(params.ownerUserId);
  if (!email) return;
  const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/dashboard?booking=${params.bookingId}`;
  await sendEmail({
    to: email,
    subject: "Booking request received — Leish!",
    text: [
      `Hi,`,
      ``,
      `Your booking request with ${params.artistName} has been received:`,
      `  • Service: ${params.service}`,
      `  • Date: ${params.date} at ${params.time}`,
      `  • Reference: #${params.bookingId.slice(0, 8)}`,
      ``,
      `The artist will confirm shortly. Track it in your dashboard:`,
      dashboardUrl,
      ``,
      `— The Leish! team`,
    ].join("\n"),
    html: bookingCreatedHtml({
      ...params,
      dashboardUrl,
    }),
  });
}

export async function sendQuotationEmail(params: {
  bookingId: string;
  ownerUserId: string;
  artistName: string;
  service: string;
  date: string;
  time: string;
  totalSen: number;
  expiresAt: string;
}) {
  if (!(await isEmailEnabled(params.ownerUserId, "quotation_sent"))) return;
  const email = await getOwnerEmail(params.ownerUserId);
  if (!email) return;
  const total = (params.totalSen / 100).toFixed(2);
  const expires = new Date(params.expiresAt).toLocaleString("en-MY");
  const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/dashboard?booking=${params.bookingId}`;
  await sendEmail({
    to: email,
    subject: `Your quotation from ${params.artistName} is ready — Leish!`,
    text: [
      `Hi,`,
      ``,
      `${params.artistName} has sent you a quotation for:`,
      `  • Service: ${params.service}`,
      `  • Event: ${params.date} at ${params.time}`,
      `  • Total: RM ${total}`,
      ``,
      `You have 24 hours to review and pay the booking deposit to secure your slot.`,
      `The quotation expires at ${expires} if no action is taken.`,
      ``,
      `Review it here: ${dashboardUrl}`,
      ``,
      `— The Leish! team`,
    ].join("\n"),
    html: quotationEmailHtml({
      artistName: params.artistName,
      service: params.service,
      date: params.date,
      time: params.time,
      total,
      expires,
      bookingId: params.bookingId,
      dashboardUrl,
    }),
  });
}

export async function sendInvoiceEmail(params: {
  bookingId: string;
  ownerUserId: string;
  artistName: string;
  service: string;
  date: string;
}) {
  if (!(await isEmailEnabled(params.ownerUserId, "invoice_sent"))) return;
  const email = await getOwnerEmail(params.ownerUserId);
  if (!email) return;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const invoiceUrl = `${base}/api/bookings/${params.bookingId}/invoice`;
  const invoicePdfUrl = `${base}/api/bookings/${params.bookingId}/invoice.pdf`;
  await sendEmail({
    to: email,
    subject: `Invoice for your booking with ${params.artistName} — Leish!`,
    text: [
      `Hi,`,
      ``,
      `Your booking with ${params.artistName} (${params.service}, ${params.date}) is complete.`,
      `Your invoice is available here:`,
      ``,
      `  • View online: ${invoiceUrl}`,
      `  • Download PDF: ${invoicePdfUrl}`,
      ``,
      `Thank you for booking with Leish!`,
      `— The Leish! team`,
    ].join("\n"),
    html: invoiceEmailHtml({
      ...params,
      invoiceUrl,
      invoicePdfUrl,
    }),
  });
}

export async function sendQuotationExpiredEmail(params: {
  bookingId: string;
  ownerUserId: string;
  artistName: string;
  service: string;
}) {
  if (!(await isEmailEnabled(params.ownerUserId, "quotation_expiry"))) return;
  const email = await getOwnerEmail(params.ownerUserId);
  if (!email) return;
  const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/dashboard?booking=${params.bookingId}`;
  await sendEmail({
    to: email,
    subject: `Your quotation from ${params.artistName} has expired — Leish!`,
    text: [
      `Hi,`,
      ``,
      `The quotation for your booking with ${params.artistName} (${params.service}) has expired,`,
      `because it wasn't actioned within the 24-hour review window.`,
      ``,
      `No worries — you can ask the artist for a fresh quotation anytime:`,
      dashboardUrl,
      ``,
      `— The Leish! team`,
    ].join("\n"),
    html: quotationExpiredHtml({
      artistName: params.artistName,
      service: params.service,
      dashboardUrl,
    }),
  });
}

export async function sendQuotationRecoveryEmail(params: {
  bookingId: string;
  ownerUserId: string;
  artistName: string;
  service: string;
  date: string;
  time: string;
}) {
  if (!(await isEmailEnabled(params.ownerUserId, "quotation_expiry"))) return;
  const email = await getOwnerEmail(params.ownerUserId);
  if (!email) return;
  const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/dashboard?booking=${params.bookingId}`;
  await sendEmail({
    to: email,
    subject: `Still interested in ${params.artistName}? — Leish!`,
    text: [
      `Hi,`,
      ``,
      `Your quotation from ${params.artistName} for ${params.service}`,
      `(${params.date} at ${params.time}) has expired without payment.`,
      ``,
      `If you're still interested, you can request a fresh quotation anytime —`,
      `your booking details are saved and the slot is still being held for you:`,
      dashboardUrl,
      ``,
      `— The Leish! team`,
    ].join("\n"),
    html: quotationRecoveryHtml({
      artistName: params.artistName,
      service: params.service,
      date: params.date,
      time: params.time,
      dashboardUrl,
    }),
  });
}

export async function sendBalanceReminder(params: {
  bookingId: string;
  ownerUserId: string;
  artistName: string;
  service: string;
  date: string;
  balanceAmount: number; // sen
  balanceDueDate: string; // ISO date
}) {
  if (!(await isEmailEnabled(params.ownerUserId, "balance_reminder"))) return;
  const email = await getOwnerEmail(params.ownerUserId);
  if (!email) return;
  const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/dashboard?booking=${params.bookingId}`;
  await sendEmail({
    to: email,
    subject: `Balance due soon — Leish!`,
    text: [
      `Hi,`,
      ``,
      `A gentle reminder about your booking with ${params.artistName}:`,
      `  • Service: ${params.service}`,
      `  • Event date: ${params.date}`,
      `  • Balance due: RM ${(params.balanceAmount / 100).toFixed(2)} by ${params.balanceDueDate}`,
      `  • Reference: #${params.bookingId.slice(0, 8)}`,
      ``,
      `Please complete the payment before the due date to secure your booking:`,
      dashboardUrl,
      ``,
      `— The Leish! team`,
    ].join("\n"),
    html: balanceReminderHtml({
      artistName: params.artistName,
      service: params.service,
      date: params.date,
      balanceAmount: (params.balanceAmount / 100).toFixed(2),
      balanceDueDate: params.balanceDueDate,
      bookingId: params.bookingId,
      dashboardUrl,
    }),
  });
}

export async function sendBalanceOverdueEmail(params: {
  bookingId: string;
  ownerUserId: string;
  artistName: string;
  service: string;
  date: string;
  balanceAmount: number; // sen
}) {
  if (!(await isEmailEnabled(params.ownerUserId, "balance_reminder"))) return;
  const email = await getOwnerEmail(params.ownerUserId);
  if (!email) return;
  const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/dashboard?booking=${params.bookingId}`;
  await sendEmail({
    to: email,
    subject: `Balance overdue — Leish!`,
    text: [
      `Hi,`,
      ``,
      `Your remaining balance for the booking with ${params.artistName} is still outstanding:`,
      `  • Service: ${params.service}`,
      `  • Event date: ${params.date}`,
      `  • Balance due: RM ${(params.balanceAmount / 100).toFixed(2)}`,
      `  • Reference: #${params.bookingId.slice(0, 8)}`,
      ``,
      `Please settle this balance as soon as possible:`,
      dashboardUrl,
      ``,
      `— The Leish! team`,
    ].join("\n"),
    html: balanceOverdueHtml({
      artistName: params.artistName,
      service: params.service,
      date: params.date,
      balanceAmount: (params.balanceAmount / 100).toFixed(2),
      bookingId: params.bookingId,
      dashboardUrl,
    }),
  });
}
export async function sendBalanceBillEmail(params: {
  bookingId: string;
  ownerUserId: string;
  artistName: string;
  service: string;
  date: string;
  balanceAmount: number; // sen
  payUrl: string;
}) {
  if (!(await isEmailEnabled(params.ownerUserId, "balance_reminder"))) return;
  const email = await getOwnerEmail(params.ownerUserId);
  if (!email) return;
  await sendEmail({
    to: email,
    subject: `Your balance payment is ready — Leish!`,
    text: [
      `Hi,`,
      ``,
      `The remaining balance for your booking with ${params.artistName} is now payable:`,
      `  • Service: ${params.service}`,
      `  • Event date: ${params.date}`,
      `  • Balance due: RM ${(params.balanceAmount / 100).toFixed(2)}`,
      `  • Reference: #${params.bookingId.slice(0, 8)}`,
      ``,
      `Pay securely here: ${params.payUrl}`,
      ``,
      `— The Leish! team`,
    ].join("\n"),
    html: balanceBillHtml({
      artistName: params.artistName,
      service: params.service,
      date: params.date,
      balanceAmount: (params.balanceAmount / 100).toFixed(2),
      bookingId: params.bookingId,
      payUrl: params.payUrl,
    }),
  });
}

export async function notifyPayoutSettled(params: {
  artistUserId: string;
  service: string;
  eventDate: string;
  netSen: number;
}) {
  const artist = (await getDb()
    .prepare("SELECT email FROM users WHERE id = ?")
    .get(params.artistUserId)) as { email: string } | undefined;
  if (!artist?.email) return;
  // Artists have no per-preference key for payouts yet — reuse status_changed.
  if (!(await isEmailEnabled(params.artistUserId, "status_changed"))) return;
  const payoutsUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/dashboard/payouts`;
  await sendEmail({
    to: artist.email,
    subject: `Your payout has been settled — Leish!`,
    text: [
      `Hi,`,
      ``,
      `Good news — your payout has been settled:`,
      `  • Service: ${params.service}`,
      `  • Event date: ${params.eventDate}`,
      `  • Net amount: RM ${(params.netSen / 100).toFixed(2)}`,
      ``,
      `View your payouts: ${payoutsUrl}`,
      ``,
      `— The Leish! team`,
    ].join("\n"),
    html: payoutSettledHtml({
      service: params.service,
      eventDate: params.eventDate,
      netAmount: (params.netSen / 100).toFixed(2),
      payoutsUrl,
    }),
  });
}

export async function notifyBookingStatusChanged(params: {
  bookingId: string;
  ownerUserId: string;
  artistName: string;
  service: string;
  date: string;
  time: string;
  status: BookingStatus;
}) {
  if (!(await isEmailEnabled(params.ownerUserId, "status_changed"))) return;
  const email = await getOwnerEmail(params.ownerUserId);
  if (!email) return;

  const headline: Record<BookingStatus, string> = {
    requested: "is awaiting the artist's response",
    accepted: "has been accepted — a quotation is waiting for your review",
    confirmed: "has been confirmed 🎉 (deposit paid)",
    completed: "has been completed — enjoy your look!",
    cancelled: "has been cancelled",
  };

  const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/dashboard?booking=${params.bookingId}`;
  await sendEmail({
    to: email,
    subject: `Booking ${params.status} — Leish!`,
    text: [
      `Hi,`,
      ``,
      `Your booking with ${params.artistName} (${params.service}, ${params.date} at ${params.time}) ${headline[params.status]}.`,
      `  • Reference: #${params.bookingId.slice(0, 8)}`,
      ``,
      `View in dashboard: ${dashboardUrl}`,
      ``,
      `— The Leish! team`,
    ].join("\n"),
    html: bookingStatusChangedHtml({
      artistName: params.artistName,
      service: params.service,
      date: params.date,
      time: params.time,
      status: params.status,
      headline: headline[params.status],
      bookingId: params.bookingId,
      dashboardUrl,
    }),
  });
}

export async function sendReviewRequestEmail(params: {
  bookingId: string;
  ownerUserId: string;
  artistName: string;
  service: string;
  date: string;
  entityId: string;
  entityType: "artist" | "studio";
}) {
  if (!(await isEmailEnabled(params.ownerUserId, "review_request"))) return;
  const email = await getOwnerEmail(params.ownerUserId);
  if (!email) return;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const reviewUrl = `${siteUrl}/dashboard?booking=${params.bookingId}&action=review`;

  await sendEmail({
    to: email,
    subject: `How was your experience with ${params.artistName}? — Leish!`,
    text: [
      `Hi,`,
      ``,
      `We hope you loved your recent ${params.service} with ${params.artistName} on ${params.date}!`,
      ``,
      `Your feedback helps other clients find great artists. Would you mind leaving a quick review?`,
      ``,
      `Leave a review: ${reviewUrl}`,
      ``,
      `Thank you for using Leish!`,
      ``,
      `— The Leish! team`,
    ].join("\n"),
    html: reviewRequestHtml({
      artistName: params.artistName,
      service: params.service,
      date: params.date,
      reviewUrl,
    }),
  });
}
