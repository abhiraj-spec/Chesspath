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
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw, "page should not scroll horizontally").toBeLessThanOrEqual(iw);
}
