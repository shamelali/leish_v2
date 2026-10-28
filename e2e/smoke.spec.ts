import { test, expect } from "@playwright/test";
import { readFixtureState, type CatalogFixtureState } from "./support/catalog";

/**
 * Launch smoke tests for the core loop:
 * browse → request → (verification gate) → accept → quotation → fee → webhook.
 * The webServer in playwright.config.ts writes E2E catalog fixtures to a
 * throwaway SQLite file, then builds and starts the app on :3100.
 */

let artist: CatalogFixtureState["artists"][string];

test.beforeAll(() => {
  artist = readFixtureState().artists["e2e-artist-a"];
});

function futureDateISO(): string {
  const d = new Date(Date.now() + 14 * 86_400_000);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

test("homepage loads with hero and CTAs", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Leish!/);
  await expect(page.getByRole("heading", { name: /Your Beauty, Perfected/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Find & Book Artists/i })).toBeVisible();
});

test("artists listing shows the catalog", async ({ page }) => {
  await page.goto("/artists");
  await expect(page.getByRole("link", { name: artist.name }).first()).toBeVisible();
});

test("artist profile renders services and the booking form", async ({ page }) => {
  await page.goto(`/artists/${artist.slug}`);
  await expect(page.getByRole("heading", { name: artist.name })).toBeVisible();
  await expect(page.getByText("Reception Makeup").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Send Booking Request/i })).toBeVisible();
});

test("unauthenticated bookings API returns 401", async ({ request }) => {
  const res = await request.get("/api/bookings");
  expect(res.status()).toBe(401);
});

test("unverified users can book but cannot pay", async ({ request }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const reg = await request.post("/api/auth/register", {
    data: { name: "E2E Client", email, password: "testpass123", role: "customer", consent: true },
  });
  expect([200, 201]).toContain(reg.status());

  // Booking requests are allowed pre-verification (keeps the flow fast);
  const book = await request.post("/api/bookings", {
    data: {
      artistId: artist.id,
      service: "Reception Makeup",
      date: futureDateISO(),
      time: "10:00",
      eventType: "Reception",
      notes: "e2e smoke",
    },
  });
  expect(book.status()).toBe(201);
  const bookingId = (await book.json()).booking.id as string;

  // …but the deposit is gated on a verified address.
  const pay = await request.post(`/api/bookings/${bookingId}/pay-fee`, { data: {} });
  expect(pay.status()).toBe(403);
  expect(String((await pay.json()).error)).toContain("verify your email");
});

test("unverified artists cannot claim catalog profiles", async ({ request }) => {
  const email = `e2e-artist-${Date.now()}@example.com`;
  const reg = await request.post("/api/auth/register", {
    data: { name: "E2E MUA", email, password: "testpass123", role: "artist", consent: true },
  });
  expect([200, 201]).toContain(reg.status());

  const claim = await request.post("/api/artist-profiles", {
    data: { artistId: artist.id },
  });
  expect(claim.status()).toBe(403);
  const body = await claim.json();
  expect(String(body.error)).toContain("verify your email");
});
