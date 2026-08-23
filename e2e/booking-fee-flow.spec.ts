import { test, expect } from "@playwright/test";

const ARTIST_ID = "aisha-azman";

interface BookingSummary {
  id: string;
  status: string;
  artist_name: string;
}

interface RegisterResult {
  email: string;
  userId: string;
}

/**
 * Registers a user via the API, verifies their email using the devVerifyUrl
 * hook (enabled by E2E_EXPOSE_VERIFY_URL in the playwright webServer), and
 * leaves the session cookie set on the request context.
 */
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
  const verify = await request.get(body.devVerifyUrl as string);
  expect(verify.status()).toBe(200);
  return { email, userId: body.user.id };
}

test("fee flow: register → verify → booking → accept → quotation → deposit → confirmed", async ({
  request,
}) => {
  // 1. Register (and auto-verify) the client — session cookie is set.
  const client = await registerVerifiedUser(request, { name: "E2E Client", role: "customer" });

  // 2. Create a booking, bumping the slot on a rare collision until accepted.
  let bookingId: string | undefined;
  let dateISO = "";
  let time = "";
  for (let attempt = 0; attempt < 5 && !bookingId; attempt++) {
    const n = Date.now() + attempt;
    dateISO = new Date(Date.now() + 14 * 86_400_000).toISOString().split("T")[0];
    time = `${String(9 + (n % 12)).padStart(2, "0")}:${String((n * 7) % 60).padStart(2, "0")}`;
    const res = await request.post("/api/bookings", {
      data: {
        artistId: ARTIST_ID,
        service: "Reception Makeup",
        date: dateISO,
        time,
        eventType: "Reception",
      },
    });
    if (res.status() === 201) {
      bookingId = ((await res.json()) as { booking: { id: string } }).booking.id;
    }
  }
  expect(bookingId).toBeDefined();

  // 3. Artist registers, verifies, claims the profile.
  await registerVerifiedUser(request, { name: "E2E MUA", role: "artist" });
  const claim = await request.post("/api/artist-profiles", {
    data: { artistId: ARTIST_ID },
  });
  expect([200, 201, 409]).toContain(claim.status()); // 409 = already claimed

  // 4. Artist accepts THIS test's booking.
  const accept = await request.patch(`/api/bookings/${bookingId}`, {
    data: { action: "accept" },
  });
  expect(accept.status()).toBe(200);

  // 5. Artist sends the quotation (sen).
  const quote = await request.post(`/api/bookings/${bookingId}/quotation`, {
    data: {
      baseFee: 58_000,
      travelFee: 0,
      earlyCallFee: 0,
      accommodationFee: 0,
      extras: [],
      artistNote: "E2E test quotation",
    },
  });
  expect(quote.status()).toBe(201);

  // 6. Client pays the booking deposit. The dev provider settles instantly
  // (no real Billplz round-trip), so the booking is confirmed right away.
  await request.post("/api/auth/login", {
    data: { email: client.email, password: "testpass123" },
  });
  const pay = await request.post(`/api/bookings/${bookingId}/pay-fee`, { data: {} });
  expect(pay.status()).toBe(201);
  const payBody = await pay.json();
  expect(payBody.payment.status).toBe("paid");

  // 7. Verify the booking reached the confirmed state.
  const check = await (await request.get("/api/bookings")).json();
  const confirmedBooking = check.bookings.find(
    (b: BookingSummary) => b.id === bookingId && b.status === "confirmed",
  );
  expect(confirmedBooking).toBeDefined();
});
