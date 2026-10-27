import { test, expect } from "@playwright/test";

test("import a PGN, analyse it with Stockfish and review key moments", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/analysis/");
  // Malformed input gets a useful error
  await page.getByLabel(/Paste PGN text/).fill("1. e4 e5 2. Ke3");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.locator("#pgn-errors")).toContainText("Ke3");
  // Valid example
  await page.getByRole("button", { name: "Use an example game" }).click();
  await page.getByLabel("Which side did you play?").selectOption("b");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/game=/);
  await page.getByLabel("Depth").selectOption("10");
  await page.getByRole("button", { name: "Start analysis" }).click();
  await expect(page.getByRole("radio", { name: /Key moments/ })).toBeVisible({ timeout: 180_000 });
  // Verification pass: Morphy's winning 15.Bxd7+ must not be labelled a mistake; 15...Nxd7 allows mate.
  await expect(page.getByRole("button", { name: "Bxd7+", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nxd7, Blunder" })).toBeVisible();
  await expect(page.getByText(/approx. accuracy/).first()).toBeVisible();
  await expect(page.getByText(/C41 Philidor Defense/).first()).toBeVisible();
  await page.getByRole("radio", { name: /Key moments/ }).click();
  await page.getByRole("button", { name: "Show on board" }).first().click();
  await page.getByRole("radio", { name: "Engine" }).click();
  await expect(page.getByText(/Live analysis of the board position/)).toBeVisible();
  // Explore a variation without changing the saved game
  await page.goto(page.url());
  await expect(page.getByText("Analysed").or(page.getByRole("radio", { name: /Key moments/ }))).toBeVisible();
});
