import { test, expect } from "@playwright/test";

/**
 * Launch smoke tests for the core loop:
 * browse → request → (verification gate) → accept → quotation → fee → webhook.
 * The webServer in playwright.config.ts builds and starts the app on :3100
 * with the SQLite fallback (no external services needed).
 */

const ARTIST_ID = "aisha-azman";

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
  await expect(page.getByRole("link", { name: /Aisha Azman/i }).first()).toBeVisible();
});

test("artist profile renders services and the booking form", async ({ page }) => {
  await page.goto(`/artists/${ARTIST_ID}`);
  await expect(page.getByRole("heading", { name: "Aisha Azman" })).toBeVisible();
  await expect(page.getByText("Reception Makeup")).toBeVisible();
  await expect(page.getByRole("button", { name: /Send Booking Request/i })).toBeVisible();
});

test("unauthenticated bookings API returns 401", async ({ request }) => {
  const res = await request.get("/api/bookings");
  expect(res.status()).toBe(401);
});

test("registration works and booking is gated on email verification", async ({ request }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const reg = await request.post("/api/auth/register", {
    data: { name: "E2E Client", email, password: "testpass123", role: "customer", consent: true },
  });
  expect([200, 201]).toContain(reg.status());

  const book = await request.post("/api/bookings", {
    data: {
      artistId: ARTIST_ID,
      service: "Reception Makeup",
      date: futureDateISO(),
      time: "10:00",
      eventType: "Reception",
      notes: "e2e smoke",
    },
  });
  expect(book.status()).toBe(403);
  const body = await book.json();
  expect(body.code).toBe("EMAIL_NOT_VERIFIED");
});

test("unverified artists cannot claim catalog profiles", async ({ request }) => {
  const email = `e2e-artist-${Date.now()}@example.com`;
  const reg = await request.post("/api/auth/register", {
    data: { name: "E2E MUA", email, password: "testpass123", role: "artist", consent: true },
  });
  expect([200, 201]).toContain(reg.status());

  const claim = await request.post("/api/artist-profiles", {
    data: { artistId: ARTIST_ID },
  });
  expect(claim.status()).toBe(403);
  const body = await claim.json();
  expect(String(body.error)).toContain("verify your email");
});
