import { test, expect } from "@playwright/test";
import { readFixtureState, type CatalogFixtureState } from "./support/catalog";

/**
 * DB-backed catalog end-to-end coverage:
 * - Pages render from the database catalog (populated by e2e/support/seed-fixtures.ts).
 * - Client-side filtering works over the server-fetched artist list.
 * - Public API contracts (/api/artists, /api/catalog/artists) stay stable.
 * - Artist detail pages render live reviews from the reviews table.
 *
 * The fixture state is read in beforeAll (not at module scope) so the file
 * exists by the time Playwright loads this spec.
 */

let artistA: CatalogFixtureState["artists"][string];
let artistB: CatalogFixtureState["artists"][string];
let studio: CatalogFixtureState["studios"][string];

test.beforeAll(() => {
  const fixture = readFixtureState();
  artistA = fixture.artists["e2e-artist-a"];
  artistB = fixture.artists["e2e-artist-b"];
  studio = fixture.studios["e2e-studio"];
});

test("browse page renders the catalog", async ({ page }) => {
  await page.goto("/artists");
  await expect(page.getByRole("heading", { name: /Browse Makeup Artists/i })).toBeVisible();

  await expect(page.getByRole("link", { name: artistA.name }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: artistB.name }).first()).toBeVisible();
  // The count is rendered twice (mobile + desktop layouts).
  await expect(page.getByText(/Showing/i).first()).toContainText(/2/);
});

test("browse filters narrow results client-side", async ({ page }) => {
  await page.goto("/artists");
  await expect(page.getByRole("link", { name: artistA.name }).first()).toBeVisible();

  // Filter to Johor → only the Johor fixture remains.
  await page.getByLabel("State").selectOption("Johor");
  await expect(page.getByRole("link", { name: artistB.name }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: artistA.name })).toHaveCount(0);

  // Clearing filters restores the full catalog.
  await page.getByRole("button", { name: /Clear all filters/i }).click();
  await expect(page.getByRole("link", { name: artistA.name }).first()).toBeVisible();
});

test("artist detail shows profile, services and live reviews", async ({ page }) => {
  await page.goto(`/artists/${artistA.slug}`);
  await expect(page.getByRole("heading", { name: artistA.name })).toBeVisible();
  await expect(page.getByText("Reception Makeup").first()).toBeVisible();

  // Reviews are served from the reviews table.
  await expect(page.getByRole("heading", { name: /Reviews/i })).toBeVisible();
  await expect(page.getByText(/E2E fixture review/i)).toBeVisible();
});

test("unknown artist slug returns 404", async ({ page }) => {
  const res = await page.goto("/artists/does-not-exist");
  expect(res?.status()).toBe(404);
});

test("studios list and detail are DB-backed", async ({ page }) => {
  await page.goto("/studios");
  await expect(page.getByRole("link", { name: studio.name }).first()).toBeVisible();

  await page.goto(`/studios/${studio.slug}`);
  await expect(page.getByRole("heading", { name: studio.name })).toBeVisible();
  await expect(page.getByText(/Bridal Trials/).first()).toBeVisible();
});

test("public artists API applies filters", async ({ request }) => {
  const res = await request.get("/api/artists?state=Johor");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.count).toBe(1);
  expect(body.artists[0].id).toBe(artistB.id);
});

test("full catalog API returns every artist", async ({ request }) => {
  const res = await request.get("/api/catalog/artists");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.count).toBeGreaterThanOrEqual(2);
  const ids = body.artists.map((a: { id: string }) => a.id);
  expect(ids).toContain(artistA.id);
  expect(ids).toContain(artistB.id);
});

test("sitemap lists catalog routes", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  const xml = await res.text();
  expect(xml).toContain(`/artists/${artistA.slug}`);
  expect(xml).toContain(`/studios/${studio.slug}`);
});
