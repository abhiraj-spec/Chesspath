import { test, expect } from "@playwright/test";
import { Chess } from "chess.js";
import { boardFen, playUci } from "./helpers";

test("play a full game against the computer, then review it", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/play/");
  await page.getByRole("radio", { name: "Very easy" }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  const board = page.getByTestId("game-board");
  const status = page.getByTestId("game-status");
  // Play legal moves (preferring captures and checks) until the game ends or 60 moves pass.
  for (let i = 0; i < 60; i++) {
    if (await page.getByTestId("game-over").isVisible()) break;
    await expect(status).toHaveText(/Your move|White wins|Black wins|Draw/, { timeout: 30_000 });
    if (await page.getByTestId("game-over").isVisible()) break;
    const fen = await boardFen(board);
    const c = new Chess(fen);
    const moves = c.moves({ verbose: true });
    const pick = moves.find((m) => m.san.includes("#")) ?? moves.find((m) => m.captured === "q") ?? moves.find((m) => m.captured) ?? moves.find((m) => m.san.includes("+")) ?? moves[0];
    await playUci(page, board, pick.from + pick.to + (pick.promotion ?? ""));
    await expect(page.locator(`[role=application][data-fen="${fen}"]`)).toHaveCount(0);
  }
  if (!(await page.getByTestId("game-over").isVisible())) {
    await page.getByRole("button", { name: "Resign" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Resign" }).click();
  }
  await expect(page.getByTestId("game-over")).toBeVisible();
  await page.getByRole("link", { name: "Review this game" }).click();
  await expect(page).toHaveURL(/analysis\/\?game=/);
  await expect(page.getByRole("heading", { name: /You vs Stockfish|Stockfish .* vs You/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start analysis" })).toBeVisible();
});

test("an unfinished game is restored after reload, and takeback works", async ({ page }) => {
  await page.goto("/play/");
  await page.getByRole("button", { name: "Start game" }).click();
  const board = page.getByTestId("game-board");
  await playUci(page, board, "e2e4");
  await expect(page.locator('[aria-label="Moves"] button[data-ply="2"]')).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.locator('[aria-label="Moves"] button[data-ply="2"]')).toBeVisible();
  await expect(page.getByTestId("game-status")).toHaveText(/Your move/);
  await page.getByRole("button", { name: "Take back" }).click();
  await expect(page.locator('[aria-label="Moves"] button[data-ply]')).toHaveCount(0);
  expect(await boardFen(board)).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
});

test("engine failure is reported, the game is preserved and recovery is offered", async ({ page }) => {
  await page.addInitScript(() => {
    (globalThis as { __CHESSPATH_ENGINE_URL__?: string }).__CHESSPATH_ENGINE_URL__ = "/engine/does-not-exist.js";
  });
  await page.goto("/play/");
  await page.getByRole("button", { name: "Start game" }).click();
  const board = page.getByTestId("game-board");
  await playUci(page, board, "d2d4");
  await expect(page.getByText("The engine stopped responding")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Your game is saved and nothing was changed/)).toBeVisible();
  await expect(page.locator('[aria-label="Moves"] button[data-ply="1"]')).toHaveText("d4");
  await expect(page.getByRole("button", { name: "Restart engine and continue" })).toBeVisible();
});
