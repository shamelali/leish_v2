interface SendEmailParams {
  to: { email: string; name?: string }[];
  subject: string;
  htmlContent: string;
}

/**
 * v1 had recurring "401 Key not found" failures on this call in prod —
 * that was a missing/invalid BREVO_API_KEY in the Vercel prod env, not a
 * code bug. Throwing here (instead of swallowing the error) makes that
 * failure visible in Sentry immediately instead of silently dropping
 * booking-confirmation emails.
 */
export async function sendTransactionalEmail(params: SendEmailParams) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error("[brevo] BREVO_API_KEY is not set in this environment.");
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: {
        email: process.env.BREVO_SENDER_EMAIL ?? "hello@leish.my",
        name: process.env.BREVO_SENDER_NAME ?? "Leish",
      },
      to: params.to,
      subject: params.subject,
      htmlContent: params.htmlContent,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[brevo] send failed (${res.status}): ${body}`);
  }

  return res.json();
}
