import type { ChessGameRecord } from "@/lib/db/types";
import { START_FEN } from "@/lib/chess/core";
import { toPgn } from "@/lib/chess/pgn";
import { kvDelete, kvGet, kvSet } from "@/lib/db/repo";
import type { CcGame, CcImport } from "./types";

/** Key in the local key-value table. The import lives only on this device. */
export const CC_KEY = "chesscom-import";

export const loadImport = () => kvGet<CcImport>(CC_KEY);
export const saveImport = (i: CcImport) => kvSet(CC_KEY, i);
export const clearImport = () => kvDelete(CC_KEY);

/** Id of the saved-game record for a Chess.com game. */
export const recordId = (g: Pick<CcGame, "id">) => `cc_${g.id}`;

/** A Chess.com game as a ChessPath game record, ready for analysis and review. */
export function toGameRecord(g: CcGame): ChessGameRecord {
  const moves = g.moves.split(" ").filter(Boolean);
  const result = g.outcome === "draw" ? "1/2-1/2" : (g.outcome === "win") === (g.userColor === "w") ? "1-0" : "0-1";
  const white = g.userColor === "w" ? g.userName : g.oppName;
  const black = g.userColor === "w" ? g.oppName : g.userName;
  const date = new Date(g.endedAt || Date.now()).toISOString().slice(0, 10).replace(/-/g, ".");
  const headers: Record<string, string> = { Event: "Chess.com game", Site: "Chess.com", Date: date, White: white, Black: black };
  if (g.url) headers.Link = g.url;
  if (g.timeControl) headers.TimeControl = g.timeControl;
  return {
    id: recordId(g),
    whitePlayer: white,
    blackPlayer: black,
    result,
    status: "finished",
    pgn: toPgn({ startFen: START_FEN, moves, result, headers }),
    startingFen: START_FEN,
    moves,
    createdAt: g.endedAt || Date.now(),
    updatedAt: Date.now(),
    source: "import",
    analysisStatus: "none",
    headers,
    userColor: g.userColor,
  };
}
