import { Chess, type Color, type Move, type PieceSymbol, type Square, moveToUci, parseUci, START_FEN, type Uci } from "./core";

/** One ply of a game line, with the position after the move. */
export interface Ply {
  uci: Uci;
  san: string;
  from: Square;
  to: Square;
  color: Color;
  piece: PieceSymbol;
  captured?: PieceSymbol;
  promotion?: PieceSymbol;
  fenBefore: string;
  fenAfter: string;
  /** Full-move number of this ply (1 for 1.e4 and 1...e5). */
  moveNumber: number;
  check: boolean;
  mate: boolean;
}

export interface Line {
  startFen: string;
  plies: Ply[];
}

function plyFromMove(m: Move, moveNumber: number): Ply {
  return {
    uci: moveToUci(m),
    san: m.san,
    from: m.from,
    to: m.to,
    color: m.color,
    piece: m.piece,
    captured: m.captured,
    promotion: m.promotion,
    fenBefore: m.before,
    fenAfter: m.after,
    moveNumber,
    check: m.san.includes("+") || m.san.includes("#"),
    mate: m.san.includes("#"),
  };
}

/**
 * Replays UCI moves from a starting FEN. Stops at the first illegal move
 * and reports it, so corrupted records never yield an inconsistent position.
 */
export function buildLine(startFen: string, moves: Uci[]): { line: Line; error?: { index: number; move: string } } {
  const chess = new Chess(startFen);
  const plies: Ply[] = [];
  for (let i = 0; i < moves.length; i++) {
    const parsed = parseUci(moves[i]);
    const moveNumber = chess.moveNumber();
    try {
      if (!parsed) throw new Error("bad uci");
      const m = chess.move(parsed);
      plies.push(plyFromMove(m, moveNumber));
    } catch {
      return { line: { startFen, plies }, error: { index: i, move: moves[i] } };
    }
  }
  return { line: { startFen, plies } };
}

export function fenAt(line: Line, ply: number): string {
  if (ply <= 0) return line.startFen;
  return line.plies[Math.min(ply, line.plies.length) - 1].fenAfter;
}

/** Appends a move (SAN, UCI or object) to the line at the given cursor, truncating any later moves. */
export function playAt(
  line: Line,
  cursor: number,
  move: string | { from: string; to: string; promotion?: string },
): { line: Line; ply: Ply } | null {
  const fen = fenAt(line, cursor);
  const chess = new Chess(fen);
  const moveNumber = chess.moveNumber();
  try {
    const parsed = typeof move === "string" ? (parseUci(move) ?? move) : move;
    const m = chess.move(parsed);
    const ply = plyFromMove(m, moveNumber);
    return { line: { startFen: line.startFen, plies: [...line.plies.slice(0, cursor), ply] }, ply };
  } catch {
    return null;
  }
}

export function lineUcis(line: Line): Uci[] {
  return line.plies.map((p) => p.uci);
}

/** Move-pair rows for a move list: [{ number, white?, black? }] with ply indices (1-based). */
export interface MoveRow {
  number: number;
  white?: { ply: number; san: string };
  black?: { ply: number; san: string };
}

export function moveRows(line: Line): MoveRow[] {
  const rows: MoveRow[] = [];
  line.plies.forEach((p, i) => {
    const plyIndex = i + 1;
    const last = rows[rows.length - 1];
    if (p.color === "w") {
      rows.push({ number: p.moveNumber, white: { ply: plyIndex, san: p.san } });
    } else if (last && last.number === p.moveNumber && !last.black) {
      last.black = { ply: plyIndex, san: p.san };
    } else {
      rows.push({ number: p.moveNumber, black: { ply: plyIndex, san: p.san } });
    }
  });
  return rows;
}

export function emptyLine(startFen: string = START_FEN): Line {
  return { startFen, plies: [] };
}
