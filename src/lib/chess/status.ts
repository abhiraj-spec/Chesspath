import { Chess, type Color, colorName, PIECE_VALUES, type PieceSymbol, positionKey } from "./core";
import type { Line } from "./line";

export type GameResult = "1-0" | "0-1" | "1/2-1/2" | "*";

export type TerminalReason =
  | "checkmate"
  | "stalemate"
  | "insufficient-material"
  | "threefold-repetition"
  | "fifty-move-rule"
  | "resignation"
  | "agreement"
  | "timeout";

export interface PositionStatus {
  turn: Color;
  inCheck: boolean;
  over: boolean;
  result: GameResult;
  reason?: TerminalReason;
}

/**
 * Status of the final position of a line. Threefold repetition needs the full history,
 * so we replay the line through one Chess instance.
 */
/**
 * Status after `uptoPly` plies. Works from the final position instead of replaying the game:
 * repetitions are counted from the positions already stored in the line (same key as chess.js:
 * placement, side to move, castling rights and a capturable en-passant square).
 */
export function lineStatus(line: Line, uptoPly = line.plies.length): PositionStatus {
  const n = Math.min(uptoPly, line.plies.length);
  const fen = n === 0 ? line.startFen : line.plies[n - 1].fenAfter;
  const chess = new Chess(fen);
  const key = positionKey(chess.fen());
  let seen = positionKey(new Chess(line.startFen).fen()) === key ? 1 : 0;
  for (let i = 0; i < n; i++) if (positionKey(line.plies[i].fenAfter) === key) seen++;
  return statusOf(chess, seen >= 3);
}

export function fenStatus(fen: string): PositionStatus {
  return statusOf(new Chess(fen));
}

function statusOf(chess: Chess, threefold = chess.isThreefoldRepetition()): PositionStatus {
  const turn = chess.turn();
  const inCheck = chess.inCheck();
  if (chess.isCheckmate()) return { turn, inCheck, over: true, result: turn === "w" ? "0-1" : "1-0", reason: "checkmate" };
  if (chess.isStalemate()) return { turn, inCheck, over: true, result: "1/2-1/2", reason: "stalemate" };
  if (chess.isInsufficientMaterial()) return { turn, inCheck, over: true, result: "1/2-1/2", reason: "insufficient-material" };
  if (threefold) return { turn, inCheck, over: true, result: "1/2-1/2", reason: "threefold-repetition" };
  if (chess.isDrawByFiftyMoves()) return { turn, inCheck, over: true, result: "1/2-1/2", reason: "fifty-move-rule" };
  return { turn, inCheck, over: false, result: "*" };
}

export function describeResult(result: GameResult, reason?: TerminalReason): string {
  const why: Record<TerminalReason, string> = {
    checkmate: "by checkmate",
    stalemate: "by stalemate",
    "insufficient-material": "by insufficient material",
    "threefold-repetition": "by threefold repetition",
    "fifty-move-rule": "by the fifty-move rule",
    resignation: "by resignation",
    agreement: "by agreement",
    timeout: "on time",
  };
  const suffix = reason ? ` ${why[reason]}` : "";
  if (result === "1-0") return `White wins${suffix}`;
  if (result === "0-1") return `Black wins${suffix}`;
  if (result === "1/2-1/2") return `Draw${suffix}`;
  return "Game in progress";
}

export function turnLabel(turn: Color): string {
  return `${colorName(turn)} to move`;
}

/** Material on the board, from a FEN. */
export function materialCount(fen: string): Record<Color, number> {
  const placement = fen.split(" ")[0];
  const res: Record<Color, number> = { w: 0, b: 0 };
  for (const ch of placement) {
    const lower = ch.toLowerCase() as PieceSymbol;
    if (lower in PIECE_VALUES) {
      res[ch === lower ? "b" : "w"] += PIECE_VALUES[lower];
    }
  }
  return res;
}

/** Material balance from White's point of view. */
export function materialBalance(fen: string): number {
  const m = materialCount(fen);
  return m.w - m.b;
}

const START_COUNTS: Record<PieceSymbol, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };

/** Pieces each side has lost relative to the initial set (promotions can make this approximate). */
export function capturedPieces(fen: string): Record<Color, PieceSymbol[]> {
  const placement = fen.split(" ")[0];
  const counts: Record<Color, Record<PieceSymbol, number>> = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  };
  for (const ch of placement) {
    const lower = ch.toLowerCase() as PieceSymbol;
    if (lower in START_COUNTS) counts[ch === lower ? "b" : "w"][lower]++;
  }
  const lost = (c: Color): PieceSymbol[] => {
    const out: PieceSymbol[] = [];
    for (const t of ["q", "r", "b", "n", "p"] as PieceSymbol[]) {
      for (let i = counts[c][t]; i < START_COUNTS[t]; i++) out.push(t);
    }
    return out;
  };
  // Key = pieces captured BY that colour (i.e. lost by the opponent).
  return { w: lost("b"), b: lost("w") };
}

/** Count of non-pawn, non-king material: useful for detecting the endgame phase. */
export function pieceMaterial(fen: string): number {
  const placement = fen.split(" ")[0];
  let total = 0;
  for (const ch of placement) {
    const t = ch.toLowerCase();
    if (t === "n" || t === "b") total += 3;
    if (t === "r") total += 5;
    if (t === "q") total += 9;
  }
  return total;
}

export type GamePhase = "opening" | "middlegame" | "endgame";

export function phaseOf(fen: string, plyIndex: number): GamePhase {
  if (pieceMaterial(fen) <= 26) return "endgame";
  if (plyIndex <= 20) return "opening";
  return "middlegame";
}
