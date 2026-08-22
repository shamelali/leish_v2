import { z } from "zod";

/**
 * Booking status lifecycle (matches leish.my business rules).
 *
 *   requested -> accepted   (MUA accepts the request)
 *   requested -> cancelled  (MUA rejects, or either side cancels)
 *   accepted  -> confirmed  (booking fee RM 200 paid via Billplz webhook)
 *   confirmed -> completed  (MUA completes the job)
 *   confirmed -> cancelled  (owner or MUA, before the event)
 *
 * Terminal states (completed, cancelled) never change.
 * "confirmed" is reached ONLY by payment — the client-facing actions here
 * are accept / reject / complete / cancel.
 */

export type BookingStatus = "requested" | "accepted" | "confirmed" | "completed" | "cancelled";
export type BookingRole = "customer" | "artist" | "studio" | "admin";

export const bookingActionSchema = z.enum(["accept", "reject", "complete", "cancel"]);

export type BookingAction = z.infer<typeof bookingActionSchema>;

export interface TransitionContext {
  /** true when the acting user owns the booking (is the customer). */
  isOwner: boolean;
  /** acting user's role. */
  role: BookingRole;
}

export interface TransitionResult {
  ok: boolean;
  /** New status when ok, otherwise the current (unchanged) status. */
  status: BookingStatus;
  error?: string;
}

const ARTIST_ROLES: BookingRole[] = ["artist", "studio"];

export function applyBookingTransition(
  current: BookingStatus,
  action: BookingAction,
  ctx: TransitionContext,
): TransitionResult {
  const isArtist = ARTIST_ROLES.includes(ctx.role);

  switch (action) {
    case "accept":
      if (!isArtist) return fail(current, "Only artists can accept requests");
      if (current !== "requested") return fail(current, "Only requested bookings can be accepted");
      return { ok: true, status: "accepted" };

    case "reject":
      if (!isArtist) return fail(current, "Only artists can reject requests");
      if (current !== "requested") return fail(current, "Only requested bookings can be rejected");
      return { ok: true, status: "cancelled" };

    case "complete":
      if (!isArtist) return fail(current, "Only artists can complete bookings");
      if (current !== "confirmed") return fail(current, "Only confirmed bookings can be completed");
      return { ok: true, status: "completed" };

    case "cancel":
      if (current === "completed" || current === "cancelled") {
        return fail(current, "This booking can no longer be cancelled");
      }
      if (!ctx.isOwner && !isArtist) {
        return fail(current, "You can only cancel your own bookings");
      }
      return { ok: true, status: "cancelled" };
  }
}

/** Payment-webhook transition: an accepted booking becomes confirmed. */
export function confirmOnFeePaid(current: BookingStatus): TransitionResult {
  if (current !== "accepted") {
    return {
      ok: false,
      status: current,
      error: "Only accepted bookings can be confirmed by payment",
    };
  }
  return { ok: true, status: "confirmed" };
}

function fail(status: BookingStatus, error: string): TransitionResult {
  return { ok: false, status, error };
}
