// Builds src/content/puzzles/puzzles.json from the Lichess puzzle database (CC0).
//
// Usage:
//   1. Download https://database.lichess.org/lichess_db_puzzle.csv.zst and decompress it
//      (a partial download of the first ~25 MB is plenty).
//   2. node scripts/build-puzzles.mjs path/to/lichess_db_puzzle.csv
//
// Every selected puzzle is replayed with chess.js and re-verified with Stockfish:
// at each of the solver's moves, the stored move must be the engine's best move
// (or equal in value, e.g. another mate of the same length). Puzzles that fail are dropped.
// Explanations and hints are generated from facts computed on the actual position.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";
import { createEngine, scoreValue } from "./lib/engine-node.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: node scripts/build-puzzles.mjs <lichess_db_puzzle.csv>");
  process.exit(1);
}

// ---- Theme -> skill mapping and teaching text --------------------------------------------

const THEMES = {
  // lichessTheme: [skillId, short name, explanation sentence, first hint]
  backRankMate: ["back-rank", "Back-rank mate", "The king is trapped on its back rank by its own pawns, so a rook or queen landing on that rank delivers mate.", "Your opponent's king has no escape squares in front of it. Which heavy piece can reach the back rank?"],
  smotheredMate: ["smothered-mate", "Smothered mate", "A smothered mate happens when the king is boxed in by its own pieces and a knight delivers check that cannot be blocked.", "The enemy king is surrounded by its own pieces. A knight check cannot be blocked."],
  doubleCheck: ["double-check", "Double check", "In a double check two pieces give check at once. The only legal reply is a king move, because no single move can block or capture both checkers.", "Can you uncover a check while the moving piece also gives check?"],
  discoveredAttack: ["discovered-attack", "Discovered attack", "Moving one piece out of the way unleashes an attack from the piece behind it, so the moving piece is free to create a second threat.", "One of your pieces is lined up behind another. What happens if the front piece moves with a threat?"],
  skewer: ["skewer", "Skewer", "A skewer attacks a valuable piece along a line; when it moves out of the way, the piece behind it can be captured.", "Line up a long-range piece against a valuable target with something else behind it."],
  pin: ["pin", "Pin", "A pinned piece cannot move (or should not move) because a more valuable piece, often the king, stands behind it on the same line.", "Is there an enemy piece that cannot move without exposing something more valuable behind it?"],
  fork: ["fork", "Fork", "A fork is a single move that attacks two or more targets at once; your opponent can usually save only one of them.", "Look for a move that attacks two targets at the same time."],
  deflection: ["deflection", "Deflection", "Deflection forces a defending piece away from the square or piece it is guarding.", "Which enemy piece has too many jobs? Can you force it away?"],
  attraction: ["decoy", "Decoy (attraction)", "A decoy lures an enemy piece, often the king, onto a square where it can be attacked, usually with a sacrifice.", "Can you force an enemy piece onto a bad square, even if it costs material?"],
  capturingDefender: ["remove-defender", "Removing the defender", "Capturing or eliminating the piece that guards a target leaves the target undefended.", "Find the piece that is holding your opponent's position together, then remove it."],
  intermezzo: ["intermezzo", "Intermediate move (zwischenzug)", "Instead of making the expected recapture, an in-between move creates a bigger threat first.", "Before recapturing automatically, is there a stronger forcing move available?"],
  trappedPiece: ["trapped-piece", "Trapped piece", "A piece with no safe squares can be attacked and won.", "One enemy piece is short of safe squares. How can you attack it?"],
  hangingPiece: ["hanging-piece", "Hanging piece", "An undefended (hanging) piece can be captured for free. Always check what your opponent has left unprotected.", "Is any enemy piece left without protection?"],
  promotion: ["promotion", "Promotion", "Advancing a passed pawn to the last rank turns it into a new queen (or another piece).", "Your pawn is close to promoting. How can you clear its path?"],
  advancedPawn: ["promotion", "Advanced pawn", "A far-advanced pawn ties down the opponent's pieces and can decide the game if it promotes.", "Your advanced pawn is a powerful asset. Can you make use of it?"],
  defensiveMove: ["defense", "Defensive move", "Sometimes the best move is a precise defence that neutralises your opponent's threats.", "First, identify exactly what your opponent is threatening."],
  quietMove: ["quiet-move", "Quiet move", "A quiet move makes no check or capture, but creates an unstoppable threat or restricts the opponent decisively.", "The best move here is not a check or a capture. Look for a quiet move that creates an unstoppable threat."],
  xRayAttack: ["x-ray", "X-ray attack", "An x-ray attack works through an enemy piece: when that piece moves or is exchanged, the line opens.", "Look along the lines your pieces control, even through other pieces."],
  clearance: ["clearance", "Clearance", "A clearance move vacates a square or line so another piece can use it.", "One of your pieces is in the way of another. Can it move with tempo?"],
  interference: ["interference", "Interference", "Interference places a piece between an enemy piece and the square it defends.", "Can you cut the connection between a defender and what it protects?"],
  mateIn1: ["mate-in-1", "Mate in one", "Checkmate in one move: the king is in check and has no legal way out.", "Look at every check you can give. One of them is checkmate."],
  mateIn2: ["mate-in-2", "Mate in two", "A forced checkmate in two moves. Forcing moves (checks) limit your opponent's options.", "Start with a forcing move. Checks are the first candidates."],
  mateIn3: ["mate-in-3", "Mate in three", "A forced checkmate in three moves: each move must keep your opponent's replies under control.", "Use checks to drive the king into a mating net."],
  mateIn4: ["mate-in-3", "Mate in four", "A forced checkmate in four moves, built from checks and threats.", "Use checks to drive the king into a mating net."],
  sacrifice: ["sacrifice", "Sacrifice", "Giving up material can be correct when it leads to mate or wins more material back.", "Do not be afraid to give up material if it forces your opponent's replies."],
};

const PRIMARY_ORDER = [
  "backRankMate", "smotheredMate", "doubleCheck", "discoveredAttack", "skewer", "pin", "fork",
  "deflection", "attraction", "capturingDefender", "intermezzo", "trappedPiece", "promotion",
  "defensiveMove", "quietMove", "xRayAttack", "clearance", "interference", "hangingPiece",
  "mateIn1", "mateIn2", "mateIn3", "mateIn4", "advancedPawn", "sacrifice",
];

const PIECE = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// ---- CSV parsing ---------------------------------------------------------------------------

function parseCsv(text) {
  const rows = [];
  const lines = text.split("\n");
  const header = lines[0].split(",");
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    const parts = l.split(",");
    if (parts.length < header.length) continue; // truncated final line of a partial download
    const r = {};
    header.forEach((h, j) => (r[h] = parts[j]));
    rows.push(r);
  }
  return rows;
}

function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function levelOf(p) {
  const n = Math.floor(p.moves.length / 2);
  const t = p.themes;
  const r = p.rating;
  if ((t.includes("defensiveMove") || t.includes("intermezzo") || t.includes("quietMove")) && r >= 1300 && r <= 2100) return 4;
  if (n === 1 && r <= 1150) return 1;
  if (n === 2 && r <= 1500) return 2;
  if (n === 1 && r > 1150 && r <= 1500) return 2;
  if (n >= 2 && r > 1450 && r <= 1900) return 3;
  if (n >= 2 && r > 1900 && r <= 2400) return 5;
  return 0;
}

const QUOTA = { 1: 40, 2: 36, 3: 30, 4: 24, 5: 20 };

// Core beginner motifs appear more often; rarer motifs still get a share.
const WEIGHT = {
  fork: 3, hangingPiece: 3, mateIn1: 3, pin: 2, skewer: 2, discoveredAttack: 2, backRankMate: 2,
  mateIn2: 2, doubleCheck: 1, smotheredMate: 1, deflection: 1, attraction: 1, capturingDefender: 1,
  intermezzo: 1, trappedPiece: 1, promotion: 1, defensiveMove: 2, quietMove: 1, xRayAttack: 1,
  clearance: 1, interference: 1, mateIn3: 1, mateIn4: 1, advancedPawn: 1, sacrifice: 1,
};

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

function explain(p, finalEval) {
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

// ---- Main ----------------------------------------------------------------------------------

const rows = parseCsv(readFileSync(csvPath, "utf8"));
console.log(`Read ${rows.length} rows`);

const candidates = rows
  .map((r) => ({
    id: r.PuzzleId,
    fen: r.FEN,
    moves: r.Moves.split(" "),
    rating: +r.Rating,
    rd: +r.RatingDeviation,
    popularity: +r.Popularity,
    plays: +r.NbPlays,
    themes: r.Themes.split(" "),
    gameUrl: r.GameUrl,
  }))
  .filter((p) => p.popularity >= 88 && p.plays >= 1500 && p.rd <= 85 && p.moves.length >= 2 && p.moves.length <= 8);

const byLevel = { 1: [], 2: [], 3: [], 4: [], 5: [] };
for (const p of candidates) {
  const lv = levelOf(p);
  if (!lv) continue;
  p.level = lv;
  p.primary = PRIMARY_ORDER.find((t) => p.themes.includes(t));
  if (!p.primary) continue;
  byLevel[lv].push(p);
}

// Round-robin over primary themes for variety; deterministic order by hash.
function pickPool(list, n) {
  const groups = new Map();
  for (const p of list.sort((a, b) => hash(a.id) - hash(b.id))) {
    if (!groups.has(p.primary)) groups.set(p.primary, []);
    groups.get(p.primary).push(p);
  }
  const out = [];
  const keys = [...groups.keys()].sort((a, b) => PRIMARY_ORDER.indexOf(a) - PRIMARY_ORDER.indexOf(b));
  while (out.length < n && keys.some((k) => groups.get(k).length)) {
    for (const k of keys) {
      const g = groups.get(k);
      for (let w = 0; w < (WEIGHT[k] ?? 1); w++) if (g.length && out.length < n) out.push(g.shift());
    }
  }
  return out;
}

const engine = createEngine();
await engine.init();

const results = [];
const rejected = [];
for (const lv of [1, 2, 3, 4, 5]) {
  const pool = pickPool(byLevel[lv], QUOTA[lv] * 2);
  let accepted = 0;
  for (const p of pool) {
    if (accepted >= QUOTA[lv]) break;
    // chess.js replay
    const c = new Chess(p.fen);
    let ok = true;
    for (const u of p.moves) {
      try {
        c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      } catch {
        ok = false;
        break;
      }
    }
    if (!ok) {
      rejected.push([p.id, "illegal"]);
      continue;
    }
    // Engine verification of each solver move
    const v = new Chess(p.fen);
    v.move({ from: p.moves[0].slice(0, 2), to: p.moves[0].slice(2, 4), promotion: p.moves[0][4] });
    const steps = [];
    let finalEval;
    for (let i = 1; i < p.moves.length; i += 2) {
      const fen = v.fen();
      const isLast = i >= p.moves.length - 2;
      const res = await engine.analyse(fen, { depth: 16, multipv: 3 });
      const best = res[0];
      const sol = p.moves[i];
      const solInfo = res.find((r) => r.move === sol);
      if (!best || (best.move !== sol && (!solInfo || scoreValue(solInfo.score) < scoreValue(best.score) - 30))) {
        ok = false;
        rejected.push([p.id, `engine prefers ${best?.move} over ${sol}`]);
        break;
      }
      // Alternatives: equal mates, or (last move only) moves within 30cp of a decisive best.
      const alts = res
        .filter((r) => r.move !== sol)
        .filter((r) => {
          if (r.score.mate !== undefined && best.score.mate !== undefined) return r.score.mate > 0 && r.score.mate <= best.score.mate;
          if (isLast && r.score.cp !== undefined && best.score.cp !== undefined) return best.score.cp >= 300 && r.score.cp >= best.score.cp - 30;
          return false;
        })
        .map((r) => r.move);
      steps.push({ alternatives: isLast ? alts : alts.filter(() => false) });
      if (isLast) finalEval = best.score.cp;
      v.move({ from: sol.slice(0, 2), to: sol.slice(2, 4), promotion: sol[4] });
      if (i + 1 < p.moves.length) {
        const r = p.moves[i + 1];
        v.move({ from: r.slice(0, 2), to: r.slice(2, 4), promotion: r[4] });
      }
    }
    if (!ok) continue;
    const ex = explain(p, finalEval);
    const info = THEMES[p.primary];
    const skills = [...new Set(p.themes.map((t) => THEMES[t]?.[0]).filter(Boolean))];
    if (p.themes.includes("endgame")) skills.push("endgame-technique");
    const solverMoves = Math.floor(p.moves.length / 2);
    results.push({
      id: `lichess-${p.id}`,
      fen: p.fen,
      setupMove: p.moves[0],
      startFen: ex.startFen,
      solution: p.moves.slice(1),
      alternatives: steps.map((s) => s.alternatives).at(-1) ?? [],
      sideToMove: ex.startFen.split(" ")[1],
      theme: info[0],
      themeName: info[1],
      skills: skills.length ? skills : [info[0]],
      lichessThemes: p.themes,
      difficulty: lv,
      rating: p.rating,
      solverMoves,
      explanation: `${info[2]} ${ex.facts}`,
      line: ex.line,
      hints: [info[3], `Consider a move with your ${PIECE[ex.keyPiece]}.`],
      hintSquare: ex.keyFrom,
      source: "Lichess puzzle database",
      attribution: `Lichess puzzle ${p.id} (CC0), from ${p.gameUrl}`,
      url: `https://lichess.org/training/${p.id}`,
    });
    accepted++;
    process.stdout.write(`L${lv} ${accepted}/${QUOTA[lv]} ${p.id} ${p.primary}\n`);
  }
}
// ---- Lesson exercise pool: easy, short, verified positions per motif ----
const POOL_THEMES = ["fork", "pin", "skewer", "discoveredAttack", "doubleCheck", "hangingPiece", "capturingDefender",
  "deflection", "attraction", "intermezzo", "backRankMate", "smotheredMate", "mateIn1", "mateIn2", "trappedPiece", "defensiveMove"];
const used = new Set(results.map((r) => r.id));
const pool = {};
for (const theme of POOL_THEMES) {
  pool[theme] = [];
  const cands = candidates
    .filter((p) => p.primary === theme && p.rating <= 1350 && p.moves.length <= 4 && !used.has(`lichess-${p.id}`))
    .sort((a, b) => a.rating - b.rating || hash(a.id) - hash(b.id));
  for (const p of cands) {
    if (pool[theme].length >= 4) break;
    const v = new Chess(p.fen);
    v.move({ from: p.moves[0].slice(0, 2), to: p.moves[0].slice(2, 4), promotion: p.moves[0][4] });
    let ok = true;
    let finalEval;
    for (let i = 1; i < p.moves.length; i += 2) {
      const res = await engine.analyse(v.fen(), { depth: 16, multipv: 2 });
      const best = res[0];
      const second = res[1];
      if (!best || best.move !== p.moves[i]) { ok = false; break; }
      // Lesson positions must have a clear, unique answer.
      if (second && best.score.mate === undefined && scoreValue(best.score) - scoreValue(second.score) < 150) { ok = false; break; }
      if (second && best.score.mate !== undefined && second.score.mate !== undefined && second.score.mate > 0) { ok = false; break; }
      if (i >= p.moves.length - 2) finalEval = best.score.cp;
      v.move({ from: p.moves[i].slice(0, 2), to: p.moves[i].slice(2, 4), promotion: p.moves[i][4] });
      if (i + 1 < p.moves.length) v.move({ from: p.moves[i + 1].slice(0, 2), to: p.moves[i + 1].slice(2, 4), promotion: p.moves[i + 1][4] });
    }
    if (!ok) continue;
    const ex = explain(p, finalEval);
    const c = new Chess(ex.startFen);
    const sans = [];
    for (const u of p.moves.slice(1)) sans.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san);
    pool[theme].push({ id: `lichess-${p.id}`, fen: ex.startFen, sans, explanation: ex.facts, line: ex.line, keyPiece: PIECE[ex.keyPiece], keyFrom: ex.keyFrom, attribution: `Lichess puzzle ${p.id} (CC0)` });
    process.stdout.write(`pool ${theme} ${p.id}\n`);
  }
}
writeFileSync(join(root, "src/content/puzzles/lesson-pool.json"), JSON.stringify(pool, null, 1));

engine.quit();

mkdirSync(join(root, "src/content/puzzles"), { recursive: true });
writeFileSync(join(root, "src/content/puzzles/puzzles.json"), JSON.stringify(results, null, 1));
console.log(`Wrote ${results.length} puzzles; rejected ${rejected.length}`);
for (const r of rejected.slice(0, 20)) console.log("  rejected", r.join(": "));
