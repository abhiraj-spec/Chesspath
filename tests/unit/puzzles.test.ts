import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { PUZZLES, puzzleThemes } from "@/content/puzzles";
import { checkPuzzleMove, validatePuzzle } from "@/lib/puzzles/solve";

describe("puzzle collection", () => {
  it("has a substantial, de-duplicated collection across all levels", () => {
    expect(PUZZLES.length).toBeGreaterThanOrEqual(100);
    expect(new Set(PUZZLES.map((p) => p.id)).size).toBe(PUZZLES.length);
    expect(new Set(PUZZLES.map((p) => p.startFen)).size).toBe(PUZZLES.length);
    for (const lv of [1, 2, 3, 4, 5]) expect(PUZZLES.some((p) => p.difficulty === lv)).toBe(true);
    expect(puzzleThemes().length).toBeGreaterThan(10);
  });
  it("every puzzle replays legally and has metadata", () => {
    for (const p of PUZZLES) {
      expect(validatePuzzle(p)).toEqual([]);
      expect(p.explanation.length).toBeGreaterThan(40);
      expect(p.hints.length).toBeGreaterThanOrEqual(2);
      expect(p.attribution).toMatch(/Lichess puzzle .* \(CC0\)/);
    }
  });
});

describe("puzzle move checking", () => {
  const p = PUZZLES.find((x) => x.solution.length >= 3)!;
  it("accepts the solution and returns the opponent reply", () => {
    const u = p.solution[0];
    const r = checkPuzzleMove(p, 0, p.startFen, { from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })!;
    expect(r.correct).toBe(true);
    expect(r.finished).toBe(false);
    expect(r.reply).toBe(p.solution[1]);
  });
  it("rejects a legal but wrong move", () => {
    const legal = new Chess(p.startFen).moves({ verbose: true }).find((m) => m.from + m.to !== p.solution[0].slice(0, 4) && !m.san.includes("#"))!;
    const r = checkPuzzleMove(p, 0, p.startFen, legal)!;
    expect(r.correct).toBe(false);
  });
  it("accepts any checkmating move in mate puzzles", () => {
    const mate = PUZZLES.find((x) => x.solution.length === 1 && x.lichessThemes.includes("mateIn1"))!;
    const c = new Chess(mate.startFen);
    const mates = c.moves({ verbose: true }).filter((m) => m.san.includes("#"));
    expect(mates.length).toBeGreaterThan(0);
    for (const m of mates) expect(checkPuzzleMove(mate, 0, mate.startFen, m)!.finished).toBe(true);
  });
  it("completes when the whole line is played", () => {
    let fen = p.startFen;
    for (let i = 0; i < p.solution.length; i += 2) {
      const u = p.solution[i];
      const r = checkPuzzleMove(p, i, fen, { from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })!;
      expect(r.correct).toBe(true);
      if (r.finished) {
        expect(i).toBe(p.solution.length - 1);
        return;
      }
      const c = new Chess(r.fenAfter);
      c.move({ from: r.reply!.slice(0, 2), to: r.reply!.slice(2, 4), promotion: r.reply![4] });
      fen = c.fen();
    }
  });
});
