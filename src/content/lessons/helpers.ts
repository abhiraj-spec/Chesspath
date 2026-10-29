import { Chess } from "chess.js";
import type { PlayStep } from "../types";
import pool from "../puzzles/lesson-pool.json";

export const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

interface PoolEntry {
  id: string;
  fen: string;
  sans: string[];
  explanation: string;
  line: string;
  keyPiece: string;
  keyFrom: string;
  attribution: string;
}

const POOL = pool as unknown as Record<string, PoolEntry[]>;

/**
 * An exercise built from a verified Lichess puzzle position (CC0).
 * The solution was confirmed by Stockfish to be the clear best move at each step.
 */
export function fromPool(
  theme: string,
  index: number,
  opts: { id: string; prompt: string; hint: string; assessment?: boolean; explanationPrefix?: string },
): PlayStep {
  const entry = POOL[theme]?.[index];
  if (!entry) throw new Error(`lesson pool: no entry ${theme}[${index}]`);
  const moves = [];
  for (let i = 0; i < entry.sans.length; i += 2) {
    moves.push({ accept: { san: [entry.sans[i]] }, reply: entry.sans[i + 1] });
  }
  const side = entry.fen.split(" ")[1] === "w" ? "w" : "b";
  return {
    kind: "play",
    id: opts.id,
    fen: entry.fen,
    orientation: side,
    prompt: opts.prompt,
    moves,
    hints: [opts.hint, `Look at what your ${entry.keyPiece} can do.`],
    hintSquares: [entry.keyFrom as never],
    explanation: `${opts.explanationPrefix ? opts.explanationPrefix + " " : ""}${entry.explanation} Full line: ${entry.line}. (Position from a real game: ${entry.attribution}.)`,
    assessment: opts.assessment,
  };
}

export function poolSize(theme: string): number {
  return POOL[theme]?.length ?? 0;
}


/** FEN after playing a sequence of SAN moves from the start position (or a given FEN). */
export function fenAfter(moves: string, from: string = START): string {
  const c = new Chess(from);
  for (const m of moves.split(/\s+/).filter(Boolean)) {
    if (/^\d+\.+$/.test(m)) continue;
    c.move(m.replace(/^\d+\.+/, ""));
  }
  return c.fen();
}

/**
 * Several verified real-game exercises on one motif. The last `assess` of them are scored checks.
 * Prompts are given per exercise so each one says what to look for.
 */
export function practice(
  theme: string,
  indices: number[],
  opts: { idPrefix: string; prompt: string; hint: string; assess?: number },
): PlayStep[] {
  const assess = opts.assess ?? 2;
  return indices.map((index, i) =>
    fromPool(theme, index, {
      id: `${opts.idPrefix}-${index + 1}`,
      prompt: opts.prompt,
      hint: opts.hint,
      assessment: i >= indices.length - assess,
    }),
  );
}
