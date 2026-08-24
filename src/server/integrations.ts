/**
 * Centralized integration status + provider selection.
 *
 * Rules (production):
 * - Email: if RESEND_API_KEY or POSTMARK_SERVER_TOKEN is set → use that provider
 *   even if EMAIL_PROVIDER is not explicitly set.
 * - Rate limiting & chat bus: ALWAYS use in-memory (never Upstash at runtime).
 * - Health endpoint reports only the integrations we actually use.
 */

export type EmailProvider = 'dev' | 'resend' | 'postmark';

export function getActiveEmailProvider(): EmailProvider {
  const resendKey = process.env.RESEND_API_KEY;
  const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;

  if (resendKey) return 'resend';
  if (postmarkToken) return 'postmark';
  return 'dev';
}

export function isEmailConfigured(): boolean {
  return getActiveEmailProvider() !== 'dev';
}

export function isBillplzConfigured(): boolean {
  return !!(process.env.BILLPLZ_API_KEY && process.env.BILLPLZ_COLLECTION_ID);
}

export function isTurnstileConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
}

export function isSentryConfigured(): boolean {
  return !!process.env.SENTRY_DSN;
}

export function areWebhooksConfigured(): boolean {
  return !!(process.env.WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET);
}

// Rate limit and chat are intentionally always in-memory in this deployment.
export const rateLimitMode = 'memory' as const;
export const chatMode = 'memory' as const;
