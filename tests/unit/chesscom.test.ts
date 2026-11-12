import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { CcError, fetchRecentGames, isStandardGame, normaliseUsername } from "@/lib/chesscom/api";
import { readMoves, toCcGame, toCcGames } from "@/lib/chesscom/parse";
import { buildFindings, courseFor, engineFindings, engineStats, lowTimeLimit, openingFamily, resultFindings, summarise, tally, type AnalysedGame } from "@/lib/chesscom/insights";
import { recordId, toGameRecord } from "@/lib/chesscom/store";
import type { CcGame, RawCcGame } from "@/lib/chesscom/types";
import { loadOpeningIndex } from "@/lib/analysis/openingIndex";
import { parsePgn } from "@/lib/chess/pgn";
import { getLesson } from "@/content/lessons";
import { OPENINGS } from "@/content/openings/library";
import { SKILLS } from "@/content/skills";
import { puzzleThemes } from "@/content/puzzles";
import type { GameAnalysis, MistakeTag, MoveEvaluation } from "@/lib/db/types";

/** Build a game in the shape Chess.com's API returns, from a list of SAN moves. */
function raw(o: { id: string; white: string; black: string; sans: string[]; wResult: string; bResult: string; end?: number; timeClass?: string; timeControl?: string; rules?: string; clock?: (ply: number) => string }): RawCcGame {
  const parts: string[] = [];
  o.sans.forEach((san, i) => {
    const n = Math.floor(i / 2) + 1;
    parts.push(`${n}${i % 2 === 0 ? "." : "..."} ${san} {[%clk ${o.clock ? o.clock(i) : "0:09:5" + (i % 10)}]}`);
  });
  const result = o.wResult === "win" ? "1-0" : o.bResult === "win" ? "0-1" : "1/2-1/2";
  return {
    url: `https://www.chess.com/game/live/${o.id}`,
    uuid: o.id,
    pgn: `[Event "Live Chess"]\n[Site "Chess.com"]\n[White "${o.white}"]\n[Black "${o.black}"]\n[Result "${result}"]\n[ECOUrl "https://www.chess.com/openings/x"]\n\n${parts.join(" ")} ${result}\n`,
    time_control: o.timeControl ?? "600",
    time_class: o.timeClass ?? "rapid",
    end_time: o.end ?? 1_700_000_000,
    rated: true,
    rules: o.rules ?? "chess",
    initial_setup: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    white: { username: o.white, rating: 1000, result: o.wResult },
    black: { username: o.black, rating: 1010, result: o.bResult },
  };
}

const SCHOLARS = ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"];
const ITALIAN = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d3", "d6"];

describe("Chess.com usernames", () => {
  it("accepts names and profile links, rejects anything else", () => {
    expect(normaliseUsername("  Some_Player-1 ")).toBe("some_player-1");
    expect(normaliseUsername("@Erik")).toBe("erik");
    expect(normaliseUsername("https://www.chess.com/member/Some_Player")).toBe("some_player");
    expect(normaliseUsername("a")).toBeNull();
    expect(normaliseUsername("has space")).toBeNull();
    expect(normaliseUsername("../../etc")).toBeNull();
    expect(normaliseUsername("name?x=1")).toBeNull();
  });
});

describe("fetching games", () => {
  const month = (y: number, m: number) => `https://api.chess.com/pub/player/me/games/${y}/${String(m).padStart(2, "0")}`;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const noSleep = async () => {};

  it("walks the monthly archives newest first, stops at the limit and leaves out variants", async () => {
    const calls: string[] = [];
    const g = (id: string, end: number, rules = "chess") => raw({ id, white: "Me", black: "Opp", sans: ITALIAN, wResult: "win", bResult: "resigned", end, rules });
    const data: Record<string, unknown> = {
      "https://api.chess.com/pub/player/me/games/archives": { archives: [month(2026, 8), month(2026, 9), month(2026, 10), "https://evil.example/pub/player/me/games/2026/11"] },
      [month(2026, 10)]: { games: [g("a", 300), g("b", 400), g("v", 350, "chess960")] },
      [month(2026, 9)]: { games: [g("c", 200), g("d", 250), g("e", 100)] },
      [month(2026, 8)]: { games: [g("f", 50)] },
    };
    const fake = (async (url: string) => {
      calls.push(url);
      return url in data ? json(data[url]) : json({}, 404);
    }) as unknown as typeof fetch;
    const { games, skipped } = await fetchRecentGames("Me", 4, { fetch: fake, sleep: noSleep });
    expect(games.map((x) => x.uuid)).toEqual(["b", "a", "d", "c"]);
    expect(skipped).toBe(1);
    // The oldest month was not needed, and the link to another host was never followed.
    expect(calls).toEqual(["https://api.chess.com/pub/player/me/games/archives", month(2026, 10), month(2026, 9)]);
  });

  it("explains an unknown player, a bad name, being offline and rate limits", async () => {
    const status = (s: number) => (async () => json({}, s)) as unknown as typeof fetch;
    await expect(fetchRecentGames("nobody", 5, { fetch: status(404), sleep: noSleep })).rejects.toMatchObject({ kind: "not-found" });
    await expect(fetchRecentGames("bad name", 5, { fetch: status(200), sleep: noSleep })).rejects.toMatchObject({ kind: "invalid-username" });
    await expect(fetchRecentGames("me", 5, { fetch: status(403), sleep: noSleep })).rejects.toMatchObject({ kind: "blocked" });
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(fetchRecentGames("me", 5, { fetch: offline, sleep: noSleep })).rejects.toMatchObject({ kind: "offline" });
    let n = 0;
    const limited = (async () => {
      n++;
      return json({}, 429);
    }) as unknown as typeof fetch;
    await expect(fetchRecentGames("me", 5, { fetch: limited, sleep: noSleep })).rejects.toBeInstanceOf(CcError);
    expect(n).toBe(3); // one try and two retries
    let m = 0;
    const recovers = (async () => (m++ === 0 ? json({}, 429) : json({ archives: [] }))) as unknown as typeof fetch;
    expect((await fetchRecentGames("me", 5, { fetch: recovers, sleep: noSleep })).games).toEqual([]);
  });

  it("only treats standard chess from the normal start as usable", () => {
    const g = raw({ id: "x", white: "a", black: "b", sans: ITALIAN, wResult: "win", bResult: "resigned" });
    expect(isStandardGame(g)).toBe(true);
    expect(isStandardGame({ ...g, rules: "chess960" })).toBe(false);
    expect(isStandardGame({ ...g, initial_setup: "bnrqkrnb/pppppppp/8/8/8/8/PPPPPPPP/BNRQKRNB w KQkq - 0 1" })).toBe(false);
    expect(isStandardGame({ ...g, pgn: undefined })).toBe(false);
  });
});

describe("reading Chess.com games", () => {
  it("reads moves and clock comments in Chess.com's PGN style", () => {
    const g = raw({ id: "1", white: "Me", black: "Opp", sans: SCHOLARS, wResult: "win", bResult: "checkmated", clock: (i) => `0:0${9 - Math.floor(i / 2)}:30.5` });
    const r = readMoves(g.pgn!)!;
    expect(r.ucis).toEqual(["e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7"]);
    expect(r.clocks[0]).toBeCloseTo(570.5);
    expect(r.clocks[6]).toBeCloseTo(390.5);
    expect(r.chess.isCheckmate()).toBe(true);
    expect(readMoves("1. e4 e5 2. Ke3 1-0")).toBeNull();
    expect(readMoves("1. e4 (1. d4) e5")).toBeNull();
  });

  it("works out colour, result, ending, material and opening", async () => {
    const index = await loadOpeningIndex();
    const won = toCcGame(raw({ id: "1", white: "Me", black: "Opp", sans: SCHOLARS, wResult: "win", bResult: "checkmated" }), "me", index)!;
    expect(won).toMatchObject({ id: "1", userColor: "w", outcome: "win", end: "checkmate", plies: 7, oppName: "Opp", finalMaterial: 1, baseSeconds: 600 });
    expect(won.clocks).toHaveLength(7);
    const lost = toCcGame(raw({ id: "2", white: "Opp", black: "ME", sans: SCHOLARS, wResult: "win", bResult: "checkmated" }), "me", index)!;
    expect(lost).toMatchObject({ userColor: "b", outcome: "loss", end: "checkmate", finalMaterial: -1, userRating: 1010 });
    const italian = toCcGame(raw({ id: "3", white: "Me", black: "Opp", sans: ITALIAN, wResult: "timeout", bResult: "win" }), "me", index)!;
    expect(italian).toMatchObject({ outcome: "loss", end: "timeout", endgamePlies: 0 });
    expect(openingFamily(italian.opening!.name)).toBe("Italian Game");
    const draw = toCcGame(raw({ id: "4", white: "Me", black: "Opp", sans: ITALIAN, wResult: "repetition", bResult: "repetition" }), "me", index)!;
    expect(draw).toMatchObject({ outcome: "draw", end: "repetition" });
    // Daily games record time spent, not time left: no clocks.
    expect(toCcGame(raw({ id: "5", white: "Me", black: "Opp", sans: ITALIAN, wResult: "win", bResult: "resigned", timeClass: "daily", timeControl: "1/86400" }), "me", index)!.clocks).toBeUndefined();
    // Not this player's game, or a variant result code.
    expect(toCcGame(raw({ id: "6", white: "A", black: "B", sans: ITALIAN, wResult: "win", bResult: "resigned" }), "me", index)).toBeNull();
    expect(toCcGame(raw({ id: "7", white: "Me", black: "B", sans: ITALIAN, wResult: "kingofthehill", bResult: "win" }), "me", index)).toBeNull();
  });

  it("detects the endgame phase from captures", async () => {
    // Trade down quickly: queens and a pair of minor pieces come off.
    const c = new Chess();
    const sans = ["e4", "d5", "exd5", "Qxd5", "Nc3", "Qe5+", "Qe2", "Qxe2+", "Bxe2", "Nc6", "Nb5", "Kd8", "Nxc7", "Kxc7"];
    for (const s of sans) c.move(s);
    const r = readMoves(sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${s}` : s)).join(" "))!;
    expect(r.ucis).toHaveLength(sans.length);
    expect(r.endgamePlies).toBe(0); // 62 - 18 - 3 = 41 points of pieces left: still a middlegame
  });

  it("converts batches, dropping duplicates and unreadable games", async () => {
    const a = raw({ id: "1", white: "Me", black: "Opp", sans: SCHOLARS, wResult: "win", bResult: "checkmated", end: 10 });
    const b = raw({ id: "2", white: "Me", black: "Opp", sans: ITALIAN, wResult: "win", bResult: "resigned", end: 20 });
    const { games, skipped } = await toCcGames([a, b, a, { ...b, uuid: "3", pgn: "1. e4 Ke7" }], "me", null);
    expect(games.map((g) => g.id)).toEqual(["2", "1"]);
    expect(skipped).toBe(2);
  });

  it("produces a game record that the rest of the app can read", async () => {
    const g = toCcGame(raw({ id: "abc", white: "Opp", black: "Me", sans: SCHOLARS, wResult: "win", bResult: "checkmated" }), "me", null)!;
    const rec = toGameRecord(g);
    expect(rec).toMatchObject({ id: "cc_abc", result: "1-0", whitePlayer: "Opp", blackPlayer: "Me", userColor: "b", source: "import" });
    expect(recordId(g)).toBe("cc_abc");
    const parsed = parsePgn(rec.pgn);
    expect(parsed.ok && parsed.game.moves).toEqual(rec.moves);
  });
});

// ---------------------------------------------------------------------------------------------

function game(o: Partial<CcGame> & { id: string }): CcGame {
  return { url: "", endedAt: 1_700_000_000_000, timeClass: "rapid", timeControl: "600", rated: true, userColor: "w", userName: "me", oppName: "Opp", outcome: "win", end: "resignation", moves: "e2e4 e7e5", plies: 60, finalMaterial: 0, endgamePlies: 0, ...o };
}
const many = (count: number, o: Partial<CcGame>, prefix: string) => Array.from({ length: count }, (_, i) => game({ ...o, id: `${prefix}${i}` }));

describe("results", () => {
  it("tallies and summarises", () => {
    const games = [...many(6, { outcome: "win", userColor: "w", opening: { eco: "C50", name: "Italian Game: Giuoco Pianissimo" } }, "w"), ...many(2, { outcome: "draw", end: "agreed", userColor: "b" }, "d"), ...many(2, { outcome: "loss", end: "timeout", userColor: "b", timeClass: "blitz" }, "l")];
    expect(tally(games)).toEqual({ games: 10, wins: 6, draws: 2, losses: 2, score: 70 });
    const s = summarise(games);
    expect(s.white.score).toBe(100);
    expect(s.black).toMatchObject({ games: 4, score: 25 });
    expect(s.lossEnds).toEqual({ timeout: 2 });
    expect(s.openings[0]).toMatchObject({ color: "w", family: "Italian Game", course: "italian" });
    expect(s.timeClasses.map((t) => t.key)).toEqual(["rapid", "blitz"]);
  });

  it("reports nothing when there is no clear pattern", () => {
    expect(resultFindings(many(20, {}, "w"))).toEqual([]);
    expect(resultFindings([])).toEqual([]);
    // Two losses on time is not enough to call it a pattern.
    expect(resultFindings([...many(10, {}, "w"), ...many(2, { outcome: "loss", end: "timeout" }, "l")])).toEqual([]);
  });

  it("finds clock losses, stalemated wins, level-material mates, quick losses and weak openings", () => {
    const games = [
      ...many(20, { outcome: "win", userColor: "w" }, "w"),
      ...many(4, { outcome: "loss", end: "timeout", finalMaterial: 5, userColor: "b" }, "t"),
      ...many(3, { outcome: "loss", end: "checkmate", finalMaterial: 1, plies: 30, userColor: "b" }, "m"),
      game({ id: "s", outcome: "draw", end: "stalemate", finalMaterial: 9 }),
      game({ id: "s2", outcome: "draw", end: "stalemate", finalMaterial: -9 }), // being stalemated when losing is a good result
      ...many(6, { outcome: "loss", end: "resignation", userColor: "b", opening: { eco: "B01", name: "Scandinavian Defense: Mieses-Kotroc Variation" } }, "o"),
      ...many(4, { outcome: "win", userColor: "b" }, "bw"),
    ];
    const ids = resultFindings(games).map((f) => f.id);
    expect(ids).toContain("results-timeouts");
    expect(ids).toContain("results-stalemate");
    expect(ids).toContain("results-mated-level");
    expect(ids).toContain("results-quick-losses");
    expect(ids).toContain("results-colour");
    expect(ids).toContain("results-opening-b-Scandinavian Defense");
    const f = resultFindings(games);
    expect(f.find((x) => x.id === "results-stalemate")!.title).toBe("You stalemated a winning position");
    expect(f.find((x) => x.id === "results-timeouts")!.evidence).toBe("4 of your 13 losses (31%) were on time, 4 of them while you were at least a piece ahead.");
    expect(f.find((x) => x.id.startsWith("results-opening"))!.actions[0].href).toBe("/openings/scandinavian/");
  });

  it("maps opening families to courses that exist", () => {
    const ids = new Set(OPENINGS.map((o) => o.id));
    for (const name of ["Italian Game", "Ruy Lopez", "Scotch Game", "Queen's Gambit Declined", "Slav Defense", "London System", "King's Indian Defense", "Sicilian Defense", "French Defense", "Caro-Kann Defense", "Scandinavian Defense", "English Opening"]) {
      expect(ids.has(courseFor(name)!), name).toBe(true);
    }
    expect(courseFor("Bird Opening")).toBeUndefined();
  });
});

function evalMove(o: Partial<MoveEvaluation> & { ply: number; color: "w" | "b" }): MoveEvaluation {
  // A middlegame position (all pieces on) by default.
  return { san: "Qd2", uci: "d1d2", fenBefore: `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR ${o.color} KQkq - 0 ${Math.ceil(o.ply / 2)}`, before: { cp: 0 }, after: { cp: 0 }, bestMove: "g1f3", bestSan: "Nf3", bestLine: ["Nf3"], replyLine: [], depth: 18, cpLoss: 0, winDrop: 0, classification: "good", tags: [], ...o };
}
function analysedGame(id: string, errors: { ply: number; tags: MistakeTag[]; cls?: "mistake" | "blunder" }[], o: Partial<CcGame> = {}, extra: MoveEvaluation[] = []): AnalysedGame {
  const g = game({ id, ...o });
  const evals: MoveEvaluation[] = [];
  for (let ply = 1; ply <= 60; ply++) {
    const color = ply % 2 === 1 ? "w" : "b";
    const err = color === g.userColor ? errors.find((e) => e.ply === ply) : undefined;
    const custom = extra.find((e) => e.ply === ply);
    evals.push(custom ?? evalMove({ ply, color, ...(err ? { classification: err.cls ?? "blunder", tags: err.tags, winDrop: 30, san: "Qxb7" } : {}) }));
  }
  const analysis: GameAnalysis = { gameId: recordId(g), engineVersion: "test", analysisSettings: { depth: 10, thresholds: { inaccuracy: 5, mistake: 10, blunder: 15 } }, moveEvaluations: evals, identifiedMistakes: [], recommendations: [], summary: "", accuracy: { w: 80, b: 70 }, complete: true, createdAt: 1 };
  return { game: g, analysis };
}

describe("engine findings", () => {
  it("counts only the learner's own serious errors", () => {
    const a = analysedGame("1", [{ ply: 25, tags: ["hung-material"] }, { ply: 31, tags: ["hung-material"], cls: "mistake" }, { ply: 26, tags: ["allowed-mate"] }]);
    const { stats, examples } = engineStats([a]);
    expect(stats).toMatchObject({ games: 1, userMoves: 30, blunders: 1, mistakes: 1, accuracy: 80 });
    expect(stats.tags["hung-material"]).toEqual({ moves: 2, games: 1 });
    expect(stats.tags["allowed-mate"]).toBeUndefined(); // ply 26 was the opponent's move
    expect(examples.get("hung-material")).toHaveLength(1); // one example per game
    expect(examples.get("hung-material")![0]).toMatchObject({ gameId: "1", played: "Qxb7", better: "Nf3", orientation: "w" });
  });

  it("needs a pattern in two games (or three times in one) before reporting it", () => {
    const once = analysedGame("1", [{ ply: 25, tags: ["hung-material"] }]);
    expect(engineFindings([once])).toEqual([]);
    const twice = [once, analysedGame("2", [{ ply: 27, tags: ["hung-material"] }])];
    const f = engineFindings(twice);
    expect(f.map((x) => x.id)).toEqual(["engine-hung-material"]);
    expect(f[0].evidence).toBe("In 2 of the 2 games analysed you left material to be won (2 times in total).");
    expect(f[0].examples).toHaveLength(2);
    const thrice = analysedGame("3", [21, 23, 25].map((ply) => ({ ply, tags: ["missed-mate"] as MistakeTag[] })));
    expect(engineFindings([thrice]).map((x) => x.id)).toEqual(["engine-missed-mate"]);
  });

  it("spots thrown wins and time-pressure errors", () => {
    const winning = (id: string, outcome: CcGame["outcome"]) => analysedGame(id, [], { outcome, end: outcome === "win" ? "resignation" : "timeout" }, [evalMove({ ply: 41, color: "w", before: { cp: 650 } })]);
    const f = engineFindings([winning("1", "loss"), winning("2", "draw"), winning("3", "win")]);
    expect(f.map((x) => x.id)).toEqual(["engine-thrown-wins"]);
    expect(f[0].evidence).toContain("in 3 games of the 3 games analysed, and did not win 2 of them");

    expect(lowTimeLimit(600)).toBe(60);
    expect(lowTimeLimit(180)).toBe(18);
    expect(lowTimeLimit(60)).toBe(10);
    // 10-minute games: plenty of time until ply 50, then under a minute.
    const clocks = Array.from({ length: 60 }, (_, i) => (i < 50 ? 400 : 20));
    const rushed = (id: string) => analysedGame(id, [{ ply: 53, tags: [] }, { ply: 57, tags: [] }], { clocks, baseSeconds: 600 });
    const t = engineFindings([rushed("1"), rushed("2")]);
    expect(t.map((x) => x.id)).toEqual(["engine-time-pressure"]);
    expect(t[0].evidence).toContain("4 of your 4 serious errors");
  });

  it("flags a phase only when it is clearly worse than the rest", () => {
    const openingErrors = [3, 7, 11, 15].map((ply) => ({ ply, tags: ["opening"] as MistakeTag[] }));
    const games = ["1", "2", "3", "4", "5"].map((id) => analysedGame(id, id === "1" ? openingErrors : []));
    // 5 games x 10 opening moves = 50 opening moves, 4 errors; none elsewhere.
    expect(engineFindings(games).map((x) => x.id)).toEqual(["engine-phase-opening"]);
  });

  it("every suggested lesson, puzzle theme and course exists", () => {
    const themes = new Set(puzzleThemes().map((t) => t.theme));
    // The skill catalogue must not point at puzzle themes that have no puzzles either.
    for (const s of SKILLS) if (s.puzzleTheme) expect(themes.has(s.puzzleTheme), `skill ${s.id}`).toBe(true);
    const courses = new Set(OPENINGS.map((o) => o.id));
    const all = [
      ...buildFindings(
        [
          ...many(20, { outcome: "win", userColor: "w", endgamePlies: 0 }, "w"),
          ...many(4, { outcome: "loss", end: "timeout", finalMaterial: 5, userColor: "b", endgamePlies: 20 }, "t"),
          ...many(3, { outcome: "loss", end: "checkmate", finalMaterial: 1, plies: 30, userColor: "b", endgamePlies: 20 }, "m"),
          ...many(8, { outcome: "loss", userColor: "b", endgamePlies: 20, opening: { eco: "A02", name: "Bird Opening" } }, "e"),
          ...many(6, { outcome: "loss", userColor: "w", opening: { eco: "C50", name: "Italian Game" } }, "i"),
          game({ id: "s", outcome: "draw", end: "stalemate", finalMaterial: 9 }),
        ],
        [
          ...["1", "2", "3", "4", "5"].map((id) => analysedGame(id, [{ ply: 3, tags: ["opening", "hung-material", "allowed-mate", "missed-mate", "missed-win", "missed-tactic"] }, { ply: 7, tags: ["opening"] }], { outcome: "loss" }, [evalMove({ ply: 41, color: "w", before: { cp: 900 } })])),
        ],
      ),
    ];
    expect(all.length).toBeGreaterThanOrEqual(10);
    for (const f of all)
      for (const a of f.actions) {
        const lesson = /^\/learn\/([^/]+)\/$/.exec(a.href)?.[1];
        const theme = /^\/puzzles\/\?theme=(.+)$/.exec(a.href)?.[1];
        const course = /^\/openings\/([^/]+)\/$/.exec(a.href)?.[1];
        if (lesson) expect(getLesson(lesson), `${f.id}: ${a.href}`).toBeTruthy();
        else if (theme) expect(themes.has(theme), `${f.id}: ${a.href}`).toBe(true);
        else if (course) expect(courses.has(course), `${f.id}: ${a.href}`).toBe(true);
        else expect(["/puzzles/", "/openings/"], `${f.id}: ${a.href}`).toContain(a.href);
      }
    // Sorted by importance.
    expect([...all].sort((a, b) => b.severity - a.severity).map((f) => f.id)).toEqual(all.map((f) => f.id));
  });
});
