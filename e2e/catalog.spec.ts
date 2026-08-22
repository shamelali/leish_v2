import { test, expect } from "@playwright/test";

/**
 * DB-backed catalog end-to-end coverage:
 * - Pages render from the seeded database catalog (lazy seed on first read).
 * - Client-side filtering works over the server-fetched artist list.
 * - Public API contracts (/api/artists, /api/catalog/artists) stay stable.
 * - Artist detail pages render live reviews from the reviews table.
 */

test("browse page renders the seeded catalog", async ({ page }) => {
  await page.goto("/artists");
  await expect(page.getByRole("heading", { name: /Browse Makeup Artists/i })).toBeVisible();

  // Seeded artists appear as cards.
  await expect(page.getByRole("link", { name: /Aisha Azman/i }).first()).toBeVisible();
  await expect(page.getByText(/Showing/i)).toContainText(/7/);
});

test("browse filters narrow results client-side", async ({ page }) => {
  await page.goto("/artists");
  await expect(page.getByRole("link", { name: /Aisha Azman/i }).first()).toBeVisible();

  // Filter to Johor → only Sofia Rahim remains.
  await page.getByLabel("State").selectOption("Johor");
  await expect(page.getByRole("link", { name: /Sofia Rahim/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Aisha Azman/i })).toHaveCount(0);

  // Clearing filters restores the full catalog.
  await page.getByRole("button", { name: /Clear all filters/i }).click();
  await expect(page.getByRole("link", { name: /Aisha Azman/i }).first()).toBeVisible();
});

test("artist detail shows profile, services and live reviews", async ({ page }) => {
  await page.goto("/artists/aisha-azman");
  await expect(page.getByRole("heading", { name: "Aisha Azman" })).toBeVisible();
  await expect(page.getByText("Reception Makeup").first()).toBeVisible();

  // Legacy seeded reviews are served from the reviews table.
  await expect(page.getByRole("heading", { name: /Reviews/i })).toBeVisible();
  await expect(page.getByText(/made me look like the best version of myself/i)).toBeVisible();
});

test("unknown artist slug returns 404", async ({ page }) => {
  const res = await page.goto("/artists/does-not-exist");
  expect(res?.status()).toBe(404);
});

test("studios list and detail are DB-backed", async ({ page }) => {
  await page.goto("/studios");
  await expect(page.getByRole("link", { name: /The Glow Room/i }).first()).toBeVisible();

  await page.goto("/studios/glow-room-cyberjaya");
  await expect(page.getByRole("heading", { name: "The Glow Room" })).toBeVisible();
  await expect(page.getByText(/Bridal Trials/).first()).toBeVisible();
});

test("public artists API applies filters", async ({ request }) => {
  const res = await request.get("/api/artists?state=Johor");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.count).toBe(1);
  expect(body.artists[0].id).toBe("sofia-rahim");
});

test("full catalog API returns every seeded artist", async ({ request }) => {
  const res = await request.get("/api/catalog/artists");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.count).toBeGreaterThanOrEqual(7);
  const ids = body.artists.map((a: { id: string }) => a.id);
  for (const id of [
    "aisha-azman",
    "maya-tan",
    "sofia-rahim",
    "jason-lee",
    "nur-fatin",
    "hana-mustafa",
    "devi-ramasamy",
  ]) {
    expect(ids).toContain(id);
  }
});

test("sitemap lists catalog routes", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  const xml = await res.text();
  expect(xml).toContain("/artists/aisha-azman");
  expect(xml).toContain("/studios/glow-room-cyberjaya");
});
