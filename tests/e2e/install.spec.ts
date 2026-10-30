import { test, expect, devices } from "@playwright/test";

// Headless browsers never fire the real install event, so these tests dispatch the same event
// the browser would (with a stubbed prompt) and check what ChessPath does with it.
async function fireInstallEvent(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
    e.prompt = async () => {
      (window as unknown as { __promptCalls: number }).__promptCalls = ((window as unknown as { __promptCalls?: number }).__promptCalls ?? 0) + 1;
    };
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(e);
  });
}

async function onboard(page: import("@playwright/test").Page) {
  await page.goto("/onboarding/");
  await page.getByRole("button", { name: /Skip and start the first lesson/ }).click();
  await expect(page).toHaveURL(/\/learn\//);
}

test("Android/desktop: the install button opens the browser's install dialog", async ({ page }) => {
  await onboard(page);
  await page.goto("/settings/");
  // Without the browser's install event, Settings explains how to install from the browser menu.
  await expect(page.getByTestId("install-state")).toContainText(/Install app|Add to Home screen/);
  await fireInstallEvent(page);
  await page.getByRole("button", { name: "Install ChessPath" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __promptCalls?: number }).__promptCalls ?? 0)).toBe(1);
  // The event can only be used once, so the button goes away.
  await expect(page.getByRole("button", { name: "Install ChessPath" })).toHaveCount(0);
  // Once installed, Settings says so.
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(page.getByTestId("install-state")).toContainText("You are using the installed app.");
});

test("the dashboard suggestion can be dismissed and stays dismissed", async ({ page }) => {
  await onboard(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today's training plan" })).toBeVisible();
  await expect(page.getByTestId("install-banner")).toHaveCount(0); // nothing to offer yet on this browser
  await fireInstallEvent(page);
  await expect(page.getByTestId("install-banner")).toBeVisible();
  await page.getByRole("button", { name: "Dismiss the install suggestion" }).click();
  await expect(page.getByTestId("install-banner")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Today's training plan" })).toBeVisible();
  await fireInstallEvent(page);
  await expect(page.getByTestId("install-banner")).toHaveCount(0);
});

test("iPhone: Add to Home Screen steps are shown", async ({ browser, baseURL }) => {
  const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 13"];
  void _ignored;
  const ctx = await browser.newContext({ ...iphone, baseURL });
  const page = await ctx.newPage();
  await onboard(page);
  await page.goto("/");
  await expect(page.getByTestId("install-banner")).toContainText("Add to Home Screen");
  await page.goto("/settings/");
  await expect(page.getByTestId("install-state")).toContainText("Add to Home Screen");
  await ctx.close();
});
