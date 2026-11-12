import { Chess } from "chess.js";
import { identifyOpening } from "@/lib/analysis/openingIndex";
import { materialBalance } from "@/lib/chess/status";
import type { CcEnd, CcGame, CcOutcome, RawCcGame } from "./types";

type OpeningIndex = Parameters<typeof identifyOpening>[0];

const PIECE_VALUE: Record<string, number> = { n: 3, b: 3, r: 5, q: 9 };
/** Same threshold as phaseOf(): total non-pawn material at or below this is an endgame. */
const ENDGAME_MATERIAL = 26;
const OPENING_PLIES = 36;

const LOSS_CODES: Record<string, CcEnd> = { checkmated: "checkmate", resigned: "resignation", timeout: "timeout", abandoned: "abandoned", lose: "other" };
const DRAW_CODES: Record<string, CcEnd> = { stalemate: "stalemate", repetition: "repetition", agreed: "agreed", insufficient: "insufficient", "50move": "fifty-move", timevsinsufficient: "timeout-draw" };

function outcomeOf(mine: string | undefined, theirs: string | undefined): { outcome: CcOutcome; end: CcEnd } | null {
  if (!mine || !theirs) return null;
  if (mine === "win") return { outcome: "win", end: LOSS_CODES[theirs] ?? "other" };
  if (mine in LOSS_CODES) return { outcome: "loss", end: LOSS_CODES[mine] };
  if (mine in DRAW_CODES) return { outcome: "draw", end: DRAW_CODES[mine] };
  return null;
}

function clockSeconds(text: string): number | null {
  const m = /\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/.exec(text);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

/** Read the moves (and clock comments) of a Chess.com PGN. Returns null if any move is unreadable. */
export function readMoves(pgn: string): { chess: Chess; ucis: string[]; clocks: (number | null)[]; openingFens: string[]; endgamePlies: number } | null {
  const body = pgn
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => !/^\s*\[.*\]\s*$/.test(l))
    .join(" ");
  if (body.includes("(")) return null; // variations are not expected in game records
  const chess = new Chess();
  const ucis: string[] = [];
  const clocks: (number | null)[] = [];
  const openingFens: string[] = [];
  let material = 62;
  let endgameFrom = -1;
  const re = /\{([^}]*)\}|(\S+)/g;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    if (m[1] !== undefined) {
      if (ucis.length) clocks[ucis.length - 1] = clockSeconds(m[1]);
      continue;
    }
    const tok = m[2];
    if (/^\d+\.+$/.test(tok) || /^\$\d+$/.test(tok) || tok === "1-0" || tok === "0-1" || tok === "1/2-1/2" || tok === "*") continue;
    // "12.Nf3" without a space
    const san = tok.replace(/^\d+\.+/, "");
    if (!san) continue;
    let mv;
    try {
      mv = chess.move(san);
    } catch {
      return null;
    }
    ucis.push(mv.from + mv.to + (mv.promotion ?? ""));
    clocks.push(null);
    if (mv.captured) material -= PIECE_VALUE[mv.captured] ?? 0;
    if (mv.promotion) material += PIECE_VALUE[mv.promotion] ?? 0;
    if (endgameFrom < 0 && material <= ENDGAME_MATERIAL) endgameFrom = ucis.length;
    if (ucis.length <= OPENING_PLIES) openingFens.push(mv.after);
  }
  return { chess, ucis, clocks, openingFens, endgamePlies: endgameFrom < 0 ? 0 : ucis.length - endgameFrom };
}

/** Convert one API game. Returns null when it cannot be used (variant, no moves, unknown player). */
export function toCcGame(raw: RawCcGame, username: string, index: OpeningIndex | null): CcGame | null {
  if (!raw.pgn || !raw.white || !raw.black) return null;
  const me = username.toLowerCase();
  const userColor = raw.white.username?.toLowerCase() === me ? "w" : raw.black.username?.toLowerCase() === me ? "b" : null;
  if (!userColor) return null;
  const mine = userColor === "w" ? raw.white : raw.black;
  const theirs = userColor === "w" ? raw.black : raw.white;
  const res = outcomeOf(mine.result, theirs.result);
  if (!res) return null;
  const read = readMoves(raw.pgn);
  if (!read || read.ucis.length < 2) return null;
  const live = raw.time_class !== "daily";
  const base = live ? Number(/^(\d+)/.exec(raw.time_control ?? "")?.[1]) : NaN;
  const hasClocks = live && Number.isFinite(base) && read.clocks.every((c) => c !== null);
  const opening = index ? identifyOpening(index, read.openingFens) : undefined;
  const id = raw.uuid ?? raw.url ?? "";
  if (!id) return null;
  return {
    id,
    url: raw.url && /^https:\/\/www\.chess\.com\//.test(raw.url) ? raw.url : "",
    endedAt: (raw.end_time ?? 0) * 1000,
    timeClass: raw.time_class ?? "unknown",
    timeControl: raw.time_control ?? "",
    rated: Boolean(raw.rated),
    userColor,
    userName: mine.username ?? username,
    oppName: theirs.username ?? "Opponent",
    userRating: mine.rating,
    oppRating: theirs.rating,
    outcome: res.outcome,
    end: res.end,
    moves: read.ucis.join(" "),
    plies: read.ucis.length,
    clocks: hasClocks ? (read.clocks as number[]) : undefined,
    baseSeconds: hasClocks ? base : undefined,
    opening: opening ? { eco: opening.eco, name: opening.name } : undefined,
    finalMaterial: materialBalance(read.chess.fen()) * (userColor === "w" ? 1 : -1),
    endgamePlies: read.endgamePlies,
  };
}

/** Convert many games without freezing the page: yields to the browser every few games. */
export async function toCcGames(raws: RawCcGame[], username: string, index: OpeningIndex | null, onProgress?: (done: number) => void): Promise<{ games: CcGame[]; skipped: number }> {
  const games: CcGame[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (let i = 0; i < raws.length; i++) {
    const g = toCcGame(raws[i], username, index);
    if (g && !seen.has(g.id)) {
      seen.add(g.id);
      games.push(g);
    } else skipped++;
    if (i % 8 === 7) {
      onProgress?.(i + 1);
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }
  games.sort((a, b) => b.endedAt - a.endedAt);
  return { games, skipped };
}
