import { Chess } from "chess.js";
import type { EngineScore, MistakeTag, MoveClass, MoveEvaluation } from "@/lib/db/types";
import { winProbability } from "@/lib/engine/uci";
import { materialBalance, phaseOf } from "@/lib/chess/status";

/**
 * Move classification thresholds, in percentage points of the mover's win probability lost
 * (win probability from the logistic model used by Lichess: 1 / (1 + e^(-0.00368208·cp))).
 * These mirror Lichess' published thresholds (0.1 / 0.2 / 0.3 on its −1…+1 scale).
 * They can be overridden per analysis.
 */
export interface Thresholds {
  inaccuracy: number;
  mistake: number;
  blunder: number;
}
export const DEFAULT_THRESHOLDS: Thresholds = { inaccuracy: 5, mistake: 10, blunder: 15 };

/** Terminal results are stored as large centipawn values from White's POV. */
export const MATE_CP = 10000;

export interface PositionEval {
  fen: string;
  /** White POV. */
  score: EngineScore;
  bestMove: string | null;
  pv: string[];
  depth: number;
  /**
   * Stockfish's second-best move and its score (White POV). undefined: only one line was
   * searched (older analyses); null: there is no second legal move.
   */
  second?: { score: EngineScore; move: string } | null;
}

/** Evaluation of a finished position without asking the engine. */
export function terminalEval(fen: string): PositionEval | null {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { fen, score: { cp: c.turn() === "w" ? -MATE_CP : MATE_CP }, bestMove: null, pv: [], depth: 0 };
  if (c.isStalemate() || c.isInsufficientMaterial() || c.isDrawByFiftyMoves()) return { fen, score: { cp: 0 }, bestMove: null, pv: [], depth: 0 };
  return null;
}

export function winPct(score: EngineScore, color: "w" | "b"): number {
  let p: number;
  if (score.mate !== undefined) p = score.mate > 0 ? 1 : score.mate < 0 ? 0 : 0.5;
  else if (score.cp !== undefined && Math.abs(score.cp) >= MATE_CP) p = score.cp > 0 ? 1 : 0;
  else p = winProbability(score);
  return (color === "w" ? p : 1 - p) * 100;
}

/** Centipawns from the mover's POV, clamping mates to ±1000 for loss arithmetic. */
export function cpFor(score: EngineScore, color: "w" | "b"): number {
  let v: number;
  if (score.mate !== undefined) v = score.mate > 0 ? 1000 : -1000;
  else v = Math.max(-1000, Math.min(1000, score.cp ?? 0));
  return color === "w" ? v : -v;
}

function mateFor(score: EngineScore, color: "w" | "b"): number | null {
  if (score.mate === undefined) {
    if (score.cp !== undefined && Math.abs(score.cp) >= MATE_CP) return (score.cp > 0) === (color === "w") ? 0 : -0.5;
    return null;
  }
  return color === "w" ? score.mate : -score.mate;
}

/**
 * Material change (for `color`) along a UCI line, measured after complete exchanges:
 * after the last even number of plies within `plies` (or after 1 ply for a one-move line).
 */
export function materialSwing(fen: string, line: string[], color: "w" | "b", plies: number): number {
  const c = new Chess(fen);
  const sign = color === "w" ? 1 : -1;
  const values = [materialBalance(c.fen()) * sign];
  for (let i = 0; i < Math.min(plies, line.length); i++) {
    try {
      c.move({ from: line[i].slice(0, 2), to: line[i].slice(2, 4), promotion: line[i][4] });
    } catch {
      break;
    }
    values.push(materialBalance(c.fen()) * sign);
  }
  const n = values.length - 1;
  const k = n >= 2 ? n - (n % 2) : n;
  return values[k] - values[0];
}

export function uciLineToSan(fen: string, line: string[], max = 8): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const u of line.slice(0, max)) {
    try {
      out.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san);
    } catch {
      break;
    }
  }
  return out;
}

export interface ClassifyInput {
  ply: number;
  san: string;
  uci: string;
  color: "w" | "b";
  fenBefore: string;
  fenAfter: string;
  before: PositionEval;
  after: PositionEval;
  isBook: boolean;
  thresholds?: Thresholds;
  /** The move played just before this one (to recognise simple recaptures). */
  prev?: { to: string; captured: boolean };
}

/**
 * Rules for the positive labels (all computed from the engine's numbers; nothing is guessed):
 *  - Great: the move played is the engine's best, and its second choice would have cost at
 *    least GREAT_GAP percentage points of winning chances: the only good move. Not given for
 *    recaptures, for positions with fewer than 3 legal moves, or when the mover was already
 *    completely winning (any reasonable move wins).
 *  - Brilliant: a Best or Great move that gives up at least 2 pawns' worth of material, after
 *    complete exchanges along the engine's line, while keeping the position at least balanced.
 *    In an already won position it must also be the only move that keeps the win.
 *  - Best: the engine's choice, or a move that loses less than 1 point of winning chances.
 *  - Excellent: loses less than 2.5 points. Good: less than the inaccuracy threshold.
 */
export const GREAT_GAP = 10;

export function classifyMove(input: ClassifyInput): MoveEvaluation {
  const { color, before, after, thresholds = DEFAULT_THRESHOLDS } = input;
  const wBefore = winPct(before.score, color);
  const wAfter = winPct(after.score, color);
  const winDrop = Math.max(0, wBefore - wAfter);
  const cpLoss = Math.max(0, cpFor(before.score, color) - cpFor(after.score, color));
  const playedBest = before.bestMove === input.uci;
  const mateBefore = mateFor(before.score, color);
  const mateAfter = mateFor(after.score, color);

  let classification: MoveClass;
  if (input.isBook) classification = "book";
  else if (playedBest || winDrop < 1) classification = "best";
  else if (winDrop >= thresholds.blunder) classification = "blunder";
  else if (winDrop >= thresholds.mistake) classification = "mistake";
  else if (winDrop >= thresholds.inaccuracy) classification = "inaccuracy";
  else if (winDrop < 2.5) classification = "excellent";
  else classification = "good";

  // Second choice: how much worse it was than the best move.
  let secondSan: string | undefined;
  let secondDrop: number | undefined;
  if (before.second) {
    secondSan = uciLineToSan(input.fenBefore, [before.second.move], 1)[0];
    secondDrop = Math.round(Math.max(0, winPct(before.score, color) - winPct(before.second.score, color)) * 10) / 10;
  }
  // Material given up by the move, after complete exchanges along the engine's reply line.
  let sacrificed: number | undefined;
  if (classification === "best" && !input.isBook) {
    const swing = materialSwing(input.fenBefore, [input.uci, ...after.pv], color, 4);
    if (swing <= -2) sacrificed = -swing;
  }
  if (classification === "best") {
    const legal = new Chess(input.fenBefore).moves().length;
    const recapture = Boolean(input.prev?.captured && input.prev.to === input.uci.slice(2, 4));
    const alreadyWon = wBefore >= 97;
    if (playedBest && secondDrop !== undefined && secondDrop >= GREAT_GAP && legal >= 3 && !recapture && !alreadyWon) classification = "great";
    const onlyMove = secondDrop !== undefined && secondDrop >= GREAT_GAP;
    if (sacrificed !== undefined && wAfter >= 50 && (!alreadyWon || onlyMove) && !recapture) classification = "brilliant";
  }
  // Mate awareness: walking into a forced mate is always a blunder (even if the position was
  // already lost on points), and failing to play a forced mate is at least an inaccuracy.
  if (!input.isBook) {
    const allowsMate = mateAfter !== null && mateAfter < 0 && !(mateBefore !== null && mateBefore < 0);
    const missesMate = mateBefore !== null && mateBefore > 0 && !(mateAfter !== null && mateAfter >= 0);
    if (allowsMate) classification = "blunder";
    else if (missesMate && (classification === "best" || classification === "great" || classification === "brilliant" || classification === "excellent" || classification === "good")) classification = "inaccuracy";
  }

  const tags: MistakeTag[] = [];
  const opp = color === "w" ? "b" : "w";
  if (classification === "inaccuracy" || classification === "mistake" || classification === "blunder") {
    if (mateBefore !== null && mateBefore > 0 && !(mateAfter !== null && mateAfter >= 0)) tags.push("missed-mate");
    if (mateAfter !== null && mateAfter < 0 && !(mateBefore !== null && mateBefore < 0)) tags.push("allowed-mate");
    // Opponent's best reply wins material against the mover?
    const replySwing = materialSwing(input.fenAfter, after.pv, opp, 4);
    if (replySwing >= 2) tags.push("hung-material");
    // The best move would have won material that the played move did not?
    const bestSwing = before.bestMove ? materialSwing(input.fenBefore, before.pv, color, 5) : 0;
    if (bestSwing >= 2 && !tags.includes("missed-mate")) tags.push("missed-win");
    if (!tags.length && classification !== "inaccuracy" && before.bestMove) {
      const bestSan = uciLineToSan(input.fenBefore, [before.bestMove], 1)[0] ?? "";
      if (/[x+#]/.test(bestSan)) tags.push("missed-tactic");
    }
    const phase = phaseOf(input.fenBefore, input.ply);
    if (phase === "opening") tags.push("opening");
    if (phase === "endgame") tags.push("endgame");
  }

  return {
    ply: input.ply,
    san: input.san,
    uci: input.uci,
    color,
    fenBefore: input.fenBefore,
    before: before.score,
    after: after.score,
    bestMove: before.bestMove ?? "",
    bestSan: before.bestMove ? (uciLineToSan(input.fenBefore, [before.bestMove], 1)[0] ?? "") : "",
    bestLine: uciLineToSan(input.fenBefore, before.pv, 8),
    replyLine: uciLineToSan(input.fenAfter, after.pv, 6),
    depth: Math.min(before.depth || 99, after.depth || 99) === 99 ? 0 : Math.min(before.depth || 99, after.depth || 99),
    cpLoss: Math.round(cpLoss),
    winDrop: Math.round(winDrop * 10) / 10,
    classification,
    tags,
    ...(secondSan !== undefined ? { secondSan, secondDrop } : {}),
    ...(sacrificed !== undefined && (classification === "brilliant") ? { sacrificed } : {}),
  };
}

/** Lichess-style per-move accuracy from win-probability loss (0–100). Informal, not a rating. */
export function moveAccuracy(winDropPct: number): number {
  const a = 103.1668 * Math.exp(-0.04354 * winDropPct) - 3.1669;
  return Math.max(0, Math.min(100, a));
}

export function sideAccuracy(evals: MoveEvaluation[], color: "w" | "b"): number | undefined {
  const list = evals.filter((e) => e.color === color);
  if (!list.length) return undefined;
  return Math.round((list.reduce((s, e) => s + moveAccuracy(e.winDrop), 0) / list.length) * 10) / 10;
}
