import { test, expect } from "@playwright/test";

const ARTIST_ID = "aisha-azman";

interface BookingSummary {
  id: string;
  status: string;
  artist_name: string;
}

test("fee flow: register → create booking → artist accepts → quotation → pay fee → webhook → confirmed", async ({
  page,
  request,
}) => {
  // 1. Register as client
  const clientEmail = `e2e-${Date.now()}@example.com`;
  await request.post("/api/auth/register", {
    data: { name: "E2E Client", email: clientEmail, password: "testpass123", role: "customer" },
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Your Beauty, Perfected/i })).toBeVisible();

  // 2. Login
  await request.post("/api/auth/login", {
    data: { email: clientEmail, password: "testpass123" },
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Your Beauty, Perfected/i })).toBeVisible();

  // 3. Create a booking
  const futureDate = new Date(Date.now() + 14 * 86_400_000);
  const dateISO = futureDate.toISOString().split("T")[0];
  await request.post("/api/bookings", {
    data: {
      artistId: ARTIST_ID,
      service: "Reception Makeup",
      date: dateISO,
      time: "10:00",
      eventType: "Reception",
    },
  });
  // Booking should be in requested state; client sees it in dashboard

  // 4. Artist logs in and accepts the booking
  const artistEmail = `e2e-artist-${Date.now()}@example.com`;
  await request.post("/api/auth/register", {
    data: { name: "E2E MUA", email: artistEmail, password: "testpass123", role: "artist" },
  });
  await request.post("/api/auth/login", {
    data: { email: artistEmail, password: "testpass123" },
  });

  // Artist claims their profile (needed for managing bookings)
  await request.post("/api/artist-profiles", {
    data: { artistId: ARTIST_ID },
  });

  // 5. Artist accepts the booking
  const bookings = await request.get("/api/bookings");
  const bookingBody = await bookings.json();
  const requestedBooking = bookingBody.bookings.find(
    (b: BookingSummary) => b.status === "requested" && b.artist_name === "Aisha Azman",
  );
  expect(requestedBooking).toBeDefined();
  const bookingId = requestedBooking.id;

  await request.patch(`/api/bookings/${bookingId}`, {
    data: { action: "accept" },
  });

  // 6. Client proceeds with quotation (adds items)
  await request.post(`/api/bookings/${bookingId}/quotation`, {
    data: {
      baseFee: 580,
      travelFee: 0,
      earlyCallFee: 0,
      accommodationFee: 0,
      extras: [],
      artistNote: "E2E test quotation",
    },
  });

  // 7. Client pays the RM 200 booking fee (dev provider creates a bill).
  await request.post(`/api/bookings/${bookingId}/pay-fee`, {
    data: {},
  });

  // 8. Verify the booking reaches the confirmed state.
  const checkBookings = await request.get("/api/bookings");
  const checkBody = await checkBookings.json();
  const confirmedBooking = checkBody.bookings.find(
    (b: BookingSummary) => b.id === bookingId && b.status === "confirmed",
  );
  expect(confirmedBooking).toBeDefined();
  expect(confirmedBooking?.status).toBe("confirmed");
});
