import type { GameAnalysis, MistakeTag } from "@/lib/db/types";
import { cpFor } from "@/lib/analysis/classify";
import { phaseOf, type GamePhase } from "@/lib/chess/status";
import type { CcEnd, CcGame } from "./types";

/**
 * Turns a learner's Chess.com games into study advice.
 *
 * Two kinds of evidence are used, and every finding says which:
 *  - "results": facts read from the game records themselves (who won, how the game ended,
 *    which opening was played, the material on the board at the end). No engine involved.
 *  - "engine": mistakes found by Stockfish in the games that were analysed on this device.
 *
 * Findings need a minimum number of games before they are reported, and each one states the
 * counts behind it. Nothing is reported when the evidence is thin.
 */

export interface Tally {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Points scored as a percentage (win = 1, draw = ½). */
  score: number;
}

export function tally(games: CcGame[]): Tally {
  const wins = games.filter((g) => g.outcome === "win").length;
  const draws = games.filter((g) => g.outcome === "draw").length;
  const losses = games.length - wins - draws;
  return { games: games.length, wins, draws, losses, score: games.length ? Math.round(((wins + draws / 2) / games.length) * 100) : 0 };
}

export const openingFamily = (name: string) => name.split(":")[0].trim();

/** Opening families that have a course in ChessPath's opening library. */
const FAMILY_TO_COURSE: [RegExp, string][] = [
  [/^Italian Game|^Giuoco/i, "italian"],
  [/^Ruy Lopez/i, "ruy-lopez"],
  [/^Scotch/i, "scotch"],
  [/^Queen's Gambit|^Slav Defense|^Semi-Slav/i, "queens-gambit"],
  [/^London System/i, "london"],
  [/^King's Indian Defense/i, "kings-indian"],
  [/^Sicilian Defense/i, "sicilian"],
  [/^French Defense/i, "french"],
  [/^Caro-Kann/i, "caro-kann"],
  [/^Scandinavian/i, "scandinavian"],
  [/^English Opening/i, "english"],
];
export function courseFor(family: string): string | undefined {
  return FAMILY_TO_COURSE.find(([re]) => re.test(family))?.[1];
}

export interface OpeningRow {
  color: "w" | "b";
  family: string;
  tally: Tally;
  course?: string;
}

export interface CcSummary {
  total: Tally;
  white: Tally;
  black: Tally;
  timeClasses: { key: string; tally: Tally; rating?: number }[];
  lossEnds: Partial<Record<CcEnd, number>>;
  winEnds: Partial<Record<CcEnd, number>>;
  drawEnds: Partial<Record<CcEnd, number>>;
  openings: OpeningRow[];
  from: number;
  to: number;
}

function countEnds(games: CcGame[]): Partial<Record<CcEnd, number>> {
  const out: Partial<Record<CcEnd, number>> = {};
  for (const g of games) out[g.end] = (out[g.end] ?? 0) + 1;
  return out;
}

export function summarise(games: CcGame[]): CcSummary {
  const by = <K extends string>(key: (g: CcGame) => K | undefined) => {
    const m = new Map<K, CcGame[]>();
    for (const g of games) {
      const k = key(g);
      if (k !== undefined) (m.get(k) ?? m.set(k, []).get(k)!).push(g);
    }
    return m;
  };
  const openings: OpeningRow[] = [...by((g) => (g.opening ? `${g.userColor}|${openingFamily(g.opening.name)}` : undefined)).entries()]
    .map(([k, list]) => {
      const [color, family] = k.split("|") as ["w" | "b", string];
      return { color, family, tally: tally(list), course: courseFor(family) };
    })
    .sort((a, b) => b.tally.games - a.tally.games || a.family.localeCompare(b.family));
  const times = games.map((g) => g.endedAt).filter(Boolean);
  return {
    total: tally(games),
    white: tally(games.filter((g) => g.userColor === "w")),
    black: tally(games.filter((g) => g.userColor === "b")),
    timeClasses: [...by((g) => g.timeClass).entries()]
      .map(([key, list]) => ({ key, tally: tally(list), rating: [...list].sort((a, b) => b.endedAt - a.endedAt).find((g) => g.rated && g.userRating)?.userRating }))
      .sort((a, b) => b.tally.games - a.tally.games),
    lossEnds: countEnds(games.filter((g) => g.outcome === "loss")),
    winEnds: countEnds(games.filter((g) => g.outcome === "win")),
    drawEnds: countEnds(games.filter((g) => g.outcome === "draw")),
    openings,
    from: times.length ? Math.min(...times) : 0,
    to: times.length ? Math.max(...times) : 0,
  };
}

// ---------------------------------------------------------------------------------------------

export interface FindingExample {
  /** Chess.com game id (CcGame.id). */
  gameId: string;
  ply: number;
  fen: string;
  orientation: "w" | "b";
  /** e.g. "23. Qxb7 against SomePlayer" */
  label: string;
  played: string;
  better: string;
}

export interface Finding {
  id: string;
  source: "engine" | "results";
  title: string;
  /** The numbers behind the finding. */
  evidence: string;
  /** What to do about it. */
  advice: string;
  severity: number;
  actions: { label: string; href: string }[];
  examples: FindingExample[];
}

export interface AnalysedGame {
  game: CcGame;
  analysis: GameAnalysis;
}

export interface EngineStats {
  games: number;
  userMoves: number;
  blunders: number;
  mistakes: number;
  /** Average of the informal per-game accuracy for the learner's side. */
  accuracy: number | null;
  phases: Record<GamePhase, { moves: number; errors: number }>;
  tags: Partial<Record<MistakeTag, { moves: number; games: number }>>;
  /** Games in which the learner was clearly winning at some point but did not win. */
  thrownWins: number;
  /** Games in which the learner was clearly winning at some point. */
  winningPositions: number;
  /** Live games with clock data: errors and moves made with little time left. */
  clock: { games: number; errors: number; lowErrors: number; moves: number; lowMoves: number };
}

/** "Clearly winning": at least this many centipawns ahead according to the engine. */
export const WINNING_CP = 500;

/** A move counts as played "short of time" with less than this share of the starting time left (and never more than a minute). */
export function lowTimeLimit(baseSeconds: number): number {
  return Math.min(60, Math.max(10, baseSeconds * 0.1));
}

const isError = (c: string) => c === "mistake" || c === "blunder";
const TACTIC_TAGS: MistakeTag[] = ["hung-material", "allowed-mate", "missed-mate", "missed-win", "missed-tactic"];

export function engineStats(analysed: AnalysedGame[]): { stats: EngineStats; examples: Map<MistakeTag | "thrown", FindingExample[]> } {
  const stats: EngineStats = {
    games: analysed.length,
    userMoves: 0,
    blunders: 0,
    mistakes: 0,
    accuracy: null,
    phases: { opening: { moves: 0, errors: 0 }, middlegame: { moves: 0, errors: 0 }, endgame: { moves: 0, errors: 0 } },
    tags: {},
    thrownWins: 0,
    winningPositions: 0,
    clock: { games: 0, errors: 0, lowErrors: 0, moves: 0, lowMoves: 0 },
  };
  const examples = new Map<MistakeTag | "thrown", (FindingExample & { drop: number })[]>();
  const accs: number[] = [];
  for (const { game, analysis } of analysed) {
    const color = game.userColor;
    const acc = analysis.accuracy?.[color];
    if (acc !== undefined) accs.push(acc);
    const seen = new Set<MistakeTag>();
    let wasWinning = false;
    const limit = game.clocks && game.baseSeconds ? lowTimeLimit(game.baseSeconds) : null;
    if (limit !== null) stats.clock.games++;
    for (const m of analysis.moveEvaluations) {
      if (m.color !== color) continue;
      stats.userMoves++;
      const phase = phaseOf(m.fenBefore, m.ply);
      stats.phases[phase].moves++;
      if (m.classification !== "book" && cpFor(m.before, color) >= WINNING_CP) wasWinning = true;
      const low = limit !== null && (game.clocks![m.ply - 1] ?? Infinity) < limit;
      if (limit !== null) {
        stats.clock.moves++;
        if (low) stats.clock.lowMoves++;
      }
      if (!isError(m.classification)) continue;
      if (m.classification === "blunder") stats.blunders++;
      else stats.mistakes++;
      stats.phases[phase].errors++;
      if (limit !== null) {
        stats.clock.errors++;
        if (low) stats.clock.lowErrors++;
      }
      const moveNo = Number(m.fenBefore.split(" ")[5] ?? "1");
      for (const t of m.tags) {
        if (!TACTIC_TAGS.includes(t)) continue;
        const e = (stats.tags[t] ??= { moves: 0, games: 0 });
        e.moves++;
        if (!seen.has(t)) {
          seen.add(t);
          e.games++;
        }
        if (m.bestSan && m.bestSan !== m.san)
          (examples.get(t) ?? examples.set(t, []).get(t)!).push({
            gameId: game.id,
            ply: m.ply,
            fen: m.fenBefore,
            orientation: color,
            label: `${moveNo}${color === "w" ? "." : "..."} ${m.san} against ${game.oppName}`,
            played: m.san,
            better: m.bestSan,
            drop: m.winDrop,
          });
      }
    }
    if (wasWinning) {
      stats.winningPositions++;
      if (game.outcome !== "win") stats.thrownWins++;
    }
  }
  stats.accuracy = accs.length ? Math.round((accs.reduce((s, a) => s + a, 0) / accs.length) * 10) / 10 : null;
  // Keep the costliest examples, at most one per game, three per pattern.
  const best = new Map<MistakeTag | "thrown", FindingExample[]>();
  for (const [k, list] of examples) {
    const used = new Set<string>();
    const out: FindingExample[] = [];
    for (const e of list.sort((a, b) => b.drop - a.drop)) {
      if (used.has(e.gameId) || out.length >= 3) continue;
      used.add(e.gameId);
      out.push({ gameId: e.gameId, ply: e.ply, fen: e.fen, orientation: e.orientation, label: e.label, played: e.played, better: e.better });
    }
    best.set(k, out);
  }
  return { stats, examples: best };
}

const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const lesson = (id: string, label: string) => ({ label: `Lesson: ${label}`, href: `/learn/${id}/` });
const puzzles = (theme: string, label: string) => ({ label: `Puzzles: ${label}`, href: `/puzzles/?theme=${theme}` });

const TAG_FINDING: Record<string, { title: string; what: string; advice: string; actions: Finding["actions"] }> = {
  "hung-material": {
    title: "You leave pieces where they can be taken",
    what: "left material to be won",
    advice: "Before you let go of a piece, look at every capture and check your opponent would have next. This one habit removes most of these.",
    actions: [lesson("hanging-pieces", "Hanging pieces"), lesson("blunder-check", "The blunder check"), puzzles("hanging-piece", "hanging pieces")],
  },
  "allowed-mate": {
    title: "You walk into checkmating attacks",
    what: "allowed a forced checkmate",
    advice: "Ask “what does that move threaten?” after every opponent move, starting with checks against your king.",
    actions: [lesson("defending", "Defending against threats"), lesson("back-rank", "Back-rank mates"), puzzles("defense", "defensive moves")],
  },
  "missed-mate": {
    title: "You miss forced checkmates",
    what: "had a forced checkmate and did not play it",
    advice: "When the enemy king is short of squares, look at every check before anything else.",
    actions: [lesson("mate-in-two", "Calculating mate in two"), lesson("mating-patterns", "Mating patterns"), puzzles("mate-in-2", "mate in two")],
  },
  "missed-win": {
    title: "You miss tactics that win material",
    what: "could have won material and played something else",
    advice: "On every move, list the checks and captures first. Most of these chances were a capture or a double attack.",
    actions: [lesson("forks", "Forks"), lesson("thinking-routine", "A thinking routine"), { label: "Puzzles: mixed tactics", href: "/puzzles/" }],
  },
  "missed-tactic": {
    title: "You overlook stronger forcing moves",
    what: "passed over a clearly stronger check or capture",
    advice: "Slow down in sharp positions and compare at least two candidate moves before choosing.",
    actions: [lesson("candidate-moves", "Candidate moves"), lesson("thinking-routine", "A thinking routine")],
  },
};

export function engineFindings(analysed: AnalysedGame[]): Finding[] {
  if (!analysed.length) return [];
  const { stats, examples } = engineStats(analysed);
  const out: Finding[] = [];
  const of = `of the ${n(stats.games, "game")} analysed`;
  for (const [tag, def] of Object.entries(TAG_FINDING)) {
    const t = stats.tags[tag as MistakeTag];
    // A pattern needs to show up in at least two games, or three times in one.
    if (!t || (t.games < 2 && t.moves < 3)) continue;
    out.push({
      id: `engine-${tag}`,
      source: "engine",
      title: def.title,
      evidence: `In ${t.games} ${of} you ${def.what} (${n(t.moves, "time")} in total).`,
      advice: def.advice,
      severity: 10 + t.moves * 2 + t.games,
      actions: def.actions,
      examples: examples.get(tag as MistakeTag) ?? [],
    });
  }
  if (stats.thrownWins >= 2) {
    out.push({
      id: "engine-thrown-wins",
      source: "engine",
      title: "You let winning positions slip",
      evidence: `You were clearly winning (the engine had you at least 5 pawns ahead) in ${n(stats.winningPositions, "game")} ${of}, and did not win ${stats.thrownWins} of them.`,
      advice: "When you are well ahead, trade pieces, keep your king safe and stop looking for brilliancies. Simple moves win won games.",
      severity: 12 + stats.thrownWins * 3,
      actions: [lesson("exchanges-prophylaxis", "Exchanges and prophylaxis"), lesson("blunder-check", "The blunder check")],
      examples: [],
    });
  }
  // One phase clearly worse than the rest of the game.
  for (const phase of ["opening", "endgame"] as const) {
    const p = stats.phases[phase];
    const restMoves = stats.userMoves - p.moves;
    const restErrors = stats.blunders + stats.mistakes - p.errors;
    if (p.moves < 40 || p.errors < 3 || restMoves < 40) continue;
    const rate = p.errors / p.moves;
    const restRate = restErrors / restMoves;
    if (rate < restRate * 1.5) continue;
    const per = (r: number) => (r * 20).toFixed(1);
    out.push({
      id: `engine-phase-${phase}`,
      source: "engine",
      title: phase === "opening" ? "Your openings cost you more than the rest of the game" : "Your endgames cost you more than the rest of the game",
      evidence: `${n(p.errors, "serious error")} in ${p.moves} ${phase} moves (${per(rate)} per 20 moves), against ${per(restRate)} per 20 moves in the rest of your play.`,
      advice: phase === "opening" ? "Develop a piece with every move, castle early and do not move the same piece twice without a reason." : "In endgames, bring your king forward, and count pawn races move by move instead of guessing.",
      severity: 9 + p.errors,
      actions:
        phase === "opening"
          ? [lesson("centre-development", "Centre and development"), lesson("opening-traps", "Opening traps"), { label: "Opening courses", href: "/openings/" }]
          : [lesson("opposition", "Opposition and key squares"), lesson("lucena-philidor", "Rook endgames"), puzzles("promotion", "promoting pawns")],
      examples: [],
    });
  }
  const c = stats.clock;
  if (c.lowErrors >= 3 && c.errors > 0 && c.moves > 0 && c.lowErrors / c.errors >= 0.4 && c.lowErrors / c.errors >= (c.lowMoves / c.moves) * 1.5) {
    out.push({
      id: "engine-time-pressure",
      source: "engine",
      title: "Your serious errors come when you are short of time",
      evidence: `${c.lowErrors} of your ${n(c.errors, "serious error")} in timed games were played with under a tenth of your starting time left (at most a minute), although only ${Math.round((c.lowMoves / c.moves) * 100)}% of your moves were.`,
      advice: "Spend less time on obvious moves early on, so you still have time when the position gets sharp. A longer time control would also help while you build the habit.",
      severity: 9 + c.lowErrors,
      actions: [lesson("blunder-check", "The blunder check"), lesson("thinking-routine", "A thinking routine")],
      examples: [],
    });
  }
  return out.sort((a, b) => b.severity - a.severity);
}

export function resultFindings(games: CcGame[]): Finding[] {
  const out: Finding[] = [];
  if (!games.length) return out;
  const total = tally(games);
  const losses = games.filter((g) => g.outcome === "loss");
  const pctOf = (a: number, b: number) => Math.round((a / b) * 100);

  // Stalemating a won position is always avoidable, so even one is worth reporting.
  const stalemates = games.filter((g) => g.outcome === "draw" && g.end === "stalemate" && g.finalMaterial >= 5);
  if (stalemates.length >= 1) {
    out.push({
      id: "results-stalemate",
      source: "results",
      title: stalemates.length === 1 ? "You stalemated a winning position" : `You stalemated ${stalemates.length} winning positions`,
      evidence: `${n(stalemates.length, "game")} of your last ${games.length} ended in stalemate while you were at least a rook ahead: a draw instead of a win.`,
      advice: "When your opponent has only a king left, check that it still has a legal move before every move you make.",
      severity: 8 + stalemates.length * 3,
      actions: [lesson("checkmate-stalemate", "Checkmate and stalemate"), lesson("queen-mate", "Checkmate with the queen"), lesson("rook-mate", "Checkmate with the rook")],
      examples: [],
    });
  }

  const flagged = losses.filter((g) => g.end === "timeout");
  if (flagged.length >= 3 && flagged.length / losses.length >= 0.25) {
    const ahead = flagged.filter((g) => g.finalMaterial >= 3).length;
    out.push({
      id: "results-timeouts",
      source: "results",
      title: "You lose a lot of games on the clock",
      evidence: `${flagged.length} of your ${losses.length} losses (${pctOf(flagged.length, losses.length)}%) were on time${ahead ? `, ${ahead} of them while you were at least a piece ahead` : ""}.`,
      advice: "Play quicker in the opening and on forced moves, and consider a time control with an increment so a won game cannot be lost on the clock.",
      severity: 5 + flagged.length / 2 + ahead * 2,
      actions: [lesson("blunder-check", "The blunder check"), lesson("thinking-routine", "A thinking routine")],
      examples: [],
    });
  }

  const matedLevel = losses.filter((g) => g.end === "checkmate" && g.finalMaterial >= 0);
  if (matedLevel.length >= 3) {
    out.push({
      id: "results-mated-level",
      source: "results",
      title: "You get checkmated in games you were not losing on material",
      evidence: `In ${matedLevel.length} of your ${losses.length} losses you were checkmated with level or extra material on the board.`,
      advice: "Material was not the problem in those games: the attack on your king was. Check your king's escape squares and your opponent's checks before each move.",
      severity: 5 + matedLevel.length,
      actions: [lesson("king-safety-castling", "King safety and castling"), lesson("back-rank", "Back-rank mates"), lesson("defending", "Defending against threats"), puzzles("defense", "defensive moves")],
      examples: [],
    });
  }

  const quick = losses.filter((g) => g.plies <= 40 && (g.end === "checkmate" || g.end === "resignation"));
  if (quick.length >= 3 && quick.length / losses.length >= 0.15) {
    out.push({
      id: "results-quick-losses",
      source: "results",
      title: "You lose games in the first 20 moves",
      evidence: `${quick.length} of your ${losses.length} losses (${pctOf(quick.length, losses.length)}%) ended by checkmate or resignation within 20 moves.`,
      advice: "Games that short are usually decided by an opening trap or an early piece loss. Solid development and early castling prevent most of them.",
      severity: 4 + quick.length,
      actions: [lesson("centre-development", "Centre and development"), lesson("opening-traps", "Opening traps"), lesson("punishing-opening-mistakes", "Punishing opening mistakes")],
      examples: [],
    });
  }

  const white = tally(games.filter((g) => g.userColor === "w"));
  const black = tally(games.filter((g) => g.userColor === "b"));
  if (white.games >= 15 && black.games >= 15 && Math.abs(white.score - black.score) >= 12) {
    const weak = white.score < black.score ? "White" : "Black";
    out.push({
      id: "results-colour",
      source: "results",
      title: `You score clearly worse with ${weak}`,
      evidence: `You scored ${white.score}% in ${white.games} games as White and ${black.score}% in ${black.games} games as Black.`,
      advice: weak === "Black" ? "Pick one defence against 1.e4 and one against 1.d4, and learn their main ideas properly." : "Pick one first move and learn the main ideas of the positions it leads to.",
      severity: 3 + Math.abs(white.score - black.score) / 4,
      actions: [{ label: "Opening courses", href: "/openings/" }],
      examples: [],
    });
  }

  // Openings that score well below the learner's own average.
  const weakOpenings = summarise(games)
    .openings.filter((o) => o.tally.games >= 5 && o.tally.score <= total.score - 15)
    .sort((a, b) => a.tally.score - b.tally.score)
    .slice(0, 2);
  for (const o of weakOpenings) {
    out.push({
      id: `results-opening-${o.color}-${o.family}`,
      source: "results",
      title: `You score poorly in the ${o.family} as ${o.color === "w" ? "White" : "Black"}`,
      evidence: `You scored ${o.tally.score}% in the ${o.tally.games} games that went into it (${o.tally.wins} won, ${o.tally.draws} drawn, ${o.tally.losses} lost), against ${total.score}% overall.`,
      advice: o.course ? "ChessPath has a course on this opening: learn its main line and what each side is aiming for." : "Review how these games went wrong, or try a different set-up. General opening principles matter more than memorised lines.",
      severity: 3 + (total.score - o.tally.score) / 6 + o.tally.games / 10,
      actions: o.course ? [{ label: `Opening course: ${o.family}`, href: `/openings/${o.course}/` }] : [lesson("centre-development", "Centre and development"), { label: "Opening courses", href: "/openings/" }],
      examples: [],
    });
  }

  const endgames = games.filter((g) => g.endgamePlies >= 10);
  const eg = tally(endgames);
  if (eg.games >= 15 && eg.score <= total.score - 12) {
    out.push({
      id: "results-endgames",
      source: "results",
      title: "You score worse in games that reach an endgame",
      evidence: `You scored ${eg.score}% in the ${eg.games} games that went into an endgame, against ${total.score}% overall.`,
      advice: "Endgame technique is learnable and rarely changes: king activity, the opposition and basic rook endgames cover most games.",
      severity: 3 + (total.score - eg.score) / 4,
      actions: [lesson("opposition", "Opposition and key squares"), lesson("lucena-philidor", "Rook endgames"), puzzles("promotion", "promoting pawns")],
      examples: [],
    });
  }
  return out.sort((a, b) => b.severity - a.severity);
}

/** All findings, most important first. */
export function buildFindings(games: CcGame[], analysed: AnalysedGame[]): Finding[] {
  return [...engineFindings(analysed), ...resultFindings(games)].sort((a, b) => b.severity - a.severity);
}
