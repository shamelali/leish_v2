/**
 * Branded HTML email templates for Leish! notifications.
 *
 * All functions return an HTML string that complements the plain-text body.
 * Uses inline CSS for maximum email client compatibility.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const LOGO_URL = `${SITE_URL}/images/logo.png`;

interface LayoutParams {
  title: string;
  content: string;
}

function layout({ title, content }: LayoutParams): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8f9fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fa;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #eef0f2;">
              <a href="${SITE_URL}" style="text-decoration:none;">
                <img src="${LOGO_URL}" alt="Leish!" height="32" style="display:block;height:32px;width:auto;">
              </a>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px 32px;border-top:1px solid #eef0f2;">
              <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
                Leish! — Your beauty, your booking.
              </p>
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                <a href="${SITE_URL}/settings/notifications" style="color:#6b7280;text-decoration:underline;">Manage email preferences</a>
                &nbsp;·&nbsp;
                <a href="${SITE_URL}" style="color:#6b7280;text-decoration:underline;">Visit Leish!</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;padding:12px 24px;background-color:#111827;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;margin-top:16px;">${label}</a>`;
}

function infoRow(label: string, value: string): string {
  return `<p style="margin:4px 0;font-size:14px;color:#374151;"><strong style="color:#111827;">${label}:</strong> ${value}</p>`;
}

/* ── Individual templates ─────────────────────────────────────────────── */

export function bookingCreatedHtml(params: {
  artistName: string;
  service: string;
  date: string;
  time: string;
  bookingId: string;
  dashboardUrl: string;
}): string {
  return layout({
    title: "Booking request received",
    content: `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Booking request received</h2>
      <p style="margin:0 0 24px;font-size:14px;color:#374151;">
        Your booking request with <strong>${params.artistName}</strong> has been received.
      </p>
      <div style="background-color:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        ${infoRow("Service", params.service)}
        ${infoRow("Date", `${params.date} at ${params.time}`)}
        ${infoRow("Reference", `#${params.bookingId.slice(0, 8)}`)}
      </div>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;">
        The artist will confirm shortly. Track your booking in your dashboard.
      </p>
      ${ctaButton(params.dashboardUrl, "View Booking")}
    `,
  });
}

export function quotationEmailHtml(params: {
  artistName: string;
  service: string;
  date: string;
  time: string;
  total: string;
  expires: string;
  bookingId: string;
  dashboardUrl: string;
}): string {
  return layout({
    title: "Your quotation is ready",
    content: `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Your quotation is ready</h2>
      <p style="margin:0 0 24px;font-size:14px;color:#374151;">
        <strong>${params.artistName}</strong> has sent you a quotation.
      </p>
      <div style="background-color:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        ${infoRow("Service", params.service)}
        ${infoRow("Event", `${params.date} at ${params.time}`)}
        ${infoRow("Total", `RM ${params.total}`)}
      </div>
      <p style="margin:0 0 8px;font-size:14px;color:#374151;">
        You have <strong>24 hours</strong> to review and pay the RM 200 booking fee to secure your slot.
      </p>
      <p style="margin:0 0 24px;font-size:13px;color:#6b7280;">
        Expires at ${params.expires} if no action is taken.
      </p>
      ${ctaButton(params.dashboardUrl, "Review Quotation")}
    `,
  });
}

export function invoiceEmailHtml(params: {
  artistName: string;
  service: string;
  date: string;
  bookingId: string;
  invoiceUrl: string;
  invoicePdfUrl: string;
}): string {
  return layout({
    title: "Your invoice",
    content: `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Your invoice</h2>
      <p style="margin:0 0 24px;font-size:14px;color:#374151;">
        Your booking with <strong>${params.artistName}</strong> (${params.service}, ${params.date}) is complete.
      </p>
      <div style="background-color:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0;font-size:14px;color:#374151;">Your invoice is ready:</p>
      </div>
      <div style="display:flex;gap:12px;margin-bottom:16px;">
        ${ctaButton(params.invoiceUrl, "View Invoice")}
        <a href="${params.invoicePdfUrl}" style="display:inline-block;padding:12px 24px;background-color:#ffffff;color:#111827;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;border:1px solid #d1d5db;">Download PDF</a>
      </div>
      <p style="margin:16px 0 0;font-size:14px;color:#374151;">
        Thank you for booking with Leish!
      </p>
    `,
  });
}

export function quotationExpiredHtml(params: {
  artistName: string;
  service: string;
  dashboardUrl: string;
}): string {
  return layout({
    title: "Quotation expired",
    content: `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Quotation expired</h2>
      <p style="margin:0 0 24px;font-size:14px;color:#374151;">
        The quotation for your booking with <strong>${params.artistName}</strong> (${params.service}) has expired because it wasn't actioned within the 24-hour review window.
      </p>
      <p style="margin:0 0 24px;font-size:14px;color:#374151;">
        No worries — you can ask the artist for a fresh quotation anytime.
      </p>
      ${ctaButton(params.dashboardUrl, "Go to Dashboard")}
    `,
  });
}

export function balanceReminderHtml(params: {
  artistName: string;
  service: string;
  date: string;
  balanceAmount: string;
  balanceDueDate: string;
  bookingId: string;
  dashboardUrl: string;
}): string {
  return layout({
    title: "Balance due soon",
    content: `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Balance due soon</h2>
      <p style="margin:0 0 24px;font-size:14px;color:#374151;">
        A gentle reminder about your booking with <strong>${params.artistName}</strong>:
      </p>
      <div style="background-color:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        ${infoRow("Service", params.service)}
        ${infoRow("Event date", params.date)}
        ${infoRow("Balance due", `RM ${params.balanceAmount} by ${params.balanceDueDate}`)}
        ${infoRow("Reference", `#${params.bookingId.slice(0, 8)}`)}
      </div>
      <p style="margin:0 0 24px;font-size:14px;color:#374151;">
        Please complete the payment before the due date to secure your booking.
      </p>
      ${ctaButton(params.dashboardUrl, "View Booking")}
    `,
  });
}

export function bookingStatusChangedHtml(params: {
  artistName: string;
  service: string;
  date: string;
  time: string;
  status: string;
  headline: string;
  bookingId: string;
  dashboardUrl: string;
}): string {
  const statusColors: Record<string, string> = {
    requested: "#f59e0b",
    accepted: "#3b82f6",
    confirmed: "#10b981",
    completed: "#6366f1",
    cancelled: "#ef4444",
  };

  return layout({
    title: `Booking ${params.status}`,
    content: `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">
        Booking ${params.status}
        <span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;color:#ffffff;background-color:${statusColors[params.status] ?? "#6b7280"};vertical-align:middle;margin-left:8px;">${params.status.toUpperCase()}</span>
      </h2>
      <p style="margin:0 0 24px;font-size:14px;color:#374151;">
        Your booking with <strong>${params.artistName}</strong> (${params.service}, ${params.date} at ${params.time}) ${params.headline}.
      </p>
      <div style="background-color:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        ${infoRow("Reference", `#${params.bookingId.slice(0, 8)}`)}
      </div>
      ${ctaButton(params.dashboardUrl, "View Booking")}
    `,
  });
}

export function balanceBillHtml(params: {
  artistName: string;
  service: string;
  date: string;
  balanceAmount: string;
  bookingId: string;
  payUrl: string;
}): string {
  return layout({
    title: "Your balance payment is ready",
    content: `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Balance payment ready</h2>
      <p style="margin:0 0 24px;font-size:14px;color:#374151;">
        The remaining balance for your booking with <strong>${params.artistName}</strong> is now payable:
      </p>
      <div style="background-color:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        ${infoRow("Service", params.service)}
        ${infoRow("Event date", params.date)}
        ${infoRow("Balance due", `RM ${params.balanceAmount}`)}
        ${infoRow("Reference", `#${params.bookingId.slice(0, 8)}`)}
      </div>
      ${ctaButton(params.payUrl, "Pay Balance")}
      <p style="margin:16px 0 0;font-size:12px;color:#6b7280;">
        If the button doesn't work, copy this link into your browser:<br>${params.payUrl}
      </p>
    `,
  });
}

export function payoutSettledHtml(params: {
  service: string;
  eventDate: string;
  netAmount: string;
  payoutsUrl: string;
}): string {
  return layout({
    title: "Payout settled",
    content: `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Payout settled 🎉</h2>
      <p style="margin:0 0 24px;font-size:14px;color:#374151;">
        Your payout has been marked as settled:
      </p>
      <div style="background-color:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        ${infoRow("Service", params.service)}
        ${infoRow("Event date", params.eventDate)}
        ${infoRow("Net amount", `RM ${params.netAmount}`)}
      </div>
      ${ctaButton(params.payoutsUrl, "View Payouts")}
    `,
  });
}

export function verifyEmailHtml(params: { name: string; verifyUrl: string }): string {
  return layout({
    title: "Verify your email",
    content: `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Welcome to Leish!</h2>
      <p style="margin:0 0 24px;font-size:14px;color:#374151;">
        Hi ${params.name},
      </p>
      <p style="margin:0 0 24px;font-size:14px;color:#374151;">
        Please confirm your email address to activate your account.
      </p>
      ${ctaButton(params.verifyUrl, "Verify Email")}
      <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">
        If you didn't create an account, you can safely ignore this email.
      </p>
    `,
  });
}
