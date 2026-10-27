import { Chess } from "chess.js";
import type { Puzzle } from "@/content/puzzles";
import { moveToUci } from "@/lib/chess/core";

export interface PuzzleMoveResult {
  correct: boolean;
  /** The puzzle is solved after this move. */
  finished: boolean;
  /** Opponent reply to play next (UCI), if the line continues. */
  reply?: string;
  san: string;
  fenAfter: string;
}

/**
 * Validate a solver move against the puzzle's verified solution.
 * `ply` is the index into puzzle.solution of the expected solver move (0, 2, 4, …).
 * Accepted: the stored move; on the final move, any listed alternative; at any point,
 * a move that delivers checkmate (it ends the puzzle successfully).
 */
export function checkPuzzleMove(puzzle: Puzzle, ply: number, fen: string, move: { from: string; to: string; promotion?: string }): PuzzleMoveResult | null {
  const c = new Chess(fen);
  let m;
  try {
    m = c.move(move);
  } catch {
    return null;
  }
  const uci = moveToUci(m);
  const expected = puzzle.solution[ply];
  const isFinal = ply >= puzzle.solution.length - 1 || ply + 1 >= puzzle.solution.length;
  if (c.isCheckmate()) return { correct: true, finished: true, san: m.san, fenAfter: c.fen() };
  if (uci === expected || (isFinal && puzzle.alternatives.includes(uci))) {
    const reply = puzzle.solution[ply + 1];
    if (!reply || isFinal) return { correct: true, finished: true, san: m.san, fenAfter: c.fen() };
    return { correct: true, finished: false, reply, san: m.san, fenAfter: c.fen() };
  }
  return { correct: false, finished: false, san: m.san, fenAfter: c.fen() };
}

/** All puzzle positions must replay legally from fen + setupMove + solution. */
export function validatePuzzle(p: Puzzle): string[] {
  const errors: string[] = [];
  const c = new Chess(p.fen);
  try {
    c.move({ from: p.setupMove.slice(0, 2), to: p.setupMove.slice(2, 4), promotion: p.setupMove[4] });
  } catch {
    errors.push(`${p.id}: illegal setup move`);
    return errors;
  }
  if (c.fen() !== p.startFen) errors.push(`${p.id}: startFen mismatch`);
  if (c.turn() !== p.sideToMove) errors.push(`${p.id}: sideToMove mismatch`);
  for (const u of p.solution) {
    try {
      c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    } catch {
      errors.push(`${p.id}: illegal solution move ${u}`);
      break;
    }
  }
  if (p.solution.length % 2 === 0) errors.push(`${p.id}: solution must end with a solver move`);
  return errors;
}
