import { test, expect } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./helpers";

const SECTIONS = [
  { path: "/", heading: /Learn chess, one clear step at a time/ },
  { path: "/learn/", heading: "Learn chess step by step" },
  { path: "/puzzles/", heading: "Puzzles" },
  { path: "/play/", heading: "Play against the computer" },
  { path: "/openings/", heading: "Opening explorer" },
  { path: "/analysis/", heading: "Review games" },
  { path: "/progress/", heading: "Your progress" },
  { path: "/settings/", heading: "Settings" },
  { path: "/glossary/", heading: "Glossary" },
  { path: "/openings/italian/", heading: "Italian Game" },
  { path: "/learn/forks/", heading: "Forks" },
];

for (const s of SECTIONS) {
  test(`section ${s.path} renders without overflow`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(s.path);
    await expect(page.getByRole("heading", { level: 1, name: s.heading })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });
}

test("primary navigation works on this viewport", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) {
    const nav = page.getByRole("navigation", { name: "Main sections" });
    await nav.getByRole("link", { name: "Puzzles" }).click();
    await expect(page).toHaveURL(/\/puzzles\//);
    await nav.getByRole("button", { name: "More" }).click();
    await page.getByRole("dialog", { name: "More sections" }).getByRole("link", { name: "Openings" }).click();
    await expect(page).toHaveURL(/\/openings\//);
    await expect(nav.getByRole("button", { name: "More" })).toHaveClass(/text-accent/);
  } else {
    const nav = page.getByRole("complementary", { name: "Primary" });
    for (const label of ["Learn", "Puzzles", "Play", "Openings", "Analysis", "Progress", "Home"]) {
      await nav.getByRole("link", { name: label, exact: true }).click();
      await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    }
  }
});

test("the opening recall trainer records a practised line", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop only");
  await page.goto("/openings/scandinavian/?v=modern&mode=recall");
  for (let i = 0; i < 5; i++) {
    await page.getByRole("button", { name: "Show move" }).click();
    await page.waitForTimeout(700);
  }
  await expect(page.getByTestId("recall-done")).toBeVisible();
  await page.goto("/progress/");
  await expect(page.getByText(/Scandinavian Defence: Modern Variation/).first()).toBeVisible();
});

test("works offline after the first visit", async ({ page, context, isMobile }) => {
  test.skip(isMobile, "desktop only");
  await page.goto("/");
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return Boolean(reg.active);
  });
  // Give the service worker time to precache everything.
  await page.waitForFunction(async () => (await caches.keys()).some((k) => k.startsWith("chesspath-")) && (await (await caches.open((await caches.keys()).find((k) => k.startsWith("chesspath-"))!)).keys()).length > 100, null, { timeout: 60_000 });
  await context.setOffline(true);
  await page.goto("/learn/pins/");
  await expect(page.getByRole("heading", { level: 1, name: "Pins" })).toBeVisible();
  await page.goto("/puzzles/");
  await expect(page.getByRole("heading", { name: /Find the best move/ })).toBeVisible();
  await context.setOffline(false);
});
