import { Chess, validateFen, type Color, type Move, type PieceSymbol, type Square } from "chess.js";

export type { Color, Move, PieceSymbol, Square };
export { Chess };

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

export const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

export const PIECE_VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export const colorName = (c: Color) => (c === "w" ? "White" : "Black");
export const otherColor = (c: Color): Color => (c === "w" ? "b" : "w");

export function isSquare(s: string): s is Square {
  return /^[a-h][1-8]$/.test(s);
}

/** Validates a FEN string. Returns an error message, or null when valid. */
export function fenError(fen: string): string | null {
  const r = validateFen(fen);
  if (!r.ok) return r.error ?? "Invalid FEN";
  // chess.js accepts positions where the side NOT to move is in check, which can never
  // arise in a real game (and which Stockfish refuses). Reject them explicitly.
  try {
    const c = new Chess(fen);
    const turn = c.turn();
    const opp = turn === "w" ? "b" : "w";
    const oppKing = c.findPiece({ type: "k", color: opp })[0];
    if (oppKing && c.isAttacked(oppKing, turn)) return "The side not to move is in check";
    // Pawns on the first or last rank are rejected by validateFen already.
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid FEN";
  }
  return null;
}

export function isValidFen(fen: string): boolean {
  return fenError(fen) === null;
}

export function turnOf(fen: string): Color {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

/** A UCI move string like "e2e4" or "e7e8q". */
export type Uci = string;

export function parseUci(uci: Uci): { from: Square; to: Square; promotion?: PieceSymbol } | null {
  const m = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
  if (!m) return null;
  return { from: m[1] as Square, to: m[2] as Square, promotion: m[3] as PieceSymbol | undefined };
}

export function moveToUci(m: { from: string; to: string; promotion?: string }): Uci {
  return `${m.from}${m.to}${m.promotion ?? ""}`;
}

/**
 * Applies a move given as SAN or UCI to a copy of the position.
 * Returns null if the move is illegal (never throws).
 */
export function tryMove(fen: string, move: string | { from: string; to: string; promotion?: string }): { move: Move; fen: string } | null {
  const chess = new Chess(fen);
  try {
    let m: Move;
    if (typeof move === "string") {
      const u = parseUci(move);
      m = u ? chess.move(u) : chess.move(move);
    } else {
      m = chess.move(move);
    }
    return { move: m, fen: chess.fen() };
  } catch {
    return null;
  }
}

export function sanToUci(fen: string, san: string): Uci | null {
  const r = tryMove(fen, san);
  return r ? moveToUci(r.move) : null;
}

export function uciToSan(fen: string, uci: Uci): string | null {
  const r = tryMove(fen, uci);
  return r ? r.move.san : null;
}

export function legalMoves(fen: string): Move[] {
  try {
    return new Chess(fen).moves({ verbose: true });
  } catch {
    return [];
  }
}

/** Map of origin square -> legal destination squares. */
export function legalDests(fen: string): Map<Square, Square[]> {
  const map = new Map<Square, Square[]>();
  for (const m of legalMoves(fen)) {
    const list = map.get(m.from) ?? [];
    if (!list.includes(m.to)) list.push(m.to);
    map.set(m.from, list);
  }
  return map;
}

export function kingSquare(fen: string, color: Color): Square | null {
  const chess = new Chess(fen);
  return chess.findPiece({ type: "k", color })[0] ?? null;
}

export function squareName(sq: Square): string {
  return sq;
}

export function describePiece(p: { type: PieceSymbol; color: Color }): string {
  return `${colorName(p.color).toLowerCase()} ${PIECE_NAMES[p.type]}`;
}

/** Strip move counters: used to compare positions regardless of clocks. */
export function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}
