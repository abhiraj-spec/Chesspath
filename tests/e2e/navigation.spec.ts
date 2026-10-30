import { test, expect } from "@playwright/test";
import { expectNoElementPastEdge, expectNoHorizontalOverflow } from "./helpers";

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
  { path: "/privacy/", heading: "Privacy policy" },
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

test("the dashboard of an onboarded user fits the viewport", async ({ page }) => {
  await page.goto("/onboarding/");
  await page.getByRole("button", { name: /Personalise my training/ }).click();
  await page.getByText("Intermediate", { exact: true }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Take the check" }).click();
  await page.getByRole("button", { name: "Stop the check" }).click();
  await page.getByRole("button", { name: "Go to my dashboard" }).click();
  await expect(page.getByRole("heading", { name: "Today's training plan" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

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

test("on touch screens the page scrolls when swiping across empty board squares, but not when dragging a piece", async ({ page, context, isMobile }) => {
  test.skip(!isMobile, "touch-only behaviour");
  await page.goto("/play/");
  await page.getByRole("button", { name: /Start game/ }).click();
  const board = page.locator("[role=application]").first();
  await expect(board).toHaveAttribute("data-fen", /^rnbqkbnr/);
  const box = (await board.boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const swipe = async (x: number, y: number) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - i * 20 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(300);
    return page.evaluate(() => window.scrollY);
  };
  // e4/e5 are empty at the start; e1 holds White's king (the user's piece).
  expect(await swipe(box.x + box.width * (4.5 / 8), box.y + box.height * 0.5)).toBeGreaterThan(0);
  expect(await swipe(box.x + box.width * (4.5 / 8), box.y + box.height * (7.5 / 8))).toBe(0);
});

test("phone screens fit with larger system text and long lesson names", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone-only check");
  // The longest lesson title makes the "Continue: …" buttons as long as they get.
  await page.goto("/learn/lucena-philidor/");
  await page.getByRole("button", { name: "Start lesson" }).click();
  for (const path of ["/", "/learn/", "/puzzles/", "/play/", "/openings/", "/openings/italian/", "/analysis/", "/progress/", "/settings/", "/onboarding/"]) {
    await page.goto(path);
    // Simulate a phone set to 130% text size.
    await page.addStyleTag({ content: "html { font-size: 130% !important; }" });
    await page.waitForTimeout(300);
    await expectNoElementPastEdge(page);
  }
});

test("next-step buttons are reachable without scrolling on a phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone-only check");
  await page.setViewportSize({ width: 390, height: 664 }); // iPhone screen minus Safari's toolbars
  const reachable = async (button: import("@playwright/test").Locator) => {
    const b = (await button.boundingBox())!;
    const navTop = await page.evaluate(() => {
      const navs = [...document.querySelectorAll('nav[aria-label="Main sections"]')].map((n) => n.getBoundingClientRect()).filter((r) => r.height > 0 && r.top > innerHeight / 2);
      return navs.length ? navs[0].top : innerHeight;
    });
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.y + b.height).toBeLessThanOrEqual(navTop + 1);
  };
  await page.goto("/puzzles/");
  await page.getByRole("button", { name: "Show solution" }).click();
  await page.waitForTimeout(600); // smooth scroll to the explanation
  await reachable(page.getByRole("button", { name: "Next puzzle" }));
  await page.goto("/learn/board-coordinates/");
  await page.getByRole("button", { name: "Start lesson" }).click();
  await reachable(page.getByRole("button", { name: /^Continue$/ }));
});
