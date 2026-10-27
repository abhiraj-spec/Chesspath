import { fenError, FILES } from "./core";

/**
 * Authoring helper: build a FEN from a readable piece list.
 *
 *   setup({ white: "Kg1 Rd1 Pf2 Pg2 Ph2", black: "Kg8 Pf7 Pg7 Ph7", turn: "w" })
 *
 * Content written with this helper is far easier to review than raw FEN strings.
 * Every lesson position is additionally validated by automated tests.
 */
export interface SetupSpec {
  white: string;
  black: string;
  turn?: "w" | "b";
  castling?: string;
  ep?: string;
  halfmove?: number;
  fullmove?: number;
}

const PIECE_RE = /^([KQRBNP])([a-h][1-8])$/;

export function setup(spec: SetupSpec): string {
  const board: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
  const place = (list: string, white: boolean) => {
    for (const token of list.trim().split(/\s+/).filter(Boolean)) {
      const m = PIECE_RE.exec(token);
      if (!m) throw new Error(`setup(): bad piece token "${token}"`);
      const file = FILES.indexOf(m[2][0] as (typeof FILES)[number]);
      const rank = Number(m[2][1]) - 1;
      if (board[rank][file]) throw new Error(`setup(): square ${m[2]} used twice`);
      board[rank][file] = white ? m[1] : m[1].toLowerCase();
    }
  };
  place(spec.white, true);
  place(spec.black, false);

  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = "";
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p) {
        empty++;
      } else {
        if (empty) row += empty;
        empty = 0;
        row += p;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  const fen = `${rows.join("/")} ${spec.turn ?? "w"} ${spec.castling ?? "-"} ${spec.ep ?? "-"} ${spec.halfmove ?? 0} ${spec.fullmove ?? 1}`;
  const err = fenError(fen);
  if (err) throw new Error(`setup(): invalid position (${err}): ${fen}`);
  return fen;
}
