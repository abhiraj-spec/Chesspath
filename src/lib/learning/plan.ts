import { ALL_LESSONS, getLesson } from "@/content/lessons";
import type { Lesson } from "@/content/types";
import type { Attempt, LessonProgress, ReviewCard, TrainingSession, UserProfile } from "@/lib/db/types";
import { skillInfo } from "@/content/skills";
import { isDue } from "./srs";
import type { Weakness } from "./mastery";
import { dateKey, startOfDay } from "@/lib/util";

/** Where the curriculum starts for each self-reported level and goal. */
export function startLessonId(profile?: Pick<UserProfile, "skillLevel" | "learningGoals" | "diagnostic">): string {
  if (profile?.diagnostic?.recommendedLessonId && getLesson(profile.diagnostic.recommendedLessonId)) return profile.diagnostic.recommendedLessonId;
  const level = profile?.skillLevel ?? "complete-beginner";
  const goal = profile?.learningGoals?.[0];
  if (level === "complete-beginner") return "board-coordinates";
  if (goal === "endgames") return level === "beginner" ? "queen-mate" : "opposition";
  if (goal === "openings") return "centre-development";
  if (goal === "positional") return level === "beginner" ? "centre-development" : "pawn-structure";
  if (level === "beginner") return "hanging-pieces";
  if (level === "intermediate") return goal === "tactics" ? "discovered-attacks" : "thinking-routine";
  return goal === "tactics" ? "zwischenzug" : "candidate-moves";
}

/**
 * The next lesson: an unfinished lesson the learner started most recently; otherwise the
 * first incomplete lesson from their starting point (wrapping round to earlier lessons).
 */
export function nextRecommendedLesson(progress: Map<string, LessonProgress>, profile?: UserProfile): Lesson | undefined {
  const inProgress = [...progress.values()].filter((p) => p.status === "in-progress").sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (inProgress && getLesson(inProgress.lessonId)) return getLesson(inProgress.lessonId);
  const start = Math.max(0, ALL_LESSONS.findIndex((l) => l.id === startLessonId(profile)));
  const ordered = [...ALL_LESSONS.slice(start), ...ALL_LESSONS.slice(0, start)];
  return ordered.find((l) => progress.get(l.id)?.status !== "completed");
}

// ---------------------------------------------------------------------------------------------

export type PlanBlockKind = "lesson" | "puzzles" | "review" | "opening" | "play" | "drill";

export interface PlanBlock {
  id: string;
  kind: PlanBlockKind;
  title: string;
  minutes: number;
  href: string;
  reason: string;
  done: boolean;
  progressText?: string;
}

export interface PlanInput {
  profile: UserProfile;
  progress: Map<string, LessonProgress>;
  attempts: Attempt[];
  reviews: ReviewCard[];
  sessions: TrainingSession[];
  weaknesses: Weakness[];
  openingDue: number;
  now?: number;
}

const PUZZLES_PER_MINUTE = 0.8;

export function buildDailyPlan(input: PlanInput): { blocks: PlanBlock[]; minutesToday: number; targetMinutes: number } {
  const { profile, progress, attempts, reviews, weaknesses, now = Date.now() } = input;
  const today = dateKey(now);
  const dayStart = startOfDay(now);
  const todayAttempts = attempts.filter((a) => a.createdAt >= dayStart);
  const session = input.sessions.find((s) => s.id === today);
  const minutesToday = Math.round((session?.duration ?? 0) / 60000);
  const target = profile.dailyTargetMinutes;
  const dueCount = reviews.filter((c) => isDue(c, now)).length;
  const reviewedToday = todayAttempts.filter((a) => a.wasReview).length;
  const nextLesson = nextRecommendedLesson(progress, profile);
  const lessonDoneToday = [...progress.values()].some((p) => p.completionDate && p.completionDate >= dayStart && p.status === "completed");
  const fundamentalsDone = ALL_LESSONS.filter((l) => l.module === "fundamentals").every((l) => progress.get(l.id)?.status === "completed");

  // Allocation (minutes) per daily target.
  const alloc = {
    10: { lesson: 5, puzzles: 5, review: 0, opening: 0, play: 0 },
    15: { lesson: 5, puzzles: 5, review: 5, opening: 0, play: 0 },
    30: { lesson: 10, puzzles: 10, review: 5, opening: 5, play: 0 },
    60: { lesson: 15, puzzles: 15, review: 10, opening: 5, play: 15 },
  }[target];

  const a = { ...alloc };
  // No reviews due: give the time to puzzles (unless reviews were already done today).
  if (dueCount === 0 && reviewedToday === 0) {
    a.puzzles += a.review;
    a.review = 0;
  } else if (target === 10 && dueCount > 0) {
    // On the shortest plan, reviews replace part of the puzzle time.
    a.review = 3;
    a.puzzles = 2;
  }
  // Absolute beginners focus on the rules before openings and full games.
  if (profile.skillLevel === "complete-beginner" && !fundamentalsDone) {
    a.lesson += a.opening + a.play;
    a.opening = 0;
    a.play = 0;
  }
  if (!nextLesson) {
    a.puzzles += a.lesson;
    a.lesson = 0;
  }
  if (input.openingDue === 0 && a.opening > 0 && !profile.learningGoals.includes("openings")) {
    a.puzzles += a.opening;
    a.opening = 0;
  }

  const blocks: PlanBlock[] = [];
  if (a.lesson > 0 && nextLesson) {
    const p = progress.get(nextLesson.id);
    const lessonTimeToday = (session?.activities ?? []).filter((x) => x.type === "lesson").reduce((s, x) => s + x.durationMs, 0);
    blocks.push({
      id: "lesson",
      kind: "lesson",
      title: p?.status === "in-progress" ? `Resume: ${nextLesson.title}` : nextLesson.title,
      minutes: a.lesson,
      href: `/learn/${nextLesson.id}/`,
      reason: p?.status === "in-progress" ? `You stopped at step ${p.currentStep + 1} of ${nextLesson.steps.length}.` : `Next in your curriculum: ${nextLesson.objective.charAt(0).toLowerCase()}${nextLesson.objective.slice(1)}`,
      done: lessonDoneToday || lessonTimeToday >= a.lesson * 60000,
    });
  }
  if (a.review > 0) {
    blocks.push({
      id: "review",
      kind: "review",
      title: dueCount > 0 ? `Review ${dueCount} exercise${dueCount === 1 ? "" : "s"}` : "Reviews",
      minutes: a.review,
      href: "/puzzles/?mode=review",
      reason: dueCount > 0 ? "Spaced repetition: exercises you found hard are due again today." : "All reviews for today are done.",
      done: dueCount === 0,
      progressText: reviewedToday ? `${reviewedToday} reviewed today` : undefined,
    });
  }
  if (a.puzzles > 0) {
    const count = Math.max(3, Math.round(a.puzzles * PUZZLES_PER_MINUTE));
    const done = todayAttempts.filter((x) => x.kind === "puzzle" && !x.wasReview).length;
    const weak = weaknesses[0];
    const theme = weak && skillInfo(weak.skill).puzzleTheme;
    blocks.push({
      id: "puzzles",
      kind: "puzzles",
      title: theme ? `${count} ${skillInfo(weak.skill).name.toLowerCase()} puzzles` : `${count} tactics puzzles`,
      minutes: a.puzzles,
      href: theme ? `/puzzles/?theme=${theme}` : "/puzzles/",
      reason: theme ? weak.evidence : "Adaptive puzzles at your current level.",
      done: done >= count,
      progressText: `${Math.min(done, count)}/${count} done`,
    });
  }
  if (a.opening > 0) {
    blocks.push({
      id: "opening",
      kind: "opening",
      title: input.openingDue > 0 ? `Recall ${input.openingDue} opening line${input.openingDue === 1 ? "" : "s"}` : "Opening practice",
      minutes: a.opening,
      href: "/openings/",
      reason: input.openingDue > 0 ? "Opening lines you studied are due for recall." : "You chose openings as a goal: practise a line from memory.",
      done: todayAttempts.some((x) => x.kind === "opening"),
    });
  }
  if (a.play > 0) {
    blocks.push({
      id: "play",
      kind: "play",
      title: "Play a game against the computer",
      minutes: a.play,
      href: "/play/",
      reason: "Apply what you learned in a real game, then review it.",
      done: (session?.activities ?? []).some((x) => x.type === "game"),
    });
  }
  return { blocks, minutesToday, targetMinutes: target };
}

// ---------------------------------------------------------------------------------------------

export interface Recommendation {
  id: string;
  title: string;
  reason: string;
  href: string;
}

/** Up to 3 recommendations, each with the evidence behind it. Nothing is invented when data is thin. */
export function buildRecommendations(input: { weaknesses: Weakness[]; progress: Map<string, LessonProgress>; reviews: ReviewCard[]; now?: number }): Recommendation[] {
  const out: Recommendation[] = [];
  for (const w of input.weaknesses.slice(0, 2)) {
    const info = skillInfo(w.skill);
    const lesson = info.lesson ? getLesson(info.lesson) : undefined;
    const lessonDone = lesson && input.progress.get(lesson.id)?.status === "completed";
    if (lesson && !lessonDone) {
      out.push({ id: `lesson-${w.skill}`, title: `Lesson: ${lesson.title}`, reason: `${w.evidence} This lesson covers it.`, href: `/learn/${lesson.id}/` });
    } else if (info.puzzleTheme) {
      out.push({ id: `puzzles-${w.skill}`, title: `Practise ${info.name.toLowerCase()}`, reason: `${w.evidence}${w.improving ? " You are improving: keep going." : ""}`, href: `/puzzles/?theme=${info.puzzleTheme}` });
    } else if (lesson) {
      out.push({ id: `relesson-${w.skill}`, title: `Revisit: ${lesson.title}`, reason: w.evidence, href: `/learn/${lesson.id}/` });
    }
  }
  const due = input.reviews.filter((c) => isDue(c, input.now ?? Date.now())).length;
  if (due > 0 && out.length < 3) {
    out.push({ id: "reviews", title: `${due} review${due === 1 ? "" : "s"} due`, reason: "Revisiting exercises you found hard, at increasing intervals, makes the patterns stick.", href: "/puzzles/?mode=review" });
  }
  return out.slice(0, 3);
}
