import { test, expect, chromium } from "@playwright/test";

// Closes the whole browser and starts a new one on the same profile directory, which is
// closer to a real browser restart than a page reload.
test("progress and settings survive a full browser restart", async ({ baseURL }, testInfo) => {
  test.setTimeout(120_000);
  const dir = testInfo.outputPath("profile");
  let ctx = await chromium.launchPersistentContext(dir, { baseURL, viewport: { width: 1280, height: 800 } });
  let page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto("/onboarding/");
  await page.getByRole("button", { name: /Skip and start the first lesson/ }).click();
  await page.getByRole("button", { name: "Start lesson" }).click();
  await expect(page.getByText(/Step 1 \//)).toBeVisible();
  await page.goto("/settings/");
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await ctx.close();

  ctx = await chromium.launchPersistentContext(dir, { baseURL, viewport: { width: 1280, height: 800 } });
  page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("heading", { name: "Today's training plan" })).toBeVisible();
  await expect(page.getByText(/Continue: The board and its coordinates/)).toBeVisible();
  await ctx.close();
});
