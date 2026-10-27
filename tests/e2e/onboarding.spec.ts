import { test, expect } from "@playwright/test";

test("new user onboarding with the placement check leads to a personalised dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Learn chess, one clear step at a time/ })).toBeVisible();
  // First-time state shows no invented statistics.
  await expect(page.getByText(/Recent progress/)).toHaveCount(0);
  await page.getByRole("link", { name: /Personalise/ }).click();
  await page.getByRole("button", { name: /Personalise my training/ }).click();
  await page.getByText("Beginner", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Improve tactical calculation").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("30 minutes").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Take the check" }).click();
  // Q1 (knight squares): answer wrongly by checking a single wrong square... just show answer to move on.
  for (let q = 0; q < 6; q++) {
    const reveal = page.getByRole("button", { name: /Show answer|Show solution/ });
    const options = page.getByRole("group").getByRole("button");
    if (await options.count()) {
      // Choice question: pick the correct first option.
      await options.first().click();
    } else {
      // Use hints until the reveal button appears, then reveal.
      while (!(await reveal.isVisible())) await page.getByRole("button", { name: /Hint|Another hint/ }).first().click();
      await reveal.click();
    }
    await page.getByRole("button", { name: /Next question|See my recommendation/ }).click();
  }
  await expect(page.getByRole("heading", { name: /You're all set/ })).toBeVisible();
  // Summary is grounded in the answers (some were revealed => missed).
  await expect(page.getByText(/You got \d of 6 right|These were new to you/)).toBeVisible();
  await page.getByRole("button", { name: "Go to my dashboard" }).click();
  await expect(page.getByRole("heading", { name: "Today's training plan" })).toBeVisible();
  await expect(page.getByText("Improve tactical calculation")).toBeVisible();
  // Persisted across reload
  await page.reload();
  await expect(page.getByRole("heading", { name: "Today's training plan" })).toBeVisible();
});

test("onboarding can be skipped straight into the first lesson", async ({ page }) => {
  await page.goto("/onboarding/");
  await page.getByRole("button", { name: /Skip and start the first lesson/ }).click();
  await expect(page).toHaveURL(/\/learn\/board-coordinates\//);
  await expect(page.getByRole("heading", { name: "The board and its coordinates" })).toBeVisible();
});
