import type { ReviewCard, ReviewKind } from "@/lib/db/types";

/**
 * Spaced repetition (a simplified SM-2 variant).
 *
 * Grades:
 *  - "fail": not solved (or solution revealed). Card resets: due again in 10 minutes,
 *            then 1 day, ease decreases.
 *  - "hard": solved, but only after a mistake or a hint. Interval grows slowly (x1.2, min 1 day).
 *  - "good": solved first time without hints. Interval: 1d -> 3d -> previous x ease.
 *
 * A card is "graduated" (removed from the active queue) after it has been
 * answered "good" on a review that was at least 21 days after the previous one.
 * Cards are only created for exercises the learner struggled with, so the queue
 * stays focused on genuine weak points.
 */
export type Grade = "fail" | "hard" | "good";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_EASE = 1.3;
export const MAX_EASE = 3.0;
export const START_EASE = 2.3;
export const RELEARN_DELAY_MS = 10 * 60 * 1000;
export const GRADUATION_INTERVAL_DAYS = 21;

export function gradeFrom(result: { solved: boolean; mistakes: number; hintsUsed: number; revealed?: boolean }): Grade {
  if (!result.solved || result.revealed) return "fail";
  if (result.mistakes > 0 || result.hintsUsed > 0) return "hard";
  return "good";
}

export function newCard(args: {
  kind: ReviewKind;
  refId: string;
  skills: string[];
  grade: Grade;
  reason: string;
  now: number;
}): ReviewCard {
  const base: ReviewCard = {
    id: `${args.kind}:${args.refId}`,
    kind: args.kind,
    refId: args.refId,
    skills: args.skills,
    intervalDays: 0,
    ease: START_EASE,
    reps: 0,
    lapses: 0,
    dueAt: args.now,
    lastReviewedAt: args.now,
    lastResult: args.grade,
    reason: args.reason,
    createdAt: args.now,
  };
  return schedule(base, args.grade, args.now, { initial: true });
}

export function schedule(card: ReviewCard, grade: Grade, now: number, opts: { initial?: boolean } = {}): ReviewCard {
  const c: ReviewCard = { ...card, lastReviewedAt: now, lastResult: grade };
  if (grade === "fail") {
    c.reps = 0;
    c.lapses = opts.initial ? 0 : card.lapses + 1;
    c.ease = Math.max(MIN_EASE, card.ease - (opts.initial ? 0 : 0.2));
    // First failure: retry later in the same session; then tomorrow.
    if (opts.initial || card.intervalDays === 0) {
      c.intervalDays = 0;
      c.dueAt = now + RELEARN_DELAY_MS;
    } else {
      c.intervalDays = 1;
      c.dueAt = now + DAY_MS;
    }
    return c;
  }
  if (grade === "hard") {
    c.reps = card.reps + 1;
    c.ease = Math.max(MIN_EASE, card.ease - 0.15);
    c.intervalDays = Math.max(1, Math.round(card.intervalDays * 1.2));
    c.dueAt = now + c.intervalDays * DAY_MS;
    return c;
  }
  // good
  c.reps = card.reps + 1;
  c.ease = Math.min(MAX_EASE, card.ease + 0.1);
  if (c.reps === 1) c.intervalDays = 1;
  else if (c.reps === 2) c.intervalDays = 3;
  else c.intervalDays = Math.max(card.intervalDays + 1, Math.round(card.intervalDays * c.ease));
  c.dueAt = now + c.intervalDays * DAY_MS;
  return c;
}

export function isDue(card: ReviewCard, now: number): boolean {
  return card.dueAt <= now && !isGraduated(card);
}

/** A card has graduated once the learner succeeded after a long gap. */
export function isGraduated(card: ReviewCard): boolean {
  return card.lastResult === "good" && card.intervalDays > GRADUATION_INTERVAL_DAYS;
}

export function describeDue(card: ReviewCard, now: number): string {
  const diff = card.dueAt - now;
  if (diff <= 0) return "Due now";
  if (diff < 60 * 60 * 1000) return `Due in ${Math.max(1, Math.round(diff / 60000))} min`;
  if (diff < DAY_MS) return "Due later today";
  const days = Math.round(diff / DAY_MS);
  return days === 1 ? "Due tomorrow" : `Due in ${days} days`;
}
