import { expect, type Page, type Locator } from "@playwright/test";

/** Click a square on a board (handles orientation). */
export async function clickSquare(page: Page, board: Locator, square: string) {
  const box = (await board.locator("[role=application]").boundingBox())!;
  const orientation = await board.locator("[role=application]").getAttribute("data-orientation");
  const file = "abcdefgh".indexOf(square[0]);
  const rank = Number(square[1]) - 1;
  const col = orientation === "b" ? 7 - file : file;
  const row = orientation === "b" ? rank : 7 - rank;
  const s = box.width / 8;
  await page.mouse.click(box.x + (col + 0.5) * s, box.y + (row + 0.5) * s);
}

/** Make a move by clicking origin then destination (UCI like "e2e4" or "e7e8q"). */
export async function playUci(page: Page, board: Locator, uci: string) {
  await clickSquare(page, board, uci.slice(0, 2));
  await clickSquare(page, board, uci.slice(2, 4));
  if (uci[4]) {
    const names: Record<string, string> = { q: "queen", r: "rook", b: "bishop", n: "knight" };
    await page.getByRole("button", { name: `Promote to ${names[uci[4]]}` }).click();
  }
}

export async function boardFen(board: Locator): Promise<string> {
  return (await board.locator("[role=application]").getAttribute("data-fen"))!;
}

export async function expectNoHorizontalOverflow(page: Page) {
  // Compare with the configured viewport, not window.innerWidth: with mobile
  // emulation the layout viewport widens to fit overflowing content, so
  // innerWidth would hide the problem.
  const vw = page.viewportSize()?.width ?? 0;
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw, "page should not scroll horizontally").toBeLessThanOrEqual(vw);
}

/**
 * Stricter than expectNoHorizontalOverflow: no visible element may extend past the screen edge.
 * (The page clips horizontal overflow, which would otherwise hide content cut off at the edge.)
 */
export async function expectNoElementPastEdge(page: Page) {
  const vw = page.viewportSize()?.width ?? 0;
  const offenders = await page.evaluate((vw) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll("body *")) {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height || getComputedStyle(el).position === "fixed") continue;
      if (b.right <= vw + 1 && b.left >= -1) continue;
      let a = el.parentElement;
      let clipped = false;
      while (a && a !== document.body) {
        if (getComputedStyle(a).overflowX !== "visible" && a.getBoundingClientRect().right <= vw + 1) {
          clipped = true;
          break;
        }
        a = a.parentElement;
      }
      if (!clipped) out.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 40)}" [${Math.round(b.left)}..${Math.round(b.right)}]`);
    }
    return out.slice(0, 5);
  }, vw);
  expect(offenders, "elements extending past the screen edge").toEqual([]);
}
