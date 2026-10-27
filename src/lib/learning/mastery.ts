import type { Attempt, GameAnalysis } from "@/lib/db/types";
import { DAY_MS } from "./srs";
import { dateKey } from "@/lib/util";
import { skillInfo } from "@/content/skills";

/**
 * Transparent mastery model.
 *
 * Every graded attempt (puzzle, lesson check, drill, opening recall) is evidence for its skills.
 * Credit per attempt: 1 = solved first time without hints, 0.5 = solved after a mistake or hint,
 * 0 = failed, revealed or skipped.
 *
 * Levels (all thresholds use the last 10 attempts for that skill):
 *  - New:         no attempts yet
 *  - Learning:    fewer than 3 attempts, or recent score below 60%
 *  - Practising:  3+ attempts and recent score of at least 60%
 *  - Proficient:  6+ attempts, recent score of at least 80%, on 2+ different days
 *  - Mastered:    Proficient, 10+ attempts, recent score of at least 85%, and a clean solve at
 *                 least 3 days after the first attempt (a successful delayed review)
 *
 * Completing a lesson alone never counts as mastery.
 */
export type MasteryLevel = "new" | "learning" | "practising" | "proficient" | "mastered";

export const MASTERY_LABEL: Record<MasteryLevel, string> = {
  new: "New",
  learning: "Learning",
  practising: "Practising",
  proficient: "Proficient",
  mastered: "Mastered",
};

export interface SkillStats {
  skill: string;
  attempts: number;
  clean: number;
  solved: number;
  /** 0..1, credit-weighted score over the most recent (up to 10) attempts. */
  recentScore: number;
  recentCount: number;
  /** 0..1 over the earlier attempts before the recent window (for improvement tracking). */
  earlierScore: number | null;
  distinctDays: number;
  firstAt: number;
  lastAt: number;
  delayedSuccess: boolean;
  level: MasteryLevel;
  why: string;
}

export function credit(a: Attempt): number {
  if (!a.solved || a.revealed || a.skipped) return 0;
  return a.clean ? 1 : 0.5;
}

export function computeSkillStats(attempts: Attempt[]): Map<string, SkillStats> {
  const bySkill = new Map<string, Attempt[]>();
  for (const a of attempts) for (const s of a.skills) (bySkill.get(s) ?? bySkill.set(s, []).get(s)!).push(a);
  const out = new Map<string, SkillStats>();
  for (const [skill, list] of bySkill) {
    list.sort((a, b) => a.createdAt - b.createdAt);
    const recent = list.slice(-10);
    const earlier = list.slice(0, -10).length ? list.slice(0, -10) : list.length >= 6 ? list.slice(0, Math.floor(list.length / 2)) : [];
    const recentScore = recent.reduce((s, a) => s + credit(a), 0) / recent.length;
    const earlierScore = earlier.length ? earlier.reduce((s, a) => s + credit(a), 0) / earlier.length : null;
    const days = new Set(list.map((a) => dateKey(a.createdAt))).size;
    const firstAt = list[0].createdAt;
    const delayedSuccess = list.some((a) => a.clean && a.createdAt - firstAt >= 3 * DAY_MS);
    const stats: SkillStats = {
      skill,
      attempts: list.length,
      clean: list.filter((a) => a.clean).length,
      solved: list.filter((a) => a.solved && !a.revealed).length,
      recentScore,
      recentCount: recent.length,
      earlierScore,
      distinctDays: days,
      firstAt,
      lastAt: list[list.length - 1].createdAt,
      delayedSuccess,
      level: "new",
      why: "",
    };
    const { level, why } = classify(stats);
    stats.level = level;
    stats.why = why;
    out.set(skill, stats);
  }
  return out;
}

export function classify(s: Pick<SkillStats, "attempts" | "recentScore" | "distinctDays" | "delayedSuccess">): { level: MasteryLevel; why: string } {
  const pct = Math.round(s.recentScore * 100);
  if (s.attempts === 0) return { level: "new", why: "No exercises attempted yet." };
  if (s.attempts < 3) return { level: "learning", why: `Only ${s.attempts} exercise${s.attempts === 1 ? "" : "s"} so far: at least 3 are needed to judge.` };
  if (s.recentScore < 0.6) return { level: "learning", why: `Recent score ${pct}%: below the 60% needed for "Practising".` };
  if (s.attempts < 6 || s.recentScore < 0.8 || s.distinctDays < 2) {
    const missing = [];
    if (s.attempts < 6) missing.push(`${6 - s.attempts} more exercise${6 - s.attempts === 1 ? "" : "s"}`);
    if (s.recentScore < 0.8) missing.push("a recent score of 80%+");
    if (s.distinctDays < 2) missing.push("practice on a second day");
    return { level: "practising", why: `Recent score ${pct}%. For "Proficient" you need ${missing.join(", ")}.` };
  }
  if (s.attempts >= 10 && s.recentScore >= 0.85 && s.delayedSuccess) return { level: "mastered", why: `Recent score ${pct}% over 10+ exercises, including a clean solve days after you first practised it.` };
  const missing = [];
  if (s.attempts < 10) missing.push(`${10 - s.attempts} more exercises`);
  if (s.recentScore < 0.85) missing.push("a recent score of 85%+");
  if (!s.delayedSuccess) missing.push("a clean solve at least 3 days after you first practised it");
  return { level: "proficient", why: `Recent score ${pct}%. For "Mastered" you need ${missing.join(", ")}.` };
}

// ---------------------------------------------------------------------------------------------
// Weaknesses: from exercise performance and from analysed games

export interface Weakness {
  skill: string;
  name: string;
  source: "exercises" | "games";
  /** Plain-language evidence shown to the learner. */
  evidence: string;
  severity: number;
  /** Improving: recent performance clearly better than earlier performance. */
  improving: boolean;
}

/** Map game-analysis mistake tags to trainable skills. */
export const TAG_TO_SKILL: Record<string, string> = {
  "hung-material": "hanging-piece",
  "allowed-mate": "threat-awareness",
  "missed-mate": "mate-in-2",
  "missed-win": "fork",
  "missed-tactic": "calculation",
  opening: "opening-principles",
  endgame: "endgame-technique",
};

const TAG_TEXT: Record<string, string> = {
  "hung-material": "left material undefended",
  "allowed-mate": "allowed a mating attack",
  "missed-mate": "missed a forced mate",
  "missed-win": "missed a tactic that won material",
  "missed-tactic": "missed a stronger tactical move",
  opening: "made a significant error in the opening",
  endgame: "made a significant error in the endgame",
};

export function findWeaknesses(stats: Map<string, SkillStats>, analyses: GameAnalysis[] = [], userColorOf: (gameId: string) => "w" | "b" | null = () => null): Weakness[] {
  const out: Weakness[] = [];
  for (const s of stats.values()) {
    if (s.recentCount >= 3 && s.recentScore < 0.6) {
      const improving = s.earlierScore !== null && s.recentScore - s.earlierScore >= 0.2;
      out.push({
        skill: s.skill,
        name: skillInfo(s.skill).name,
        source: "exercises",
        evidence: `You scored ${Math.round(s.recentScore * 100)}% on your last ${s.recentCount} ${skillInfo(s.skill).name.toLowerCase()} exercises.`,
        severity: (0.6 - s.recentScore) * 10 + s.recentCount / 10,
        improving,
      });
    }
  }
  // Recurring mistakes across the 5 most recent analysed games (only the learner's own moves).
  const recent = [...analyses].filter((a) => a.complete).sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const counts = new Map<string, number>();
  for (const a of recent) {
    const color = userColorOf(a.gameId);
    const seen = new Set<string>();
    for (const m of a.moveEvaluations) {
      if (color && m.color !== color) continue;
      if (m.classification !== "mistake" && m.classification !== "blunder") continue;
      for (const t of m.tags) seen.add(t);
    }
    for (const t of seen) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  for (const [tag, n] of counts) {
    if (n < 2) continue;
    const skill = TAG_TO_SKILL[tag];
    if (!skill) continue;
    const existing = out.find((w) => w.skill === skill);
    const evidence = `In ${n} of your last ${recent.length} analysed games you ${TAG_TEXT[tag]}.`;
    if (existing) {
      existing.evidence += ` ${evidence}`;
      existing.severity += n;
    } else {
      const st = stats.get(skill);
      out.push({ skill, name: skillInfo(skill).name, source: "games", evidence, severity: n * 1.5, improving: Boolean(st && st.earlierScore !== null && st.recentScore - st.earlierScore >= 0.2) });
    }
  }
  return out.sort((a, b) => b.severity - a.severity);
}
