import type { AnalysisLine } from "./client";
import { scoreToNumber } from "./uci";

/**
 * Computer opponent levels.
 *
 * Search depth alone does not reliably produce a given playing strength, so each level
 * combines a shallow multi-line search with controlled move selection:
 *  - `temperature` (centipawns): how willing the engine is to choose a worse candidate;
 *    candidates are sampled with weight exp(-(loss)/temperature);
 *  - `randomMoveChance`: chance of playing a random legal move (simulates oversights);
 *  - `maxLossCp`: candidates losing more than this versus the best line are excluded,
 *    except via the random-move chance.
 *
 * No Elo ratings are claimed: these are descriptive levels only.
 */
export interface LevelConfig {
  level: 1 | 2 | 3 | 4 | 5;
  name: string;
  description: string;
  depth: number;
  multipv: number;
  temperature: number;
  randomMoveChance: number;
  maxLossCp: number;
}

export const LEVELS: LevelConfig[] = [
  { level: 1, name: "Very easy", description: "Makes frequent mistakes and often misses threats. Good for practising the rules.", depth: 4, multipv: 8, temperature: 260, randomMoveChance: 0.3, maxLossCp: 900 },
  { level: 2, name: "Easy", description: "Plays sensible moves but regularly overlooks tactics.", depth: 6, multipv: 6, temperature: 140, randomMoveChance: 0.12, maxLossCp: 500 },
  { level: 3, name: "Casual", description: "A solid club-style opponent that still makes occasional mistakes.", depth: 9, multipv: 4, temperature: 60, randomMoveChance: 0.03, maxLossCp: 250 },
  { level: 4, name: "Intermediate", description: "Rarely blunders; punishes loose play.", depth: 12, multipv: 3, temperature: 20, randomMoveChance: 0, maxLossCp: 80 },
  { level: 5, name: "Challenging", description: "Plays Stockfish's best move at a moderate depth. Very strong.", depth: 16, multipv: 1, temperature: 0, randomMoveChance: 0, maxLossCp: 0 },
];

export function levelConfig(level: number): LevelConfig {
  return LEVELS.find((l) => l.level === level) ?? LEVELS[1];
}

/**
 * Choose a move from engine candidate lines.
 * `lines` scores are from White's POV; `turn` is the side choosing.
 * Never returns an illegal move: candidates are filtered against `legalUcis`.
 */
export function chooseMove(
  lines: AnalysisLine[],
  legalUcis: string[],
  cfg: LevelConfig,
  turn: "w" | "b",
  rng: () => number = Math.random,
): { move: string; reason: "best" | "sampled" | "random" } {
  if (legalUcis.length === 0) throw new Error("No legal moves");
  const legal = new Set(legalUcis);
  const candidates = lines
    .filter((l) => l.pv[0] && legal.has(l.pv[0]))
    .map((l) => ({ move: l.pv[0], value: (turn === "w" ? 1 : -1) * scoreToNumber(l.score) }));

  if (candidates.length === 0) {
    return { move: legalUcis[Math.floor(rng() * legalUcis.length)], reason: "random" };
  }
  if (cfg.randomMoveChance > 0 && rng() < cfg.randomMoveChance) {
    return { move: legalUcis[Math.floor(rng() * legalUcis.length)], reason: "random" };
  }
  candidates.sort((a, b) => b.value - a.value);
  const best = candidates[0];
  if (cfg.temperature <= 0 || candidates.length === 1) return { move: best.move, reason: "best" };
  // Never throw away a forced mate the engine has found at the easier levels beyond the loss cap.
  const pool = candidates.filter((c) => best.value - c.value <= cfg.maxLossCp);
  const weights = pool.map((c) => Math.exp(-Math.min(best.value - c.value, 5000) / cfg.temperature));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return { move: pool[i].move, reason: i === 0 ? "best" : "sampled" };
  }
  return { move: pool[pool.length - 1].move, reason: "sampled" };
}
