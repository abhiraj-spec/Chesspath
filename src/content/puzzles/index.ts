import data from "./puzzles.json";

/**
 * Curated tactics puzzles from the Lichess puzzle database (CC0 public domain),
 * re-verified with Stockfish by scripts/build-puzzles.mjs.
 */
export interface Puzzle {
  id: string;
  /** Position before the opponent's last move. */
  fen: string;
  /** The opponent's move that sets up the puzzle (UCI). */
  setupMove: string;
  /** Position the solver sees (after setupMove). */
  startFen: string;
  /** Solver and opponent moves alternating, starting with the solver (UCI). */
  solution: string[];
  /** Additional accepted moves for the final solver move (UCI). Any checkmating move is also accepted. */
  alternatives: string[];
  sideToMove: "w" | "b";
  theme: string;
  themeName: string;
  skills: string[];
  lichessThemes: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  rating: number;
  solverMoves: number;
  explanation: string;
  line: string;
  hints: string[];
  hintSquare: string;
  source: string;
  attribution: string;
  url: string;
}

export const PUZZLES: Puzzle[] = data as Puzzle[];

const byId = new Map(PUZZLES.map((p) => [p.id, p]));

export function getPuzzle(id: string): Puzzle | undefined {
  return byId.get(id);
}

export const DIFFICULTY_LABELS: Record<number, { name: string; description: string }> = {
  1: { name: "Level 1", description: "One-move tactics" },
  2: { name: "Level 2", description: "Short combinations" },
  3: { name: "Level 3", description: "Multi-move combinations" },
  4: { name: "Level 4", description: "Defence and intermediate moves" },
  5: { name: "Level 5", description: "Complex calculation" },
};

/** Themes with at least one puzzle, sorted by count. */
export function puzzleThemes(): { theme: string; name: string; count: number }[] {
  const m = new Map<string, { name: string; count: number }>();
  for (const p of PUZZLES) {
    const e = m.get(p.theme) ?? { name: p.themeName, count: 0 };
    e.count++;
    m.set(p.theme, e);
  }
  return [...m.entries()].map(([theme, v]) => ({ theme, ...v })).sort((a, b) => b.count - a.count);
}

/** Puzzles that train a skill (primary theme or any secondary skill tag). */
export function puzzlesForSkill(skill: string): Puzzle[] {
  return PUZZLES.filter((p) => p.theme === skill || p.skills.includes(skill));
}
