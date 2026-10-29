// Fact-based explanations for puzzle positions, shared by build-puzzles.mjs and build-lesson-pool.mjs.
// Every sentence is computed from the actual position (captures, checks, attacked pieces, material).
import { Chess } from "chess.js";

export const PIECE = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
export const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// ---- Fact-based explanation ---------------------------------------------------------------

function material(chess, color) {
  let m = 0;
  for (const row of chess.board()) for (const p of row) if (p && p.color === color) m += VALUE[p.type];
  return m;
}

function formatLine(fen, ucis) {
  const c = new Chess(fen);
  const out = [];
  for (let i = 0; i < ucis.length; i++) {
    const n = c.moveNumber();
    const turn = c.turn();
    const m = c.move({ from: ucis[i].slice(0, 2), to: ucis[i].slice(2, 4), promotion: ucis[i][4] });
    if (turn === "w") out.push(`${n}. ${m.san}`);
    else out.push(i === 0 ? `${n}... ${m.san}` : m.san);
  }
  return out.join(" ");
}

function materialPhrase(d) {
  if (d >= 8) return "about a queen's worth of material or more";
  if (d >= 5) return `about ${d} points of material (a rook's worth or more)`;
  if (d >= 3) return `about ${d} points of material (at least a minor piece)`;
  if (d === 2) return "two pawns' worth of material";
  return "a pawn";
}

export function explain(p, finalEval) {
  const setup = new Chess(p.fen);
  setup.move({ from: p.moves[0].slice(0, 2), to: p.moves[0].slice(2, 4), promotion: p.moves[0][4] });
  const startFen = setup.fen();
  const me = setup.turn();
  const them = me === "w" ? "b" : "w";
  const before = material(setup, me) - material(setup, them);

  const c = new Chess(startFen);
  const keyUci = p.moves[1];
  const key = c.move({ from: keyUci.slice(0, 2), to: keyUci.slice(2, 4), promotion: keyUci[4] });
  const facts = [];
  facts.push(`The key move is ${key.san}.`);
  const parts = [];
  if (key.captured) parts.push(`captures the ${PIECE[key.captured]} on ${key.to}`);
  if (key.san.includes("#")) parts.push("delivers checkmate");
  else if (key.san.includes("+")) parts.push("gives check, which limits your opponent's replies");
  if (key.promotion) parts.push(`promotes to a ${PIECE[key.promotion]}`);
  // What the moved piece attacks now (valuable or undefended targets).
  const targets = [];
  for (const row of c.board()) for (const sq of row) {
    if (!sq || sq.color !== them) continue;
    const attackers = c.attackers(sq.square, me);
    if (!attackers.includes(key.to)) continue;
    const defended = c.attackers(sq.square, them).length > 0;
    if (sq.type === "k" || VALUE[sq.type] > VALUE[key.piece] || (!defended && sq.type !== "p")) {
      targets.push(sq.type === "k" ? `the king` : `the ${PIECE[sq.type]} on ${sq.square}${defended ? "" : " (undefended)"}`);
    }
  }
  if (targets.length >= 2 && !key.san.includes("#")) parts.push(`attacks ${targets.slice(0, -1).join(", ")} and ${targets.at(-1)} at the same time`);
  else if (targets.length === 1 && !key.san.includes("+") && !key.san.includes("#")) parts.push(`attacks ${targets[0]}`);
  if (parts.length) facts.push(`It ${parts.join(", and ")}.`);

  const end = new Chess(startFen);
  for (const u of p.moves.slice(1)) end.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  const after = material(end, me) - material(end, them);
  const line = formatLine(startFen, p.moves.slice(1));
  let outcome;
  if (end.isCheckmate()) outcome = "The line ends in checkmate.";
  else if (after - before >= 1) outcome = `By the end of the line you have won ${materialPhrase(after - before)}.`;
  else if (finalEval !== undefined) {
    const pawns = (finalEval / 100).toFixed(1);
    outcome = Math.abs(finalEval) < 80
      ? `This holds the position: Stockfish rates the result as roughly level (${finalEval >= 0 ? "+" : ""}${pawns}).`
      : `Material is level, but Stockfish rates the result as clearly better for you (about +${pawns}).`;
  }
  return { facts: [...facts, outcome].filter(Boolean).join(" "), line, startFen, keySan: key.san, keyPiece: key.piece, keyFrom: key.from };
}

