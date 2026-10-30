import { test, expect } from "@playwright/test";

test("settings apply immediately and persist", async ({ page }) => {
  await page.goto("/settings/");
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("switch", { name: "Show coordinates" }).click();
  await page.getByRole("radio", { name: "Wood" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-board", "brown");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("switch", { name: "Show coordinates" })).toHaveAttribute("aria-checked", "false");
  // Coordinates are gone from boards
  await page.goto("/learn/the-knight/");
  await page.getByRole("button", { name: "Start lesson" }).click();
  const board = page.locator("[role=application]");
  await expect(board.locator("span", { hasText: /^[a-h]$/ })).toHaveCount(0);
  // Back to light, coordinates on
  await page.goto("/settings/");
  await page.getByRole("radio", { name: "Light" }).click();
  await page.getByRole("switch", { name: "Show coordinates" }).click();
  await page.goto("/learn/the-knight/");
  await page.getByRole("button", { name: /Start lesson|Resume/ }).first().click();
  await expect(page.locator("[role=application] span", { hasText: /^a$/ })).toHaveCount(1);
});

test("data export and confirmed reset", async ({ page }) => {
  await page.goto("/learn/the-rook/");
  await page.getByRole("button", { name: "Start lesson" }).click();
  await page.goto("/settings/");
  // The data-safety panel says whether the browser keeps the data, and when the last backup was made.
  const safety = page.getByTestId("data-safety");
  await expect(safety).toContainText(/keep your progress|may delete your progress|can't confirm/);
  await expect(safety).toContainText("You haven't exported a backup yet.");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export progress (JSON)" }).click();
  expect((await download).suggestedFilename()).toMatch(/chesspath-backup/);
  await expect(safety).toContainText(/Last backup: /);
  await page.getByRole("button", { name: "Reset all data" }).click();
  const del = page.getByRole("button", { name: "Delete everything" });
  await expect(del).toBeDisabled();
  await page.getByLabel("Confirmation").fill("RESET");
  await del.click();
  // Wait for the confirmation: leaving the page earlier would cancel the delete transaction.
  await expect(page.getByText("All data deleted.")).toBeVisible();
  await page.goto("/learn/");
  await expect(page.getByRole("link", { name: /^The rook Straight/ })).not.toContainText("In progress");
});
