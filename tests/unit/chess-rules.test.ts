import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { legalDests, tryMove, sanToUci, uciToSan, START_FEN, fenError, positionKey } from "@/lib/chess/core";
import { setup } from "@/lib/chess/setup";
import { buildLine, playAt, fenAt, moveRows, emptyLine } from "@/lib/chess/line";
import { fenStatus, lineStatus, capturedPieces, materialBalance, describeResult } from "@/lib/chess/status";
import { parsePgn, splitPgn, toPgn } from "@/lib/chess/pgn";

const dests = (fen: string, sq: string) => (legalDests(fen).get(sq as never) ?? []).slice().sort();

describe("piece movement", () => {
  it("knight moves in an L and jumps", () => {
    expect(dests(START_FEN, "g1")).toEqual(["f3", "h3"]);
    const fen = setup({ white: "Ke1 Nd4", black: "Ke8" });
    expect(dests(fen, "d4")).toEqual(["b3", "b5", "c2", "c6", "e2", "e6", "f3", "f5"]);
  });
  it("rook slides along ranks and files until blocked", () => {
    const fen = setup({ white: "Kh1 Ra1 Pa4", black: "Kh8 Nc1" });
    expect(dests(fen, "a1")).toEqual(["a2", "a3", "b1", "c1"]);
  });
  it("bishop moves diagonally", () => {
    const fen = setup({ white: "Kh1 Bc1", black: "Kh8" });
    expect(dests(fen, "c1")).toEqual(["a3", "b2", "d2", "e3", "f4", "g5", "h6"]);
  });
  it("queen combines rook and bishop", () => {
    const fen = setup({ white: "Kh1 Qa1 Pa2 Pb2 Nb1", black: "Kh8" });
    expect(dests(fen, "a1")).toEqual([]);
    const open = setup({ white: "Kh1 Qd4", black: "Kb8" });
    expect(dests(open, "d4").length).toBe(27);
  });
  it("king moves one square and cannot move into check", () => {
    const fen = setup({ white: "Ke1", black: "Ke8 Rd8" });
    expect(dests(fen, "e1")).toEqual(["e2", "f1", "f2"]);
  });
  it("pawns: single, double, captures; blocked pawns cannot move", () => {
    const fen = setup({ white: "Ke1 Pe2 Pd3", black: "Ke8 Pf3 Pd4" });
    expect(dests(fen, "e2")).toEqual(["e3", "e4", "f3"]);
    expect(dests(fen, "d3")).toEqual([]);
  });
  it("rejects illegal moves", () => {
    expect(tryMove(START_FEN, "e5")).toBeNull();
    expect(tryMove(START_FEN, "e2e5")).toBeNull();
    expect(tryMove(START_FEN, "Nf3")?.move.san).toBe("Nf3");
  });
  it("a pinned piece cannot move off the pin line", () => {
    const fen = setup({ white: "Ke1 Nd2", black: "Ke8 Bb4" });
    expect(dests(fen, "d2")).toEqual([]);
  });
});

describe("check, mate, stalemate, draws", () => {
  it("detects check and the three ways to respond", () => {
    const fen = setup({ white: "Ke1 Bd2 Nc3", black: "Ke8 Bb4", turn: "w" });
    expect(fenStatus(fen).inCheck).toBe(false);
    const inCheck = setup({ white: "Ke1 Bc1 Nb1", black: "Ke8 Bb4", turn: "w" });
    const s = fenStatus(inCheck);
    expect(s.inCheck).toBe(true);
    const moves = new Chess(inCheck).moves();
    expect(moves).toContain("Bd2"); // block
    expect(moves).toContain("Nc3"); // block
    expect(moves).toContain("Ke2"); // move away
  });
  it("detects checkmate (back rank)", () => {
    const fen = setup({ white: "Kg1 Rd1 Pf2 Pg2 Ph2", black: "Kg8 Pf7 Pg7 Ph7" });
    const r = tryMove(fen, "Rd8")!;
    expect(r.move.san).toBe("Rd8#");
    const st = fenStatus(r.fen);
    expect(st.over).toBe(true);
    expect(st.reason).toBe("checkmate");
    expect(st.result).toBe("1-0");
    expect(describeResult(st.result, st.reason)).toBe("White wins by checkmate");
  });
  it("detects stalemate", () => {
    const fen = setup({ white: "Kf7 Qg5", black: "Kh8", turn: "w" });
    const r = tryMove(fen, "Qg6")!;
    expect(fenStatus(r.fen).reason).toBe("stalemate");
  });
  it("detects insufficient material", () => {
    expect(fenStatus(setup({ white: "Ke1 Bc1", black: "Ke8" })).reason).toBe("insufficient-material");
    expect(fenStatus(setup({ white: "Ke1 Nc1", black: "Ke8" })).reason).toBe("insufficient-material");
    expect(fenStatus(setup({ white: "Ke1 Rc1", black: "Ke8" })).over).toBe(false);
  });
  it("detects threefold repetition across a line", () => {
    const moves = ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"];
    const { line } = buildLine(START_FEN, moves);
    expect(lineStatus(line).reason).toBe("threefold-repetition");
    expect(lineStatus(line, 4).over).toBe(false);
  });
  it("detects the fifty-move rule", () => {
    const fen = setup({ white: "Ke1 Rh1", black: "Ke8 Ra8", halfmove: 99, fullmove: 80 });
    const r = tryMove(fen, "Rh2")!;
    expect(fenStatus(r.fen).reason).toBe("fifty-move-rule");
  });
});

describe("special moves", () => {
  it("castling both sides when legal", () => {
    const fen = setup({ white: "Ke1 Ra1 Rh1", black: "Ke8", castling: "KQ" });
    expect(tryMove(fen, "O-O")?.move.san).toBe("O-O");
    expect(tryMove(fen, "O-O-O")?.move.san).toBe("O-O-O");
    expect(sanToUci(fen, "O-O")).toBe("e1g1");
  });
  it("cannot castle out of, through, or into check, or without rights", () => {
    const through = setup({ white: "Ke1 Rh1", black: "Ke8 Rf8", castling: "K" });
    expect(tryMove(through, "O-O")).toBeNull();
    const outOf = setup({ white: "Ke1 Rh1", black: "Ke8 Re7", castling: "K" });
    expect(tryMove(outOf, "O-O")).toBeNull();
    const into = setup({ white: "Ke1 Rh1", black: "Ke8 Rg7", castling: "K" });
    expect(tryMove(into, "O-O")).toBeNull();
    const noRights = setup({ white: "Ke1 Rh1", black: "Ke8", castling: "-" });
    expect(tryMove(noRights, "O-O")).toBeNull();
    const blocked = setup({ white: "Ke1 Rh1 Bf1", black: "Ke8", castling: "K" });
    expect(tryMove(blocked, "O-O")).toBeNull();
  });
  it("moving the king removes castling rights", () => {
    const fen = setup({ white: "Ke1 Rh1", black: "Ke8 Pa7", castling: "K" });
    const a = tryMove(fen, "Kf1")!;
    const b = tryMove(a.fen, "a6")!;
    const c = tryMove(b.fen, "Ke1")!;
    const d = tryMove(c.fen, "a5")!;
    expect(tryMove(d.fen, "O-O")).toBeNull();
  });
  it("en passant is only available immediately", () => {
    const fen = setup({ white: "Ke1 Pe5", black: "Ke8 Pd7", turn: "b" });
    const a = tryMove(fen, "d5")!;
    expect(tryMove(a.fen, "exd6")?.move.flags).toContain("e");
    const after = tryMove(a.fen, "exd6")!;
    expect(after.fen.split(" ")[0]).not.toContain("p"); // captured pawn removed
    const waited = tryMove(tryMove(a.fen, "Kf1")!.fen, "Ke7")!;
    expect(tryMove(waited.fen, "exd6")).toBeNull();
  });
  it("promotion to any piece", () => {
    const fen = setup({ white: "Ke1 Pa7", black: "Kh8" });
    expect(tryMove(fen, "a7a8q")?.move.san).toBe("a8=Q+");
    expect(tryMove(fen, "a7a8n")?.move.san).toBe("a8=N");
    expect(uciToSan(fen, "a7a8r")).toBe("a8=R+");
    expect(tryMove(fen, "a7a8")).toBeNull();
  });
});

describe("FEN and notation", () => {
  it("validates FEN", () => {
    expect(fenError(START_FEN)).toBeNull();
    expect(fenError("8/8/8/8/8/8/8/8 w - - 0 1")).not.toBeNull();
    expect(fenError("not a fen")).not.toBeNull();
  });
  it("setup helper builds correct FEN", () => {
    expect(setup({ white: "Ke1", black: "Ke8" })).toBe("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
    expect(() => setup({ white: "Ke1 Ke2", black: "Ke8" })).toThrow();
    expect(() => setup({ white: "Ke1 Xe2", black: "Ke8" })).toThrow();
  });
  it("round-trips FEN through chess.js", () => {
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
    expect(new Chess(fen).fen()).toBe(fen);
    expect(positionKey(fen)).toBe("r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -");
  });
});

describe("game lines, undo/redo, history consistency", () => {
  it("builds a line and reports notation and move rows", () => {
    const { line, error } = buildLine(START_FEN, ["e2e4", "e7e5", "g1f3"]);
    expect(error).toBeUndefined();
    expect(line.plies.map((p) => p.san)).toEqual(["e4", "e5", "Nf3"]);
    expect(moveRows(line)).toEqual([
      { number: 1, white: { ply: 1, san: "e4" }, black: { ply: 2, san: "e5" } },
      { number: 2, white: { ply: 3, san: "Nf3" } },
    ]);
  });
  it("move rows handle Black to move first", () => {
    const fen = setup({ white: "Ke1", black: "Ke8 Pa7", turn: "b", fullmove: 10 });
    const { line } = buildLine(fen, ["a7a6", "e1e2"]);
    expect(moveRows(line)).toEqual([
      { number: 10, black: { ply: 1, san: "a6" } },
      { number: 11, white: { ply: 2, san: "Ke2" } },
    ]);
  });
  it("stops at illegal moves and reports where", () => {
    const { line, error } = buildLine(START_FEN, ["e2e4", "e2e4"]);
    expect(line.plies.length).toBe(1);
    expect(error).toEqual({ index: 1, move: "e2e4" });
  });
  it("playing at an earlier cursor truncates (undo then new move)", () => {
    const { line } = buildLine(START_FEN, ["e2e4", "e7e5", "g1f3"]);
    const r = playAt(line, 1, "c7c5")!;
    expect(r.line.plies.map((p) => p.san)).toEqual(["e4", "c5"]);
    expect(fenAt(r.line, 0)).toBe(START_FEN);
    expect(playAt(line, 1, "e2e4")).toBeNull();
  });
  it("side to move alternates", () => {
    let line = emptyLine();
    for (const m of ["e4", "e5", "Nf3"]) line = playAt(line, line.plies.length, m)!.line;
    expect(fenAt(line, 3).split(" ")[1]).toBe("b");
    expect(line.plies.map((p) => p.color)).toEqual(["w", "b", "w"]);
  });
});

describe("material", () => {
  it("counts captured pieces and balance", () => {
    const { line } = buildLine(START_FEN, ["e2e4", "d7d5", "e4d5"]);
    const fen = fenAt(line, 3);
    expect(capturedPieces(fen).w).toEqual(["p"]);
    expect(materialBalance(fen)).toBe(1);
  });
});

describe("PGN", () => {
  const sample = `[Event "Test"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6?? 4. Qxf7# 1-0`;
  it("parses headers, moves and result", () => {
    const r = parsePgn(sample);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.game.headers.White).toBe("Alice");
    expect(r.game.moves).toEqual(["e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7"]);
    expect(r.game.result).toBe("1-0");
    expect(r.game.line.plies.at(-1)?.mate).toBe(true);
  });
  it("gives a helpful error for illegal moves", () => {
    const r = parsePgn("1. e4 e5 2. Ke3");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Ke3/);
  });
  it("rejects empty input", () => {
    expect(parsePgn("   ").ok).toBe(false);
  });
  it("handles comments, variations and NAGs", () => {
    const r = parsePgn("1. e4 {best by test} e5 (1... c5 2. Nf3) 2. Nf3 $1 Nc6 *");
    expect(r.ok && r.game.moves.length).toBe(4);
  });
  it("supports FEN setups", () => {
    const fen = setup({ white: "Kg1 Rd1 Pf2 Pg2 Ph2", black: "Kg8 Pf7 Pg7 Ph7" });
    const pgn = toPgn({ startFen: fen, moves: ["d1d8"], result: "1-0", headers: { White: "You" } });
    expect(pgn).toContain('[FEN "' + fen + '"]');
    const r = parsePgn(pgn);
    expect(r.ok && r.game.startFen).toBe(fen);
    expect(r.ok && r.game.moves).toEqual(["d1d8"]);
  });
  it("round-trips export and import", () => {
    const moves = ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "a7a6"];
    const pgn = toPgn({ startFen: START_FEN, moves, result: "*" });
    const r = parsePgn(pgn);
    expect(r.ok && r.game.moves).toEqual(moves);
  });
  it("splits multi-game files", () => {
    const two = `${sample}\n\n[Event "Second"]\n\n1. d4 d5 *`;
    const parts = splitPgn(two);
    expect(parts.length).toBe(2);
    expect(parsePgn(parts[1]).ok).toBe(true);
  });
});

describe("strict FEN validation", () => {
  it("rejects positions where the side not to move is in check", () => {
    expect(fenError("7k/5K2/8/8/8/8/8/Q7 w - - 0 1")).toMatch(/not to move is in check/);
    expect(fenError("7k/5K2/8/8/8/8/8/Q7 b - - 0 1")).toBeNull();
  });
});
