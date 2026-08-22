import { test, expect } from "@playwright/test";

/**
 * Static page smoke tests — verify that all public pages render without errors.
 */

const STATIC_PAGES = [
  { path: "/studios", heading: /Studios/i },
  { path: "/contact", heading: /Contact/i },
  { path: "/help", heading: /Help/i },
  { path: "/terms", heading: /Terms/i },
  { path: "/privacy", heading: /Privacy/i },
];

for (const { path, heading } of STATIC_PAGES) {
  test(`static page ${path} renders`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
  });
}

test("booking/success page renders without bookingId", async ({ page }) => {
  await page.goto("/booking/success");
  await expect(page.getByText("Missing booking reference")).toBeVisible();
});

test("404 page renders for nonexistent route", async ({ page }) => {
  const res = await page.goto("/this-page-does-not-exist-abc123");
  expect(res?.status()).toBe(404);
});
