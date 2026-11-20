import { afterAll, describe, expect, it } from "vitest";
import { EngineClient } from "@/lib/engine/client";
import { nodeStockfishWorker } from "./node-worker";
import { runAnalysis } from "@/lib/analysis/runner";
import { classifyMove, materialSwing, moveAccuracy, winPct, MATE_CP } from "@/lib/analysis/classify";
import { explainMoment } from "@/lib/analysis/report";
import type { ChessGameRecord, GameAnalysis, MoveEvaluation } from "@/lib/db/types";
import { START_FEN } from "@/lib/chess/core";
import { parsePgn } from "@/lib/chess/pgn";

describe("move types", () => {
  const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
  const base = { ply: 5, san: "Bb5", uci: "f1b5", color: "w" as const, fenBefore: fen, fenAfter: fen, isBook: false };
  const pe = (cp: number, bestMove: string | null = "f1b5", second?: { score: { cp: number }; move: string } | null) => ({ fen, score: { cp }, bestMove, pv: bestMove ? [bestMove] : [], depth: 12, second });
  it("rates good moves on a scale and spots the only good move", () => {
    // Played the engine's move, and the second choice would have been far worse: Great.
    expect(classifyMove({ ...base, before: pe(40, "f1b5", { score: { cp: -250 }, move: "f1c4" }), after: pe(40) }).classification).toBe("great");
    // Second choice almost as good: just Best.
    const best = classifyMove({ ...base, before: pe(40, "f1b5", { score: { cp: 30 }, move: "f1c4" }), after: pe(40) });
    expect(best.classification).toBe("best");
    expect(best.secondSan).toBe("Bc4");
    // Not the engine's move: Excellent, then Good, by how much was lost.
    expect(classifyMove({ ...base, before: pe(40, "f1c4"), after: pe(20) }).classification).toBe("excellent");
    expect(classifyMove({ ...base, before: pe(40, "f1c4"), after: pe(-5) }).classification).toBe("good");
    // Already winning by a mile: no Great for keeping the win.
    expect(classifyMove({ ...base, before: pe(2000, "f1b5", { score: { cp: 300 }, move: "f1c4" }), after: pe(2000) }).classification).toBe("best");
    // A recapture is never Great.
    expect(classifyMove({ ...base, prev: { to: "b5", captured: true }, before: pe(40, "f1b5", { score: { cp: -250 }, move: "f1c4" }), after: pe(40) }).classification).toBe("best");
  });
});

describe("classification", () => {
  it("uses win-probability drops with mate awareness", () => {
    expect(winPct({ cp: 0 }, "w")).toBeCloseTo(50);
    expect(winPct({ mate: 3 }, "b")).toBe(0);
    expect(winPct({ cp: MATE_CP }, "w")).toBe(100);
    const base = { ply: 5, san: "Nf6", uci: "g8f6", color: "b" as const, fenBefore: START_FEN, fenAfter: START_FEN, isBook: false };
    const before = { fen: START_FEN, score: { cp: -30 }, bestMove: "g7g6", pv: ["g7g6"], depth: 12 };
    const blunder = classifyMove({ ...base, before, after: { fen: START_FEN, score: { mate: 1 }, bestMove: "h5f7", pv: ["h5f7"], depth: 12 } });
    expect(blunder.classification).toBe("blunder");
    expect(blunder.tags).toContain("allowed-mate");
    const fine = classifyMove({ ...base, before, after: { fen: START_FEN, score: { cp: 20 }, bestMove: null, pv: [], depth: 12 } });
    expect(fine.classification).toBe("good");
    const best = classifyMove({ ...base, uci: "g7g6", before, after: { fen: START_FEN, score: { cp: 50 }, bestMove: null, pv: [], depth: 12 } });
    expect(best.classification).toBe("best");
  });
  it("measures material after complete exchanges", () => {
    // White plays Qxd5, Black recaptures: net zero for White after 2 plies.
    const fen = "rnb1kbnr/ppp1pppp/8/3q4/8/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 3";
    expect(materialSwing(fen, ["d5a5"], "b", 4)).toBe(0);
  });
  it("accuracy is 100 for no loss and falls with loss", () => {
    expect(moveAccuracy(0)).toBeCloseTo(100, 0);
    expect(moveAccuracy(20)).toBeLessThan(moveAccuracy(5));
  });
});

describe("full game analysis with Stockfish", () => {
  const engine = new EngineClient(nodeStockfishWorker);
  afterAll(() => engine.terminate());
  const parsed = parsePgn("1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0");
  if (!parsed.ok) throw new Error("bad pgn");
  const game: ChessGameRecord = {
    id: "scholar",
    whitePlayer: "W",
    blackPlayer: "B",
    result: "1-0",
    status: "finished",
    pgn: "",
    startingFen: START_FEN,
    moves: parsed.game.moves,
    createdAt: 0,
    updatedAt: 0,
    source: "import",
    analysisStatus: "none",
    userColor: "b",
  };
  it("finds the blunder, names the opening, and resumes after cancellation", async () => {
    let saved: GameAnalysis | null = null;
    let cancel = false;
    let steps = 0;
    const partial = await runAnalysis({
      game,
      engine,
      depth: 10,
      save: async (a) => {
        saved = a;
      },
      isCancelled: () => cancel,
      onProgress: () => {
        steps++;
        if (steps === 3) cancel = true;
      },
    });
    expect(partial.complete).toBe(false);
    expect(saved).not.toBeNull();
    cancel = false;
    const full = await runAnalysis({ game, engine, depth: 10, existing: saved, save: async () => {}, isCancelled: () => false });
    expect(full.complete).toBe(true);
    expect(full.moveEvaluations.length).toBe(7);
    const nf6 = full.moveEvaluations.find((m) => m.san === "Nf6")!;
    expect(nf6.classification).toBe("blunder");
    expect(nf6.tags).toContain("allowed-mate");
    expect(explainMoment(nf6)).toMatch(/forced mate/);
    expect(full.moveEvaluations.at(-1)!.san).toBe("Qxf7#");
    expect(full.opening?.name).toBeTruthy();
    expect(full.summary).toMatch(/White won/);
    expect(full.recommendations.length).toBeGreaterThan(0);
    expect(full.accuracy!.b).toBeLessThan(full.accuracy!.w);
  }, 60000);
});

describe("verification pass", () => {
  const engine = new EngineClient(nodeStockfishWorker);
  afterAll(() => engine.terminate());
  it("does not call Morphy's winning combination a blunder, and catches the real blunder", async () => {
    const parsed = parsePgn("1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0");
    if (!parsed.ok) throw new Error("pgn");
    const game: ChessGameRecord = { id: "opera", whitePlayer: "Morphy", blackPlayer: "Allies", result: "1-0", status: "finished", pgn: "", startingFen: START_FEN, moves: parsed.game.moves, createdAt: 0, updatedAt: 0, source: "import", analysisStatus: "none" };
    const a = await runAnalysis({ game, engine, depth: 10, save: async () => {}, isCancelled: () => false });
    const bxd7 = a.moveEvaluations.find((m) => m.ply === 29)!;
    expect(bxd7.san).toBe("Bxd7+");
    expect(["brilliant", "great", "best", "excellent", "good"]).toContain(bxd7.classification);
    // 16.Qb8+ gives up the queen to force mate: the only winning move, so Brilliant.
    const qb8 = a.moveEvaluations.find((m) => m.ply === 31)!;
    expect(qb8.san).toBe("Qb8+");
    expect(qb8.classification).toBe("brilliant");
    expect(qb8.sacrificed).toBe(9);
    // The mate itself is just the best move, and the forced recapture is not "great".
    expect(a.moveEvaluations.find((m) => m.ply === 33)!.classification).toBe("best");
    expect(a.moveEvaluations.find((m) => m.ply === 32)!.classification).toBe("best");
    const nxd7 = a.moveEvaluations.find((m) => m.ply === 30)!;
    expect(nxd7.classification).toBe("blunder");
    expect(nxd7.tags).toContain("allowed-mate");
    expect(a.opening?.name).toMatch(/Philidor/);
  }, 120000);
});

describe("move review text", () => {
  it("explains each move type and names the better move", async () => {
    const { reviewMove, evalInWords, classCounts } = await import("@/lib/analysis/report");
    const e = (o: Partial<MoveEvaluation>): MoveEvaluation => ({ ply: 24, san: "Nxd4", uci: "c6d4", color: "b", fenBefore: "r1bqkb1r/pppp1ppp/2n2n2/4p3/3PP3/2N2N2/PPP2PPP/R1BQKB1R b KQkq - 0 12", before: { cp: 20 }, after: { cp: 350 }, bestMove: "e5d4", bestSan: "exd4", bestLine: ["exd4", "Nxd4"], replyLine: ["Nxd4", "exd4"], depth: 18, cpLoss: 330, winDrop: 31, classification: "blunder", tags: ["hung-material"], ...o });
    const blunder = reviewMove(e({}));
    expect(blunder.headline).toBe("12...Nxd4 is a blunder");
    expect(blunder.better).toEqual({ san: "exd4", line: ["exd4", "Nxd4"] });
    expect(blunder.details.join(" ")).toContain("It loses material: the reply Nxd4 exd4 wins it.");
    expect(blunder.details.join(" ")).toContain("Black's winning chances dropped by 31 percentage points.");
    expect(blunder.details.at(-1)).toBe("White is winning (+3.5).");
    const great = reviewMove(e({ classification: "great", san: "exd4", bestSan: "exd4", secondSan: "Nxd4", secondDrop: 31.2, winDrop: 0, after: { cp: 20 }, tags: [] }));
    expect(great.headline).toBe("12...exd4 is a great move");
    expect(great.better).toBeUndefined();
    expect(great.details[0]).toContain("Stockfish's next choice, Nxd4, would have cost 31 points");
    expect(reviewMove(e({ classification: "inaccuracy", winDrop: 6, tags: [] })).headline).toBe("12...Nxd4 is an inaccuracy");
    expect(evalInWords({ mate: -3 })).toBe("Black has a forced mate in 3");
    expect(evalInWords({ cp: 30 })).toBe("The position is about equal (+0.3)");
    expect(classCounts([e({}), e({ classification: "best" }), e({ color: "w", classification: "best" })], "b")).toMatchObject({ blunder: 1, best: 1, great: 0 });
  });
});
