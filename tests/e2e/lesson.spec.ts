import { test, expect } from "@playwright/test";
import { clickSquare } from "./helpers";

async function cont(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /^(Continue|Finish lesson)$/ }).click();
}

test("complete the first beginner lesson and keep the result after reload", async ({ page }) => {
  await page.goto("/learn/board-coordinates/");
  await page.getByRole("button", { name: "Start lesson" }).click();
  const board = page.getByTestId("exercise-board");
  await cont(page); // explanation
  // e4 (single square answers are checked immediately)
  await clickSquare(page, board, "e4");
  await expect(page.getByText("Correct!")).toBeVisible();
  await cont(page);
  // d-file: make a mistake first to see feedback
  await clickSquare(page, board, "c1");
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByText(/You found 0 of 8/)).toBeVisible();
  await clickSquare(page, board, "c1"); // deselect
  for (const r of "12345678") await clickSquare(page, board, `d${r}`);
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByText("Correct!")).toBeVisible();
  await cont(page);
  for (const s of ["d4", "d5", "e4", "e5"]) await clickSquare(page, board, s);
  await page.getByRole("button", { name: "Check answer" }).click();
  await cont(page);
  await page.getByRole("button", { name: "c6", exact: true }).click();
  await cont(page);
  await clickSquare(page, board, "g7");
  await cont(page);
  for (const f of "abcdefgh") await clickSquare(page, board, `${f}2`);
  await page.getByRole("button", { name: "Check answer" }).click();
  await page.getByRole("button", { name: "Finish lesson" }).click();
  await expect(page.getByText("Lesson complete")).toBeVisible();
  await expect(page.getByText("100%")).toBeVisible();

  await page.goto("/learn/");
  await page.reload();
  await expect(page.getByRole("link", { name: /The board and its coordinates/ })).toContainText("Completed");
});

test("an interrupted lesson resumes where it stopped", async ({ page }) => {
  await page.goto("/learn/the-rook/");
  await page.getByRole("button", { name: "Start lesson" }).click();
  await cont(page);
  // Rook squares: reveal via hints to move on quickly
  await page.getByRole("button", { name: "Hint" }).click();
  await page.getByRole("button", { name: "Hint" }).click();
  await page.getByRole("button", { name: "Show answer" }).click();
  await cont(page);
  await expect(page.getByText("Step 3 / 6")).toBeVisible();
  await page.getByRole("link", { name: "Save & exit" }).click();
  await expect(page).toHaveURL(/\/learn\/$/);
  await expect(page.getByRole("link", { name: /^The rook Straight/ })).toContainText("In progress · step 3");
  await page.goto("/learn/the-rook/");
  await page.getByRole("button", { name: "Resume at step 3" }).click();
  await expect(page.getByText("Step 3 / 6")).toBeVisible();
});

test("wrong moves get explained, hints help, and correct moves are confirmed", async ({ page }) => {
  await page.goto("/learn/the-queen/");
  await page.getByRole("button", { name: "Start lesson" }).click();
  // Skip the squares step via reveal
  await page.getByRole("button", { name: "Hint" }).click();
  await page.getByRole("button", { name: "Hint" }).click();
  await page.getByRole("button", { name: "Show answer" }).click();
  await cont(page);
  const board = page.getByTestId("exercise-board");
  // Tempting wrong capture: Qxd6 is defended by the e7 pawn
  await clickSquare(page, board, "d1");
  await clickSquare(page, board, "d6");
  await expect(page.getByText(/pawn on e7 would capture your queen/)).toBeVisible();
  await page.getByRole("button", { name: "Hint" }).click();
  await expect(page.getByText(/Which black pieces can your queen reach/)).toBeVisible();
  await page.waitForTimeout(1000);
  await clickSquare(page, board, "d1");
  await clickSquare(page, board, "a4");
  await expect(page.getByText("Correct!")).toBeVisible();
  await expect(page.getByText(/had no defender/)).toBeVisible();
});
