import { test, expect } from "@playwright/test";
import puzzles from "../../src/content/puzzles/puzzles.json";
import { playUci } from "./helpers";

test("solve a tactical puzzle and see it recorded", async ({ page }) => {
  await page.goto("/puzzles/");
  const board = page.getByTestId("puzzle-board");
  const panel = page.getByTestId("puzzle-panel");
  await expect(page.getByRole("heading", { name: /Find the best move/ })).toBeVisible();
  const id = await panel.getAttribute("data-puzzle-id");
  const p = (puzzles as { id: string; solution: string[] }[]).find((x) => x.id === id)!;
  for (let i = 0; i < p.solution.length; i += 2) {
    await expect(board.locator("[role=application]")).toHaveAttribute("data-fen", /.+/);
    await page.waitForTimeout(900); // setup move / opponent reply animation
    await playUci(page, board, p.solution[i]);
  }
  await expect(page.getByRole("heading", { name: "Solved" })).toBeVisible();
  await expect(page.getByText("Explanation")).toBeVisible();
  await expect(page.getByText(/This session: 1\/1 solved/)).toBeVisible();
  await page.getByRole("button", { name: "Next puzzle" }).click();
  await expect(page.getByRole("heading", { name: /Find the best move/ })).toBeVisible();
});

test("revealing a solution puts the puzzle into the review queue", async ({ page }) => {
  await page.goto("/puzzles/");
  await expect(page.getByRole("heading", { name: /Find the best move/ })).toBeVisible();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Show solution" }).click();
  await expect(page.getByRole("heading", { name: "Solution" })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/added to your review queue/)).toBeVisible();
  await page.goto("/progress/");
  await expect(page.getByRole("heading", { name: "Review queue" })).toBeVisible();
  await expect(page.getByText(/You looked at the solution/)).toBeVisible();
});
