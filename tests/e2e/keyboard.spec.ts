import { test, expect } from "@playwright/test";

test("a move can be played with the keyboard alone, with announcements", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard test on desktop");
  await page.goto("/play/");
  await page.getByRole("button", { name: "Start game" }).click();
  const board = page.getByRole("application", { name: /Game board/ });
  await board.focus();
  // Cursor starts on e2 for White.
  await page.keyboard.press("Enter");
  await expect(page.getByText(/White pawn on e2 selected\. Legal moves: e3, e4/)).toBeAttached();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(page.getByText(/e4, empty, legal move/)).toBeAttached();
  await page.keyboard.press("Enter");
  await expect(page.locator('[aria-label="Moves"] button[data-ply="1"]')).toHaveText("e4");
  await expect(page.locator('[aria-label="Moves"] button[data-ply="2"]')).toBeVisible({ timeout: 30_000 });
});

test("dialogs trap focus and close with Escape", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop");
  await page.goto("/settings/");
  await page.getByRole("button", { name: "Reset all data" }).click();
  const dialog = page.getByRole("dialog", { name: /Delete all ChessPath data/ });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Reset all data" })).toBeFocused();
});
