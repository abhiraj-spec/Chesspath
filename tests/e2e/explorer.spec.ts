import { test, expect } from "@playwright/test";
import { boardFen, playUci } from "./helpers";

test("set up a position from FEN, explore it with Stockfish and copy the FEN", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/analysis/");
  const input = page.getByLabel(/Paste a FEN/);
  // Invalid input is explained, not silently ignored.
  await input.fill("8/8/8/8/8/8/8/8 w - - 0 1");
  await page.getByRole("button", { name: "Analyse position" }).click();
  await expect(page.locator("#fen-error")).toBeVisible();
  await expect(page).toHaveURL(/\/analysis\/$/);
  // Back-rank position: White mates with Rd8#.
  const fen = "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1";
  await input.fill(fen);
  await page.getByRole("button", { name: "Analyse position" }).click();
  await expect(page.getByRole("heading", { name: "Analyse a position" })).toBeVisible();
  const board = page.getByTestId("explorer-board");
  expect(await boardFen(board)).toBe(fen);
  await expect(page.getByTestId("explorer-lines")).toContainText("#1", { timeout: 60_000 });
  await expect(page.getByTestId("explorer-lines")).toContainText("Rd8#");
  await playUci(page, board, "d1d8");
  await expect(page.getByText("Checkmate: White wins.")).toBeVisible();
  await expect(page.getByLabel("FEN of the board position")).toHaveValue(/^3R2k1\//);
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^3R2k1\/5ppp\/8\/8\/8\/8\/5PPP\/6K1 b - - 1 1$/);
  // Step back to the starting position with the keyboard (outside the board, where arrows move the square cursor).
  await page.getByRole("heading", { name: "Analyse a position" }).click();
  await page.keyboard.press("ArrowLeft");
  expect(await boardFen(board)).toBe(fen);
});

test("an impossible FEN in the address is rejected with a reason", async ({ page }) => {
  // Black king in check with White to move: cannot arise in a game.
  await page.goto(`/analysis/?fen=${encodeURIComponent("4k3/8/8/8/8/8/8/4R1K1 w - - 0 1")}`);
  await expect(page.getByText("This position can't be analysed")).toBeVisible();
  await expect(page.getByText(/side not to move is in check/)).toBeVisible();
});
