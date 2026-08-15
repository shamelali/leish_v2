// @vitest-environment node

import { describe, expect, it } from "vitest";
import { applyBookingTransition, confirmOnFeePaid, type BookingStatus } from "./bookings";

const owner = { isOwner: true, role: "customer" as const };
const artist = { isOwner: false, role: "artist" as const };
const stranger = { isOwner: false, role: "customer" as const };
const studio = { isOwner: false, role: "studio" as const };

function expectOk(result: { ok: boolean; status: BookingStatus }, status: BookingStatus) {
  expect(result.ok).toBe(true);
  expect(result.status).toBe(status);
}

describe("applyBookingTransition (leish.my lifecycle)", () => {
  it("allows the MUA to accept a requested booking", () => {
    expectOk(applyBookingTransition("requested", "accept", artist), "accepted");
  });

  it("allows a studio to accept a requested booking", () => {
    expectOk(applyBookingTransition("requested", "accept", studio), "accepted");
  });

  it("allows the MUA to reject a requested booking", () => {
    expectOk(applyBookingTransition("requested", "reject", artist), "cancelled");
  });

  it("blocks customers from accepting or rejecting", () => {
    expect(applyBookingTransition("requested", "accept", owner).ok).toBe(false);
    expect(applyBookingTransition("requested", "reject", owner).ok).toBe(false);
  });

  it("blocks accept/reject on non-requested bookings", () => {
    expect(applyBookingTransition("confirmed", "accept", artist).ok).toBe(false);
    expect(applyBookingTransition("accepted", "reject", artist).ok).toBe(false);
  });

  it("allows the MUA to complete a confirmed booking", () => {
    expectOk(applyBookingTransition("confirmed", "complete", artist), "completed");
  });

  it("blocks completing a non-confirmed booking", () => {
    expect(applyBookingTransition("accepted", "complete", artist).ok).toBe(false);
    expect(applyBookingTransition("requested", "complete", artist).ok).toBe(false);
  });

  it("allows the owner to cancel pending/confirmed bookings", () => {
    expectOk(applyBookingTransition("requested", "cancel", owner), "cancelled");
    expectOk(applyBookingTransition("accepted", "cancel", owner), "cancelled");
    expectOk(applyBookingTransition("confirmed", "cancel", owner), "cancelled");
  });

  it("allows the MUA to cancel an accepted booking", () => {
    expectOk(applyBookingTransition("accepted", "cancel", artist), "cancelled");
  });

  it("blocks a stranger from cancelling", () => {
    const result = applyBookingTransition("requested", "cancel", stranger);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/own bookings/);
  });

  it("blocks all actions on terminal states", () => {
    for (const terminal of ["completed", "cancelled"] as const) {
      expect(applyBookingTransition(terminal, "cancel", owner).ok).toBe(false);
      expect(applyBookingTransition(terminal, "accept", artist).ok).toBe(false);
      expect(applyBookingTransition(terminal, "complete", artist).ok).toBe(false);
    }
  });
});

describe("confirmOnFeePaid (webhook)", () => {
  it("confirms an accepted booking when the RM 200 fee is paid", () => {
    expectOk(confirmOnFeePaid("accepted"), "confirmed");
  });

  it("rejects confirmation for non-accepted bookings", () => {
    expect(confirmOnFeePaid("requested").ok).toBe(false);
    expect(confirmOnFeePaid("confirmed").ok).toBe(false);
    expect(confirmOnFeePaid("completed").ok).toBe(false);
  });
});
