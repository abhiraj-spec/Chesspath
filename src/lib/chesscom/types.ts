/** One game as returned by Chess.com's public API (only the fields ChessPath reads). */
export interface RawCcGame {
  url?: string;
  uuid?: string;
  pgn?: string;
  time_control?: string;
  time_class?: string;
  end_time?: number;
  rated?: boolean;
  rules?: string;
  initial_setup?: string;
  white?: RawCcSide;
  black?: RawCcSide;
}
export interface RawCcSide {
  username?: string;
  rating?: number;
  result?: string;
}

export type CcOutcome = "win" | "loss" | "draw";

/**
 * How a game ended, from the learner's point of view.
 *  - checkmate / resignation / timeout / abandoned apply to wins and losses
 *  - the rest are draws
 */
export type CcEnd = "checkmate" | "resignation" | "timeout" | "abandoned" | "stalemate" | "repetition" | "agreed" | "insufficient" | "fifty-move" | "timeout-draw" | "other";

/** A Chess.com game reduced to what ChessPath needs. Stored on this device only. */
export interface CcGame {
  /** Stable id (Chess.com's game uuid, or its URL when the uuid is missing). */
  id: string;
  url: string;
  /** Milliseconds since the epoch. */
  endedAt: number;
  timeClass: string;
  timeControl: string;
  rated: boolean;
  userColor: "w" | "b";
  userName: string;
  oppName: string;
  userRating?: number;
  oppRating?: number;
  outcome: CcOutcome;
  end: CcEnd;
  /** Moves in UCI, space separated. */
  moves: string;
  plies: number;
  /** Seconds left on the mover's clock after each ply (live games only). */
  clocks?: number[];
  /** Starting time on the clock in seconds (live games only). */
  baseSeconds?: number;
  opening?: { eco: string; name: string };
  /** Material balance at the end in pawn units, from the learner's side (positive = ahead). */
  finalMaterial: number;
  /** Number of plies played after the position became an endgame (0 if it never did). */
  endgamePlies: number;
}

export interface CcImport {
  username: string;
  fetchedAt: number;
  /** How many games were asked for. */
  requested: number;
  /** Games skipped because they were variants, had no moves, or could not be read. */
  skipped: number;
  /** Newest first. */
  games: CcGame[];
}
