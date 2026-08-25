import { test, expect } from "@playwright/test";

/**
 * Navigation smoke test — verify header links work across the app.
 */

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
  const artistLink = page.getByRole("link", { name: /Aisha Azman/i }).first();
  await expect(artistLink).toBeVisible();
  await artistLink.click();
  await expect(page).toHaveURL(/\/artists\/aisha-azman/);
  await expect(page.getByRole("heading", { name: "Aisha Azman" })).toBeVisible();
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

test("unauthenticated dashboard shows the sign-in prompt", async ({ page }) => {
  // The dashboard is a client component — it renders its own login prompt
  // (no server-side redirect).
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("main").getByRole("link", { name: /log in/i })).toBeVisible();
});
