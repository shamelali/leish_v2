"use client";

/**
 * Client-side Agnost AI analytics helper.
 *
 * Tracks frontend user interactions for analytics.
 * Uses the Agnost REST API directly from the browser.
 */

const AGNOST_ORG_ID = process.env.NEXT_PUBLIC_AGNOST_ORG_ID;
const AGNOST_ENDPOINT = process.env.NEXT_PUBLIC_AGNOST_ENDPOINT || "https://api.agnost.ai";

interface TrackEventParams {
  eventName: string;
  userId?: string;
  properties?: Record<string, unknown>;
}

/**
 * Track a frontend event to Agnost.
 * Safe to call even if env vars are not set (no-op).
 */
export async function trackEvent({
  eventName,
  userId,
  properties,
}: TrackEventParams): Promise<void> {
  if (!AGNOST_ORG_ID) return;

  try {
    await fetch(`${AGNOST_ENDPOINT}/v1/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Org-Id": AGNOST_ORG_ID,
      },
      body: JSON.stringify({
        event: eventName,
        user_id: userId,
        properties,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    // Silent fail — analytics should never break the UX.
  }
}

/**
 * Track an artist profile view.
 */
export function trackArtistView(artistId: string, artistName: string): void {
  trackEvent({
    eventName: "artist_view",
    properties: { artistId, artistName },
  });
}

/**
 * Track a search/filter action.
 */
export function trackSearch(query: string, filters: Record<string, unknown>): void {
  trackEvent({
    eventName: "artist_search",
    properties: { query, ...filters },
  });
}

/**
 * Track a booking form interaction.
 */
export function trackBookingForm(artistId: string, service: string): void {
  trackEvent({
    eventName: "booking_form_open",
    properties: { artistId, service },
  });
}
