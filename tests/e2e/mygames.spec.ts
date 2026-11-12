import { test, expect, type Page } from "@playwright/test";
import { expectNoElementPastEdge, expectNoHorizontalOverflow } from "./helpers";

/** A game in the shape Chess.com's public API returns. */
function ccGame(id: number, white: string, black: string, moves: string, wResult: string, bResult: string, extra: Record<string, unknown> = {}) {
  const sans = moves.split(" ");
  const text = sans.map((san, i) => `${Math.floor(i / 2) + 1}${i % 2 === 0 ? "." : "..."} ${san} {[%clk 0:0${9 - Math.floor(i / 8)}:1${i % 10}.5]}`).join(" ");
  const result = wResult === "win" ? "1-0" : bResult === "win" ? "0-1" : "1/2-1/2";
  return {
    url: `https://www.chess.com/game/live/${id}`,
    uuid: `uuid-${id}`,
    pgn: `[Event "Live Chess"]\n[Site "Chess.com"]\n[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n\n${text} ${result}\n`,
    time_control: "600",
    time_class: "rapid",
    end_time: 1_790_000_000 + id * 3600,
    rated: true,
    rules: "chess",
    initial_setup: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    white: { username: white, rating: 812, result: wResult },
    black: { username: black, rating: 790, result: bResult },
    ...extra,
  };
}

// The learner (as White) drops the queen on move 9 and resigns: a clear blunder for Stockfish to find.
const HUNG_QUEEN = "e4 e5 Nf3 Nc6 Bc4 Bc5 d3 Nf6 Nc3 d6 Bg5 h6 Bh4 g5 Bg3 Bg4 Qd2 Bxf3 Qxg5 hxg5";
const ITALIAN = "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 Bb3 Ba7 h3 h6 Nbd2 Re8";
const SICILIAN = "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be2 e5 Nb3 Be7 O-O O-O Be3 Be6 Qd2 Nbd7";

const OCTOBER = [
  ccGame(10, "TestLearner", "RivalOne", HUNG_QUEEN, "resigned", "win"),
  ccGame(9, "RivalTwo", "testlearner", SICILIAN, "win", "timeout"),
  ccGame(8, "TestLearner", "RivalThree", ITALIAN, "timeout", "win"),
  ccGame(7, "RivalFour", "TestLearner", SICILIAN, "win", "timeout"),
  ccGame(6, "TestLearner", "VariantFan", ITALIAN, "win", "resigned", { rules: "chess960" }),
];
const SEPTEMBER = [ccGame(3, "TestLearner", "RivalFive", ITALIAN, "win", "resigned"), ccGame(2, "RivalSix", "TestLearner", SICILIAN, "agreed", "agreed"), ccGame(1, "TestLearner", "RivalSeven", ITALIAN, "win", "checkmated")];

async function mockChessCom(page: Page) {
  const calls: string[] = [];
  await page.route("https://api.chess.com/**", async (route) => {
    const url = route.request().url();
    calls.push(url);
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
    if (/\/player\/testlearner\/games\/archives$/.test(url)) return json({ archives: ["https://api.chess.com/pub/player/testlearner/games/2026/09", "https://api.chess.com/pub/player/testlearner/games/2026/10"] });
    if (/\/player\/testlearner\/games\/2026\/10$/.test(url)) return json({ games: OCTOBER });
    if (/\/player\/testlearner\/games\/2026\/09$/.test(url)) return json({ games: SEPTEMBER });
    return json({ code: 0, message: "not found" }, 404);
  });
  return calls;
}

test("fetch Chess.com games by username, see results and a study plan, and check a game with Stockfish", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls = await mockChessCom(page);
  await page.goto("/my-games/");

  // A name that cannot be a username never reaches Chess.com.
  await page.getByLabel("Chess.com username").fill("not a name!");
  await page.getByRole("button", { name: "Find my games" }).click();
  await expect(page.locator("#cc-error")).toContainText("does not look like a Chess.com username");
  expect(calls).toEqual([]);

  // An unknown player gets a clear message.
  await page.getByLabel("Chess.com username").fill("NoSuchPlayer");
  await page.getByRole("button", { name: "Find my games" }).click();
  await expect(page.locator("#cc-error")).toContainText("no player called “nosuchplayer”");

  await page.getByLabel("Chess.com username").fill("TestLearner");
  await page.getByRole("button", { name: "Find my games" }).click();
  await expect(page.getByRole("heading", { name: "testlearner on Chess.com" })).toBeVisible();
  // 7 standard games; the Chess960 game is left out.
  await expect(page.getByText(/7 games from .* 1 left out/)).toBeVisible();
  await expect(page.getByTestId("cc-games").locator("li")).toHaveCount(7);
  await expect(page.getByTestId("cc-games").locator("li").first()).toContainText("White against RivalOne");

  // Results: 2 wins, 1 draw, 4 losses = 36%.
  const all = page.getByRole("row", { name: /All games/ });
  await expect(all).toContainText("7");
  await expect(all).toContainText("36%");
  await expect(page.getByText("On time").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Italian Game" })).toHaveAttribute("href", "/openings/italian/");

  // Study plan from results alone: three of four losses were on the clock.
  const findings = page.getByTestId("findings");
  await expect(findings).toContainText("You lose a lot of games on the clock");
  await expect(findings).toContainText("3 of your 4 losses (75%) were on time");
  await expect(findings.getByRole("link", { name: /Lesson: The blunder check/ }).first()).toHaveAttribute("href", "/learn/blunder-check/");

  // Phone width: nothing cut off.
  await page.setViewportSize({ width: 390, height: 780 });
  await expectNoHorizontalOverflow(page);
  await expectNoElementPastEdge(page);
  await page.setViewportSize({ width: 1280, height: 800 });

  // The games survive a reload (stored on the device), with no further requests.
  const before = calls.length;
  await page.reload();
  await expect(page.getByRole("heading", { name: "testlearner on Chess.com" })).toBeVisible();
  expect(calls.length).toBe(before);

  // Stockfish check of the three newest games.
  await page.getByLabel("Games to check").selectOption("3");
  await page.getByRole("button", { name: "Start the check" }).click();
  await expect(page.getByTestId("engine-stats")).toContainText("Games checked3", { timeout: 240_000 });
  await expect(page.getByRole("button", { name: "Check more games" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("cc-games").getByText("Checked")).toHaveCount(3);
  await expect(page.getByText("4 not checked yet.")).toBeVisible();

  // Reviewing a game opens it in the analysis view, where the queen blunder is marked.
  await page.getByRole("button", { name: "Review the game against RivalOne" }).click();
  await expect(page).toHaveURL(/game=cc_uuid-10/);
  await expect(page.getByRole("button", { name: "Qxg5, Blunder" })).toBeVisible();

  // Removing the import.
  await page.goto("/my-games/");
  await page.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByLabel("Chess.com username")).toBeVisible();
  expect(errors).toEqual([]);
});
