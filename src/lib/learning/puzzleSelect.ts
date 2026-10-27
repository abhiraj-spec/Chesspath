import type { Attempt, ReviewCard, SkillLevel } from "@/lib/db/types";
import type { Puzzle } from "@/content/puzzles";
import { skillInfo } from "@/content/skills";
import { DAY_MS, isDue } from "./srs";

/**
 * Adaptive puzzle selection.
 *
 * Target level: starts from the learner's self-reported level and moves up one level after
 * 5 of the last 6 attempts at (or above) the current level were clean, and down one level after
 * 4 or more of the last 6 were failed or revealed.
 *
 * Within the target level, unseen puzzles are preferred; themes linked to current weaknesses
 * are weighted 3x, and the theme of the last puzzle is down-weighted for variety.
 */
export type PuzzleMode = "adaptive" | "theme" | "review" | "level";

export const START_LEVEL: Record<SkillLevel, number> = {
  "complete-beginner": 1,
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

export function targetLevel(puzzleAttempts: Attempt[], skill: SkillLevel = "beginner"): { level: number; why: string } {
  let level = START_LEVEL[skill];
  let why = `Starting at level ${level} based on your profile.`;
  const sorted = [...puzzleAttempts].filter((a) => a.kind === "puzzle" && !a.wasReview).sort((a, b) => a.createdAt - b.createdAt);
  // Replay the history so the level evolves the same way every time it is computed.
  let window: Attempt[] = [];
  for (const a of sorted) {
    if ((a.difficulty ?? level) < level) continue;
    window.push(a);
    if (window.length > 6) window = window.slice(-6);
    if (window.length === 6) {
      const clean = window.filter((x) => x.clean).length;
      const failed = window.filter((x) => !x.solved || x.revealed || x.skipped).length;
      if (clean >= 5 && level < 5) {
        level++;
        why = `Moved up to level ${level}: you solved 5 of your last 6 puzzles cleanly.`;
        window = [];
      } else if (failed >= 4 && level > 1) {
        level--;
        why = `Moved down to level ${level}: 4 of your last 6 puzzles were not solved. Consolidating first.`;
        window = [];
      }
    }
  }
  return { level, why };
}

export interface SelectInput {
  puzzles: Puzzle[];
  attempts: Attempt[];
  reviews: ReviewCard[];
  mode: PuzzleMode;
  theme?: string;
  level?: number;
  skillLevel?: SkillLevel;
  weakSkills?: string[];
  excludeId?: string;
  now?: number;
  rng?: () => number;
}

export interface Selection {
  puzzle: Puzzle;
  reason: string;
  isReview: boolean;
}

export function selectPuzzle(input: SelectInput): Selection | null {
  const { puzzles, attempts, reviews, mode, now = Date.now(), rng = Math.random } = input;
  const byId = new Map(puzzles.map((p) => [p.id, p]));
  const puzzleAttempts = attempts.filter((a) => a.kind === "puzzle");

  if (mode === "review") {
    const due = reviews
      .filter((c) => c.kind === "puzzle" && isDue(c, now) && byId.has(c.refId) && c.refId !== input.excludeId)
      .sort((a, b) => a.dueAt - b.dueAt);
    const card = due[0];
    if (!card) return null;
    return { puzzle: byId.get(card.refId)!, reason: card.reason, isReview: true };
  }

  const lastSeen = new Map<string, Attempt>();
  for (const a of puzzleAttempts) {
    const prev = lastSeen.get(a.refId);
    if (!prev || prev.createdAt < a.createdAt) lastSeen.set(a.refId, a);
  }
  const lastTheme = puzzleAttempts.length ? byId.get([...puzzleAttempts].sort((a, b) => b.createdAt - a.createdAt)[0].refId)?.theme : undefined;

  let pool = puzzles.filter((p) => p.id !== input.excludeId);
  let reason = "";
  if (mode === "theme" && input.theme) {
    pool = pool.filter((p) => p.theme === input.theme || p.skills.includes(input.theme!));
    reason = `${skillInfo(input.theme).name} practice`;
  }
  let target = input.level;
  if (mode === "adaptive") {
    const t = targetLevel(puzzleAttempts, input.skillLevel);
    target = t.level;
    reason = t.why;
  }
  if (mode === "level" && target) reason = `Level ${target} practice`;

  // Prefer unseen puzzles; then ones not solved cleanly; then anything not seen in the last day.
  const unseen = pool.filter((p) => !lastSeen.has(p.id));
  const notClean = pool.filter((p) => lastSeen.has(p.id) && !lastSeen.get(p.id)!.clean);
  const stale = pool.filter((p) => lastSeen.has(p.id) && now - lastSeen.get(p.id)!.createdAt > DAY_MS);
  let candidates = unseen.length ? unseen : notClean.length ? notClean : stale.length ? stale : pool;

  if (target !== undefined) {
    for (const spread of [0, 1, 2, 4]) {
      const near = candidates.filter((p) => Math.abs(p.difficulty - target!) <= spread);
      if (near.length) {
        candidates = near;
        break;
      }
    }
  }
  if (candidates.length === 0) return null;

  const weak = new Set(input.weakSkills ?? []);
  const weights = candidates.map((p) => {
    let w = 1;
    if (mode === "adaptive" && (weak.has(p.theme) || p.skills.some((s) => weak.has(s)))) w *= 3;
    if (p.theme === lastTheme) w *= 0.4;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  let idx = 0;
  for (; idx < candidates.length - 1; idx++) {
    r -= weights[idx];
    if (r <= 0) break;
  }
  const puzzle = candidates[idx];
  if (mode === "adaptive" && (weak.has(puzzle.theme) || puzzle.skills.some((s) => weak.has(s)))) {
    reason = `Targeting a weak area: ${skillInfo(puzzle.theme).name.toLowerCase()}. ${reason}`;
  }
  return { puzzle, reason, isReview: false };
}

/** Recent puzzle accuracy (clean solves / attempts) over the last N non-skipped attempts. */
export function recentPuzzleAccuracy(attempts: Attempt[], n = 20): { accuracy: number; count: number } {
  const recent = attempts.filter((a) => a.kind === "puzzle" && !a.skipped).sort((a, b) => b.createdAt - a.createdAt).slice(0, n);
  if (!recent.length) return { accuracy: 0, count: 0 };
  return { accuracy: recent.filter((a) => a.solved && !a.revealed).length / recent.length, count: recent.length };
}
