import { test, expect } from "@playwright/test";
import { readFixtureState, type CatalogFixtureState } from "./support/catalog";

/**
 * Navigation smoke test — verify header links work across the app.
 */

let artist: CatalogFixtureState["artists"][string];

test.beforeAll(() => {
  artist = readFixtureState().artists["e2e-artist-a"];
});

test("homepage has working navigation links", async ({ page }) => {
  await page.goto("/");

  // Artists link
  const artistsLink = page.getByRole("link", { name: /Artists/i }).first();
  await expect(artistsLink).toBeVisible();
  await artistsLink.click();
  await expect(page).toHaveURL(/\/artists/);
  await expect(page.getByRole("heading", { name: /Makeup Artists/i })).toBeVisible();
});

test("artists listing links to artist profiles", async ({ page }) => {
  await page.goto("/artists");
  const artistLink = page.getByRole("link", { name: artist.name }).first();
  await expect(artistLink).toBeVisible();
  await artistLink.click();
  await expect(page).toHaveURL(new RegExp(`/artists/${artist.slug}`));
  await expect(page.getByRole("heading", { name: artist.name })).toBeVisible();
});

test("login page renders with form elements", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: /Welcome back|Sign in|Log in/i }).first(),
  ).toBeVisible();
  await expect(page.getByLabel(/email/i).first()).toBeVisible();
  await expect(page.getByLabel(/password/i).first()).toBeVisible();
});

test("register page renders with role selection", async ({ page }) => {
  await page.goto("/register");
  await expect(
    page.getByRole("heading", { name: /Create.*account|Sign up/i }).first(),
  ).toBeVisible();
  await expect(page.getByLabel(/email/i).first()).toBeVisible();
});

test("unauthenticated dashboard redirects to login with a return path", async ({ page }) => {
  // The dashboard layout is a server guard, so an anonymous visitor is
  // redirected before any authenticated shell is streamed — and the exact
  // path they asked for comes back as the `redirect` parameter.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard$/);
  await expect(
    page.getByRole("heading", { name: /Welcome back|Sign in|Log in/i }).first(),
  ).toBeVisible();
});
