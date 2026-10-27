import { describe, expect, it } from "vitest";
import { DAY_MS, gradeFrom, isDue, isGraduated, newCard, schedule, RELEARN_DELAY_MS } from "@/lib/learning/srs";
import { classify, computeSkillStats, findWeaknesses } from "@/lib/learning/mastery";
import { selectPuzzle, targetLevel, recentPuzzleAccuracy } from "@/lib/learning/puzzleSelect";
import { buildDailyPlan, buildRecommendations, nextRecommendedLesson, startLessonId } from "@/lib/learning/plan";
import { PUZZLES } from "@/content/puzzles";
import type { Attempt, GameAnalysis, LessonProgress, UserProfile } from "@/lib/db/types";
import { seededRandom } from "@/lib/util";
import { defaultProfile } from "@/lib/db/repo";

const T0 = new Date("2026-01-10T10:00:00").getTime();

function attempt(partial: Partial<Attempt>): Attempt {
  return {
    kind: "puzzle",
    refId: "x",
    skills: ["fork"],
    solved: true,
    clean: true,
    mistakes: 0,
    hintsUsed: 0,
    revealed: false,
    skipped: false,
    durationMs: 1000,
    wasReview: false,
    createdAt: T0,
    ...partial,
  };
}

describe("spaced repetition", () => {
  it("grades attempts", () => {
    expect(gradeFrom({ solved: true, mistakes: 0, hintsUsed: 0 })).toBe("good");
    expect(gradeFrom({ solved: true, mistakes: 1, hintsUsed: 0 })).toBe("hard");
    expect(gradeFrom({ solved: true, mistakes: 0, hintsUsed: 0, revealed: true })).toBe("fail");
    expect(gradeFrom({ solved: false, mistakes: 0, hintsUsed: 0 })).toBe("fail");
  });
  it("a failed exercise comes back soon, then at growing intervals", () => {
    let c = newCard({ kind: "puzzle", refId: "p", skills: ["fork"], grade: "fail", reason: "r", now: T0 });
    expect(c.dueAt).toBe(T0 + RELEARN_DELAY_MS);
    c = schedule(c, "good", T0 + RELEARN_DELAY_MS);
    expect(c.intervalDays).toBe(1);
    c = schedule(c, "good", c.dueAt);
    expect(c.intervalDays).toBe(3);
    const before = c.intervalDays;
    c = schedule(c, "good", c.dueAt);
    expect(c.intervalDays).toBeGreaterThan(before * 2);
  });
  it("a lapse resets the interval and lowers ease", () => {
    let c = newCard({ kind: "puzzle", refId: "p", skills: [], grade: "hard", reason: "r", now: T0 });
    c = schedule(schedule(c, "good", c.dueAt), "good", T0 + 10 * DAY_MS);
    const ease = c.ease;
    c = schedule(c, "fail", c.dueAt);
    expect(c.intervalDays).toBe(1);
    expect(c.ease).toBeLessThan(ease);
    expect(c.lapses).toBe(1);
  });
  it("is not mastered after one correct answer", () => {
    let c = newCard({ kind: "puzzle", refId: "p", skills: [], grade: "fail", reason: "r", now: T0 });
    c = schedule(c, "good", c.dueAt);
    expect(isGraduated(c)).toBe(false);
    expect(isDue(c, c.dueAt)).toBe(true);
  });
});

describe("mastery model", () => {
  it("needs evidence before leaving 'learning'", () => {
    const s = computeSkillStats([attempt({}), attempt({})]).get("fork")!;
    expect(s.level).toBe("learning");
    expect(s.why).toMatch(/at least 3/);
  });
  it("does not call a skill mastered without a delayed success", () => {
    const list = Array.from({ length: 12 }, (_, i) => attempt({ createdAt: T0 + (i % 2) * DAY_MS + i }));
    const s = computeSkillStats(list).get("fork")!;
    expect(s.level).toBe("proficient");
    expect(s.why).toMatch(/3 days/);
  });
  it("reaches mastered with repeated success across days", () => {
    const list = Array.from({ length: 12 }, (_, i) => attempt({ createdAt: T0 + i * DAY_MS }));
    expect(computeSkillStats(list).get("fork")!.level).toBe("mastered");
  });
  it("classifies thresholds transparently", () => {
    expect(classify({ attempts: 5, recentScore: 0.5, distinctDays: 3, delayedSuccess: true }).level).toBe("learning");
    expect(classify({ attempts: 5, recentScore: 0.7, distinctDays: 3, delayedSuccess: true }).level).toBe("practising");
  });
  it("finds weaknesses from exercises and recurring game mistakes", () => {
    const list = [attempt({ clean: false, solved: false }), attempt({ clean: false, solved: false }), attempt({ clean: true }), attempt({ clean: false, solved: false })];
    const stats = computeSkillStats(list);
    const analysis = (id: string): GameAnalysis => ({
      gameId: id,
      engineVersion: "x",
      analysisSettings: { depth: 10, thresholds: { inaccuracy: 0.1, mistake: 0.2, blunder: 0.3 } },
      moveEvaluations: [
        { ply: 10, san: "Nf3", uci: "g1f3", color: "w", fenBefore: "", before: { cp: 0 }, after: { cp: -300 }, bestMove: "", bestSan: "", bestLine: [], replyLine: [], depth: 10, cpLoss: 300, winDrop: 30, classification: "blunder", tags: ["hung-material"] },
      ],
      identifiedMistakes: [],
      recommendations: [],
      summary: "",
      complete: true,
      createdAt: T0,
    });
    const w = findWeaknesses(stats, [analysis("a"), analysis("b")], () => "w");
    expect(w.map((x) => x.skill)).toContain("fork");
    expect(w.map((x) => x.skill)).toContain("hanging-piece");
    expect(w.find((x) => x.skill === "hanging-piece")!.evidence).toMatch(/2 of your last 2/);
    // Only one game: not enough to call it recurring.
    expect(findWeaknesses(new Map(), [analysis("a")], () => "w")).toEqual([]);
  });
});

describe("adaptive puzzle selection", () => {
  it("starts at the profile level and moves up after consistent clean solves", () => {
    expect(targetLevel([], "beginner").level).toBe(1);
    const clean = Array.from({ length: 6 }, (_, i) => attempt({ difficulty: 1, createdAt: T0 + i }));
    expect(targetLevel(clean, "beginner").level).toBe(2);
    const fails = Array.from({ length: 6 }, (_, i) => attempt({ difficulty: 3, solved: false, clean: false, createdAt: T0 + i }));
    expect(targetLevel(fails, "advanced").level).toBe(2);
  });
  it("prefers unseen puzzles at the target level", () => {
    const sel = selectPuzzle({ puzzles: PUZZLES, attempts: [], reviews: [], mode: "adaptive", skillLevel: "beginner", rng: seededRandom(3) })!;
    expect(sel.puzzle.difficulty).toBe(1);
    const seenId = sel.puzzle.id;
    const sel2 = selectPuzzle({ puzzles: PUZZLES, attempts: [attempt({ refId: seenId, difficulty: 1 })], reviews: [], mode: "adaptive", skillLevel: "beginner", rng: seededRandom(3) })!;
    expect(sel2.puzzle.id).not.toBe(seenId);
  });
  it("targets weak themes more often", () => {
    let forkCount = 0;
    const rng = seededRandom(11);
    for (let i = 0; i < 300; i++) {
      const s = selectPuzzle({ puzzles: PUZZLES, attempts: [], reviews: [], mode: "adaptive", skillLevel: "beginner", weakSkills: ["pin"], rng })!;
      if (s.puzzle.theme === "pin" || s.puzzle.skills.includes("pin")) forkCount++;
    }
    let base = 0;
    const rng2 = seededRandom(11);
    for (let i = 0; i < 300; i++) {
      const s = selectPuzzle({ puzzles: PUZZLES, attempts: [], reviews: [], mode: "adaptive", skillLevel: "beginner", rng: rng2 })!;
      if (s.puzzle.theme === "pin" || s.puzzle.skills.includes("pin")) base++;
    }
    expect(forkCount).toBeGreaterThan(base);
  });
  it("theme mode only returns that theme; review mode returns due cards with reasons", () => {
    const s = selectPuzzle({ puzzles: PUZZLES, attempts: [], reviews: [], mode: "theme", theme: "pin", rng: seededRandom(1) })!;
    expect(s.puzzle.theme === "pin" || s.puzzle.skills.includes("pin")).toBe(true);
    const card = newCard({ kind: "puzzle", refId: PUZZLES[0].id, skills: [], grade: "fail", reason: "You missed this fork", now: T0 });
    const r = selectPuzzle({ puzzles: PUZZLES, attempts: [], reviews: [card], mode: "review", now: T0 + DAY_MS })!;
    expect(r.puzzle.id).toBe(PUZZLES[0].id);
    expect(r.reason).toBe("You missed this fork");
    expect(selectPuzzle({ puzzles: PUZZLES, attempts: [], reviews: [card], mode: "review", now: T0 })).toBeNull();
  });
  it("computes accuracy", () => {
    expect(recentPuzzleAccuracy([attempt({}), attempt({ solved: false, clean: false })]).accuracy).toBe(0.5);
  });
});

describe("curriculum recommendations and daily plan", () => {
  const profile = (patch: Partial<UserProfile> = {}): UserProfile => ({ ...defaultProfile(T0), onboardingCompleted: true, ...patch });
  it("starts beginners at the right place", () => {
    expect(startLessonId(profile({ skillLevel: "complete-beginner" }))).toBe("board-coordinates");
    expect(startLessonId(profile({ skillLevel: "beginner", learningGoals: ["tactics"] }))).toBe("hanging-pieces");
    expect(nextRecommendedLesson(new Map(), profile())!.id).toBe("board-coordinates");
  });
  it("resumes an in-progress lesson first", () => {
    const p: LessonProgress = { lessonId: "forks", status: "in-progress", currentStep: 2, completedSteps: [0, 1], attempts: 1, timeSpentMs: 0, hintsUsed: 0, mistakes: 0, startedAt: T0, updatedAt: T0 };
    expect(nextRecommendedLesson(new Map([["forks", p]]), profile())!.id).toBe("forks");
  });
  it("builds a plan that fits the daily target and uses real data", () => {
    const plan = buildDailyPlan({ profile: profile({ dailyTargetMinutes: 15 }), progress: new Map(), attempts: [], reviews: [], sessions: [], weaknesses: [], openingDue: 0, now: T0 });
    expect(plan.blocks.reduce((s, b) => s + b.minutes, 0)).toBe(15);
    expect(plan.blocks.map((b) => b.kind)).toEqual(["lesson", "puzzles"]);
    const card = newCard({ kind: "puzzle", refId: "p", skills: [], grade: "fail", reason: "r", now: T0 - DAY_MS });
    const plan2 = buildDailyPlan({ profile: profile({ dailyTargetMinutes: 15 }), progress: new Map(), attempts: [], reviews: [card], sessions: [], weaknesses: [], openingDue: 0, now: T0 });
    expect(plan2.blocks.map((b) => b.kind)).toContain("review");
  });
  it("60-minute plans for complete beginners avoid full games until the rules are learned", () => {
    const plan = buildDailyPlan({ profile: profile({ dailyTargetMinutes: 60, skillLevel: "complete-beginner" }), progress: new Map(), attempts: [], reviews: [], sessions: [], weaknesses: [], openingDue: 0, now: T0 });
    expect(plan.blocks.map((b) => b.kind)).not.toContain("play");
    expect(plan.blocks.reduce((s, b) => s + b.minutes, 0)).toBe(60);
  });
  it("marks puzzle block done from today's real attempts", () => {
    const attempts = Array.from({ length: 4 }, (_, i) => attempt({ createdAt: T0 + i }));
    const plan = buildDailyPlan({ profile: profile({ dailyTargetMinutes: 10 }), progress: new Map(), attempts, reviews: [], sessions: [], weaknesses: [], openingDue: 0, now: T0 + 1000 });
    expect(plan.blocks.find((b) => b.kind === "puzzles")!.done).toBe(true);
  });
  it("gives no recommendations without evidence", () => {
    expect(buildRecommendations({ weaknesses: [], progress: new Map(), reviews: [] })).toEqual([]);
  });
});

describe("skipped exercises are neutral", () => {
  it("do not lower mastery", () => {
    const solvedOnly = [attempt({ createdAt: T0 }), attempt({ createdAt: T0 + 1 })];
    const withSkips = [...solvedOnly, attempt({ createdAt: T0 + 2, solved: false, clean: false, skipped: true }), attempt({ createdAt: T0 + 3, solved: false, clean: false, skipped: true })];
    expect(computeSkillStats(withSkips).get("fork")!.recentScore).toBe(computeSkillStats(solvedOnly).get("fork")!.recentScore);
    expect(computeSkillStats(withSkips).get("fork")!.attempts).toBe(2);
  });
  it("do not move the adaptive level down", () => {
    const skips = Array.from({ length: 6 }, (_, i) => attempt({ createdAt: T0 + i, difficulty: 3, solved: false, clean: false, skipped: true }));
    expect(targetLevel(skips, "intermediate").level).toBe(targetLevel([], "intermediate").level);
  });
  it("do not count as puzzles done in the daily plan", () => {
    const now = T0 + 1000;
    const skips = Array.from({ length: 3 }, (_, i) => attempt({ createdAt: T0 + i, solved: false, clean: false, skipped: true }));
    const plan = buildDailyPlan({ profile: defaultProfile(), progress: new Map(), attempts: skips, reviews: [], sessions: [], weaknesses: [], openingDue: 0, now });
    const block = plan.blocks.find((b) => b.kind === "puzzles")!;
    expect(block.progressText ?? "").toMatch(/^0\//);
  });
});
