// Extends src/content/puzzles/lesson-pool.json with more verified positions from the
// Lichess puzzle database (CC0), for lesson exercises.
//
// Usage: node scripts/build-lesson-pool.mjs path/to/lichess_db_puzzle.csv
//
// Rules:
//  - Append-only: existing entries keep their index, so lessons that use them do not change.
//  - Positions used in the puzzle trainer (puzzles.json) are never reused.
//  - Every solver move is re-checked with Stockfish (depth 16, two lines): it must be the
//    engine's best move by a clear margin (150 cp), and when it mates, no other move may mate.
//  - Entries within a theme are appended easiest first (by Lichess rating).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";
import { createEngine, scoreValue } from "./lib/engine-node.mjs";
import { PIECE, explain } from "./lib/puzzle-explain.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: node scripts/build-lesson-pool.mjs <lichess_db_puzzle.csv>");
  process.exit(1);
}

// key: [target size, lichess theme(s) that must all be present, min rating, max rating, max plies incl. setup move]
const TARGETS = {
  // Existing motifs: grow each to 10 (the first 4 are easy; new ones get a little harder).
  fork: [10, ["fork"], 900, 1500, 4],
  pin: [10, ["pin"], 900, 1500, 4],
  skewer: [10, ["skewer"], 900, 1500, 4],
  discoveredAttack: [10, ["discoveredAttack"], 900, 1550, 4],
  doubleCheck: [8, ["doubleCheck"], 900, 1600, 4],
  hangingPiece: [10, ["hangingPiece"], 800, 1350, 4],
  capturingDefender: [8, ["capturingDefender"], 900, 1550, 4],
  deflection: [10, ["deflection"], 900, 1600, 4],
  attraction: [10, ["attraction"], 900, 1600, 6],
  intermezzo: [8, ["intermezzo"], 900, 1700, 4],
  backRankMate: [10, ["backRankMate"], 800, 1500, 4],
  smotheredMate: [8, ["smotheredMate"], 800, 1600, 6],
  mateIn1: [10, ["mateIn1"], 600, 1200, 2],
  mateIn2: [12, ["mateIn2"], 900, 1600, 4],
  trappedPiece: [10, ["trappedPiece"], 900, 1600, 4],
  defensiveMove: [10, ["defensiveMove"], 1000, 1700, 4],
  // New motifs
  mateIn3: [10, ["mateIn3"], 1000, 1750, 6],
  promotion: [8, ["promotion"], 900, 1600, 4],
  advancedPawn: [6, ["advancedPawn"], 900, 1600, 4],
  quietMove: [8, ["quietMove"], 1100, 1800, 4],
  xRayAttack: [6, ["xRayAttack"], 900, 1700, 4],
  clearance: [6, ["clearance"], 1000, 1700, 4],
  interference: [6, ["interference"], 1000, 1800, 4],
  sacrifice: [10, ["sacrifice"], 1000, 1700, 6],
  kingsideAttack: [10, ["kingsideAttack"], 1000, 1700, 6],
  attackingF2F7: [6, ["attackingF2F7"], 900, 1600, 6],
  exposedKing: [6, ["exposedKing"], 1000, 1700, 6],
  arabianMate: [3, ["arabianMate"], 700, 1700, 4],
  anastasiaMate: [3, ["anastasiaMate"], 700, 1700, 4],
  bodenMate: [3, ["bodenMate"], 700, 1800, 4],
  hookMate: [3, ["hookMate"], 700, 1700, 4],
  dovetailMate: [3, ["dovetailMate"], 700, 1700, 4],
  doubleBishopMate: [3, ["doubleBishopMate"], 700, 1800, 4],
  opening: [10, ["opening", "short"], 800, 1500, 4],
  rookEndgame: [10, ["rookEndgame"], 900, 1700, 6],
  pawnEndgame: [10, ["pawnEndgame"], 900, 1800, 6],
  bishopEndgame: [5, ["bishopEndgame"], 900, 1800, 6],
  knightEndgame: [5, ["knightEndgame"], 900, 1800, 6],
  queenEndgame: [5, ["queenEndgame"], 900, 1700, 6],
  zugzwang: [6, ["zugzwang"], 1000, 1900, 6],
};
const MAX_CHECKED = 120; // candidates tried per theme before giving up

function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

const poolPath = join(root, "src/content/puzzles/lesson-pool.json");
const pool = JSON.parse(readFileSync(poolPath, "utf8"));
const puzzles = JSON.parse(readFileSync(join(root, "src/content/puzzles/puzzles.json"), "utf8"));
const used = new Set([...puzzles.map((p) => p.id), ...Object.values(pool).flat().map((e) => e.id)]);

const lines = readFileSync(csvPath, "utf8").split("\n");
const header = lines[0].split(",");
const rows = [];
for (const l of lines.slice(1)) {
  const parts = l.split(",");
  if (parts.length < header.length) continue;
  const r = Object.fromEntries(header.map((h, j) => [h, parts[j]]));
  const p = { id: r.PuzzleId, fen: r.FEN, moves: r.Moves.split(" "), rating: +r.Rating, rd: +r.RatingDeviation, popularity: +r.Popularity, plays: +r.NbPlays, themes: r.Themes.split(" ") };
  if (p.popularity < 85 || p.plays < 800 || p.rd > 90 || p.moves.length < 2) continue;
  rows.push(p);
}
console.log(`Read ${rows.length} candidate rows`);

// Self-check: the shared explanation code reproduces existing entries exactly.
{
  const byId = new Map(rows.map((r) => [`lichess-${r.id}`, r]));
  let checked = 0;
  for (const e of Object.values(pool).flat()) {
    const r = byId.get(e.id);
    if (!r) continue;
    const ex = explain(r, undefined);
    if (ex.startFen !== e.fen || ex.line !== e.line || !e.explanation.startsWith(ex.facts.split(" By the end")[0].split(" This holds")[0].split(" Material is level")[0])) {
      console.error(`Explanation mismatch for ${e.id}`);
      process.exit(1);
    }
    checked++;
  }
  console.log(`Explanation self-check passed on ${checked} existing entries`);
}

const engine = createEngine();
await engine.init();

async function verify(p) {
  const v = new Chess(p.fen);
  v.move({ from: p.moves[0].slice(0, 2), to: p.moves[0].slice(2, 4), promotion: p.moves[0][4] });
  let finalEval;
  for (let i = 1; i < p.moves.length; i += 2) {
    const res = await engine.analyse(v.fen(), { depth: 16, multipv: 2 });
    const best = res[0];
    const second = res[1];
    if (!best || best.move !== p.moves[i]) return null;
    if (second && best.score.mate === undefined && scoreValue(best.score) - scoreValue(second.score) < 150) return null;
    if (second && best.score.mate !== undefined && second.score.mate !== undefined && second.score.mate > 0) return null;
    if (i >= p.moves.length - 2) finalEval = best.score.cp;
    v.move({ from: p.moves[i].slice(0, 2), to: p.moves[i].slice(2, 4), promotion: p.moves[i][4] });
    if (i + 1 < p.moves.length) v.move({ from: p.moves[i + 1].slice(0, 2), to: p.moves[i + 1].slice(2, 4), promotion: p.moves[i + 1][4] });
  }
  return { finalEval };
}

const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
for (const [key, [size, need, minR, maxR, maxPlies]] of Object.entries(TARGETS)) {
  if (only && !only.has(key)) continue;
  pool[key] ??= [];
  if (pool[key].length >= size) continue;
  const cands = rows
    .filter((p) => need.every((t) => p.themes.includes(t)) && p.rating >= minR && p.rating <= maxR && p.moves.length <= maxPlies && !used.has(`lichess-${p.id}`))
    .sort((a, b) => hash(a.id) - hash(b.id))
    .slice(0, MAX_CHECKED);
  const added = [];
  for (const p of cands) {
    if (pool[key].length + added.length >= size) break;
    const ok = await verify(p);
    if (!ok) continue;
    const ex = explain(p, ok.finalEval);
    const c = new Chess(ex.startFen);
    const sans = p.moves.slice(1).map((u) => c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san);
    added.push({ id: `lichess-${p.id}`, fen: ex.startFen, sans, explanation: ex.facts, line: ex.line, keyPiece: PIECE[ex.keyPiece], keyFrom: ex.keyFrom, attribution: `Lichess puzzle ${p.id} (CC0)`, rating: p.rating });
    used.add(`lichess-${p.id}`);
  }
  added.sort((a, b) => a.rating - b.rating);
  pool[key].push(...added);
  console.log(`${key}: ${pool[key].length}/${size}${pool[key].length < size ? "  (SHORT)" : ""}`);
  writeFileSync(poolPath, JSON.stringify(pool, null, 1));
}
engine.quit();
console.log("Done.");
