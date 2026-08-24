/**
 * Shared store for the latest Cloudflare Turnstile token.
 *
 * The widget writes each solved challenge here; auth forms read it when
 * submitting. Kept outside React state so any form can consume it without
 * prop drilling, and so a solved challenge survives a re-render.
 */

let latestToken: string | null = null;

export function setTurnstileToken(token: string | null) {
  latestToken = token;
}

export function getTurnstileToken(): string | null {
  return latestToken;
}
