import { test, expect } from "@playwright/test";

const ARTIST_ID = "aisha-azman";

interface BookingView {
  id: string;
  status: string;
  artist_name: string;
  balanceAmount: number | null;
  balancePayment: { status: string; amount: number } | null;
}

interface RegisterResult {
  email: string;
}

async function registerVerifiedUser(
  request: import("@playwright/test").APIRequestContext,
  opts: { name: string; role: "customer" | "artist" },
): Promise<RegisterResult> {
  const suffix = Date.now() + Math.floor(Math.random() * 10_000);
  const email = `e2e-${opts.role}-${suffix}@example.com`;
  const res = await request.post("/api/auth/register", {
    data: {
      name: opts.name,
      email,
      password: "testpass123",
      role: opts.role,
      consent: true,
    },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.devVerifyUrl).toBeTruthy();
  expect((await request.get(body.devVerifyUrl as string)).status()).toBe(200);
  return { email };
}

/** Deterministic per-run slot so parallel tests/runs never collide or match stale bookings. */
function uniqueSlot(daysFromNow: number): { dateISO: string; time: string } {
  const n = Date.now();
  const dateISO = new Date(Date.now() + daysFromNow * 86_400_000).toISOString().split("T")[0];
  const hh = String(9 + (n % 12)).padStart(2, "0");
  const mm = String(n % 60).padStart(2, "0");
  return { dateISO, time: `${hh}:${mm}` };
}

/**
 * Shared setup: verified client + verified/claiming artist, accepted booking
 * with a quotation, and the deposit paid (dev provider settles instantly, so
 * the booking ends up confirmed). Leaves NO particular user logged in.
 */
async function setupConfirmedBooking(
  request: import("@playwright/test").APIRequestContext,
  opts: { daysFromNow: number; baseFeeSen: number },
): Promise<{ bookingId: string; clientEmail: string; artistEmail: string }> {
  const { dateISO, time } = uniqueSlot(opts.daysFromNow);
  const client = await registerVerifiedUser(request, { name: "E2E Client", role: "customer" });
  await request.post("/api/bookings", {
    data: {
      artistId: ARTIST_ID,
      service: "Reception Makeup",
      date: dateISO,
      time,
      eventType: "Reception",
    },
  });

  const artist = await registerVerifiedUser(request, { name: "E2E MUA", role: "artist" });
  const claim = await request.post("/api/artist-profiles", { data: { artistId: ARTIST_ID } });
  expect([200, 201, 409]).toContain(claim.status()); // 409 = already claimed

  const bookings = await (await request.get("/api/bookings")).json();
  // Match on this test's exact slot — stale requested bookings from earlier
  // runs may exist for the same artist.
  interface SlotBooking extends BookingView {
    date: string;
    time: string;
  }
  const mine = (bookings.bookings as SlotBooking[]).find(
    (b) => b.status === "requested" && b.date === dateISO && b.time === time,
  );
  expect(mine).toBeDefined();
  const bookingId = mine!.id;

  expect(
    (await request.patch(`/api/bookings/${bookingId}`, { data: { action: "accept" } })).status(),
  ).toBe(200);
  expect(
    (
      await request.post(`/api/bookings/${bookingId}/quotation`, {
        data: {
          baseFee: opts.baseFeeSen,
          travelFee: 0,
          earlyCallFee: 0,
          accommodationFee: 0,
          extras: [],
          artistNote: "E2E hybrid flow",
        },
      })
    ).status(),
  ).toBe(201);

  await request.post("/api/auth/login", {
    data: { email: client.email, password: "testpass123" },
  });
  const pay = await request.post(`/api/bookings/${bookingId}/pay-fee`, { data: {} });
  expect(pay.status()).toBe(201);

  return { bookingId, clientEmail: client.email, artistEmail: artist.email };
}

async function login(request: import("@playwright/test").APIRequestContext, email: string) {
  const res = await request.post("/api/auth/login", {
    data: { email, password: "testpass123" },
  });
  expect(res.status()).toBe(200);
}

test("hybrid flow: deposit confirms, balance pays, artist sees payout", async ({ request }) => {
  const { bookingId, artistEmail } = await setupConfirmedBooking(request, {
    daysFromNow: 21,
    baseFeeSen: 100_000, // RM 1,000 quote
  });

  // Booking is confirmed by the deposit.
  const view = await (await request.get("/api/bookings")).json();
  const confirmed = view.bookings.find((b: BookingView) => b.id === bookingId);
  expect(confirmed?.status).toBe("confirmed");
  expect(confirmed.balanceAmount).toBe(95_000); // RM 1,000 − RM 50 deposit

  // Balance is payable after confirmation.
  const payBalance = await request.post(`/api/bookings/${bookingId}/pay-balance`, { data: {} });
  expect(payBalance.status()).toBe(201);
  const balanceBody = await payBalance.json();
  expect(balanceBody.payment.amount).toBe(95_000);
  expect(balanceBody.payment.type).toBe("balance");

  // Double-pay is rejected.
  expect(
    (await request.post(`/api/bookings/${bookingId}/pay-balance`, { data: {} })).status(),
  ).toBe(409);

  // The quotation is fulfilled and the balance payment shows as paid.
  const after = await (await request.get("/api/bookings")).json();
  const paid = after.bookings.find((b: BookingView) => b.id === bookingId);
  expect(paid.balancePayment?.status).toBe("paid");

  // Artist checks their payouts.
  await login(request, artistEmail);
  const payouts = await request.get("/api/me/payouts");
  expect(payouts.status()).toBe(200);
  const mine = (await payouts.json()).payouts.find(
    (p: { bookingId: string }) => p.bookingId === bookingId,
  );
  expect(mine).toBeDefined();
  // net = total − 10% commission − RM 50 deposit = 1,000 − 100 − 50
  expect(mine.grossSen).toBe(100_000);
  expect(mine.commissionSen).toBe(10_000);
  expect(mine.netSen).toBe(85_000);
});

test("refund: balance refundable outside the 3-day window, blocked inside", async ({
  request,
}) => {
  // Case 1: event 14 days out → refund window open.
  const far = await setupConfirmedBooking(request, {
    daysFromNow: 14,
    baseFeeSen: 100_000,
  });
  await request.post(`/api/bookings/${far.bookingId}/pay-balance`, { data: {} });
  await login(request, far.clientEmail);
  expect(
    (await request.patch(`/api/bookings/${far.bookingId}`, { data: { action: "cancel" } })).status(),
  ).toBe(200);
  const refundOk = await request.post(`/api/bookings/${far.bookingId}/refund`, { data: {} });
  expect(refundOk.status()).toBe(200);
  expect((await refundOk.json()).payment.status).toBe("refunded");

  // Case 2: event 2 days out → refund window closed.
  const near = await setupConfirmedBooking(request, {
    daysFromNow: 2,
    baseFeeSen: 100_000,
  });
  await request.post(`/api/bookings/${near.bookingId}/pay-balance`, { data: {} });
  await login(request, near.clientEmail);
  expect(
    (
      await request.patch(`/api/bookings/${near.bookingId}`, { data: { action: "cancel" } })
    ).status(),
  ).toBe(200);
  expect(
    (await request.post(`/api/bookings/${near.bookingId}/refund`, { data: {} })).status(),
  ).toBe(409);
});
