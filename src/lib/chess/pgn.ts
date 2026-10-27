import { Chess, fenError, moveToUci, START_FEN, type Uci } from "./core";
import { buildLine, type Line } from "./line";
import type { GameResult } from "./status";

export interface ParsedGame {
  headers: Record<string, string>;
  startFen: string;
  moves: Uci[];
  line: Line;
  result: GameResult;
}

export type PgnParseResult = { ok: true; game: ParsedGame } | { ok: false; error: string };

const MAX_PGN_BYTES = 2_000_000;

/** Split a PGN file containing several games into individual game texts. */
export function splitPgn(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/^﻿/, "").trim();
  if (!normalized) return [];
  const games: string[] = [];
  let current: string[] = [];
  let seenMoves = false;
  for (const raw of normalized.split("\n")) {
    const line = raw.trim();
    const isHeader = /^\[\w+\s+".*"\]$/.test(line);
    if (isHeader && seenMoves) {
      games.push(current.join("\n").trim());
      current = [];
      seenMoves = false;
    }
    if (!isHeader && line.length > 0) seenMoves = true;
    current.push(raw);
  }
  if (current.join("").trim()) games.push(current.join("\n").trim());
  return games;
}

function normalizeResult(r: string | undefined): GameResult {
  if (r === "1-0" || r === "0-1" || r === "1/2-1/2") return r;
  return "*";
}

/**
 * Parse a single PGN game. Uses chess.js for move legality; any illegal or
 * unreadable move results in a descriptive error rather than a partial game.
 */
export function parsePgn(text: string): PgnParseResult {
  if (text.length > MAX_PGN_BYTES) return { ok: false, error: "This PGN is too large (over 2 MB). Try importing one game at a time." };
  const trimmed = text.replace(/\r\n?/g, "\n").replace(/^﻿/, "").trim();
  if (!trimmed) return { ok: false, error: "The PGN is empty. Paste a game such as “1. e4 e5 2. Nf3 Nc6”." };

  const chess = new Chess();
  try {
    chess.loadPgn(trimmed, { strict: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const bad = /Invalid move in PGN: (\S+)/.exec(msg)?.[1];
    return {
      ok: false,
      error: bad
        ? `The move “${bad}” is not legal in that position. Check the notation around that move.`
        : `This text could not be read as PGN (${msg.slice(0, 120)}).`,
    };
  }
  const headers = chess.getHeaders();
  const startFen = headers.FEN && headers.SetUp !== "0" ? headers.FEN : START_FEN;
  if (headers.FEN) {
    const err = fenError(headers.FEN);
    if (err) return { ok: false, error: `The FEN header is invalid: ${err}` };
  }
  const history = chess.history({ verbose: true });
  if (history.length === 0) return { ok: false, error: "No moves were found in this PGN." };
  const moves = history.map(moveToUci);
  const { line, error } = buildLine(startFen, moves);
  if (error) return { ok: false, error: `Move ${error.index + 1} (${error.move}) could not be replayed.` };
  return { ok: true, game: { headers, startFen, moves, line, result: normalizeResult(headers.Result) } };
}

export interface PgnExportInput {
  startFen: string;
  moves: Uci[];
  headers?: Record<string, string | undefined>;
  result?: GameResult;
}

export function toPgn({ startFen, moves, headers = {}, result = "*" }: PgnExportInput): string {
  const chess = new Chess(startFen);
  const base: Record<string, string> = {
    Event: headers.Event ?? "ChessPath game",
    Site: headers.Site ?? "ChessPath",
    Date: headers.Date ?? new Date().toISOString().slice(0, 10).replace(/-/g, "."),
    Round: headers.Round ?? "-",
    White: headers.White ?? "?",
    Black: headers.Black ?? "?",
    Result: result,
  };
  for (const [k, v] of Object.entries(headers)) if (v !== undefined && !(k in base)) base[k] = v;
  if (startFen !== START_FEN) {
    base.SetUp = "1";
    base.FEN = startFen;
  }
  for (const [k, v] of Object.entries(base)) chess.setHeader(k, v);
  for (const m of moves) chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
  let pgn = chess.pgn();
  // chess.js appends the Result header value only when the game is over; make it explicit.
  if (!/(1-0|0-1|1\/2-1\/2|\*)\s*$/.test(pgn)) pgn = `${pgn} ${result}`;
  return pgn;
}
