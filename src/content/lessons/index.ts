import type { CurriculumModule, Lesson, ModuleId } from "../types";
import { fundamentals } from "./fundamentals";
import { tactics } from "./tactics";
import { openingPrinciples } from "./openings";
import { strategy } from "./strategy";
import { calculation } from "./calculation";
import { endgames } from "./endgames";
import { practical } from "./practical";
import { tacticsIntro, tacticsPlus } from "./tactics-plus";
import { calculationPlus, openingsPlus, practicalPlus } from "./more-lessons";
import { endgamesPlus } from "./endgames-plus";

export const MODULES: CurriculumModule[] = [
  { id: "fundamentals", letter: "A", title: "Absolute fundamentals", description: "The board, how every piece moves, check, checkmate, special moves, draws and notation.", audience: "Start here if you are new to chess." },
  { id: "tactics", letter: "B", title: "Tactical fundamentals", description: "Mate in one, hanging pieces, forks, pins, skewers, discovered and double checks, deflection and decoy, trapped pieces, line tactics, sacrifices, attacking the king and mating patterns.", audience: "For players who know the rules but lose material." },
  { id: "openings", letter: "C", title: "Opening principles", description: "Centre, development, king safety, tempo, classic traps, and punishing opening mistakes in real games.", audience: "Play the first ten moves with a plan." },
  { id: "strategy", letter: "D", title: "Positional play", description: "Pawn structure, outposts, good and bad bishops, open files, exchanges and prophylaxis.", audience: "For improving players who want long-term plans." },
  { id: "calculation", letter: "E", title: "Calculation and decisions", description: "A repeatable thinking routine, candidate moves, mates in two and three, and quiet moves.", audience: "Stop blundering; start calculating." },
  { id: "endgames", letter: "F", title: "Endgames", description: "Basic mates, opposition, pawn races and breakthroughs, Lucena and Philidor, rook, minor-piece and queen endgames, promotion and zugzwang, several played out against Stockfish.", audience: "Convert advantages into wins." },
  { id: "practical", letter: "G", title: "Practical improvement", description: "Reviewing games, blunder-checking, time management and defending against threats.", audience: "Turn your games into training." },
];

export const ALL_LESSONS: Lesson[] = [
  ...fundamentals,
  ...tacticsIntro,
  ...tactics,
  ...tacticsPlus,
  ...openingPrinciples,
  ...openingsPlus,
  ...strategy,
  ...calculation,
  ...calculationPlus,
  ...endgames,
  ...endgamesPlus,
  ...practical,
  ...practicalPlus,
];

const byId = new Map(ALL_LESSONS.map((l) => [l.id, l]));

export function getLesson(id: string): Lesson | undefined {
  return byId.get(id);
}

export function lessonsInModule(id: ModuleId): Lesson[] {
  return ALL_LESSONS.filter((l) => l.module === id);
}

export function moduleOf(id: ModuleId): CurriculumModule {
  return MODULES.find((m) => m.id === id)!;
}

/** The next lesson in curriculum order after `id`, or undefined at the end. */
export function nextLessonAfter(id: string): Lesson | undefined {
  const i = ALL_LESSONS.findIndex((l) => l.id === id);
  return i >= 0 ? ALL_LESSONS[i + 1] : undefined;
}
