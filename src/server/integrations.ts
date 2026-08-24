/**
 * Centralized integration status + provider selection.
 *
 * Rules (production):
 * - Email: an explicit `EMAIL_PROVIDER` (dev | resend | postmark) always wins.
 *   When it is unset, an available credential auto-selects the provider
 *   (RESEND_API_KEY → resend, POSTMARK_SERVER_TOKEN → postmark) so production
 *   works without an explicit `EMAIL_PROVIDER`.
 * - Rate limiting & chat bus: ALWAYS use in-memory (never Upstash at runtime).
 * - Health endpoint reports only the integrations we actually use.
 */

export type EmailProvider = 'dev' | 'resend' | 'postmark';

export function getActiveEmailProvider(): EmailProvider {
  const explicit = process.env.EMAIL_PROVIDER;
  if (explicit === 'resend' || explicit === 'postmark' || explicit === 'dev') {
    return explicit;
  }

  // No (or unknown) explicit provider: auto-detect from configured credentials.
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.POSTMARK_SERVER_TOKEN) return 'postmark';
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
