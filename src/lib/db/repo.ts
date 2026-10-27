import { ALL_TABLES, getDb, SCHEMA_VERSION } from "./db";
import type {
  ActivityEntry,
  AppEvent,
  Attempt,
  ChessGameRecord,
  EventType,
  GameAnalysis,
  LessonProgress,
  OpeningProgress,
  ReviewCard,
  ReviewKind,
  TrainingSession,
  UserProfile,
} from "./types";
import { gradeFrom, newCard, schedule, type Grade } from "@/lib/learning/srs";
import { dateKey } from "@/lib/util";

/**
 * Repository: the only module that writes to the database.
 * UI components read via hooks (useLiveQuery) and write through these functions,
 * so a sync layer can later be added here without touching components.
 */

// ---------- Profile ----------

export async function getProfile(): Promise<UserProfile | undefined> {
  return getDb().profile.get("me");
}

export function defaultProfile(now = Date.now()): UserProfile {
  return {
    id: "me",
    displayName: "",
    skillLevel: "complete-beginner",
    learningGoals: ["from-scratch"],
    dailyTargetMinutes: 15,
    onboardingCompleted: false,
    createdAt: now,
    updatedAt: now,
  };
}

export async function saveProfile(patch: Partial<UserProfile>): Promise<UserProfile> {
  const db = getDb();
  return db.transaction("rw", db.profile, async () => {
    const existing = (await db.profile.get("me")) ?? defaultProfile();
    const next: UserProfile = { ...existing, ...patch, id: "me", updatedAt: Date.now() };
    await db.profile.put(next);
    return next;
  });
}

// ---------- Events (local analytics) ----------

export async function logEvent(type: EventType, refId?: string, data?: Record<string, unknown>) {
  const ev: AppEvent = { type, refId, at: Date.now(), data };
  try {
    await getDb().events.add(ev);
  } catch {
    /* analytics must never break the app */
  }
}

// ---------- Training time ----------

export async function logActivity(entry: Omit<ActivityEntry, "at"> & { at?: number }, targetMinutes?: number) {
  if (entry.durationMs <= 0) return;
  // Cap any single entry at 30 minutes so a forgotten open tab does not inflate training time.
  const durationMs = Math.min(entry.durationMs, 30 * 60 * 1000);
  const at = entry.at ?? Date.now();
  const id = dateKey(at);
  const db = getDb();
  await db.transaction("rw", db.sessions, db.events, async () => {
    const s: TrainingSession = (await db.sessions.get(id)) ?? {
      id,
      sessionDate: id,
      activities: [],
      duration: 0,
      completionStatus: "partial",
    };
    s.activities.push({ type: entry.type, refId: entry.refId, durationMs, at });
    s.duration += durationMs;
    const wasMet = s.completionStatus === "target-met";
    if (targetMinutes && s.duration >= targetMinutes * 60_000) s.completionStatus = "target-met";
    await db.sessions.put(s);
    if (!wasMet && s.completionStatus === "target-met") {
      await db.events.add({ type: "training_target_met", at, refId: id });
    }
  });
}

// ---------- Lessons ----------

export async function getLessonProgress(lessonId: string) {
  return getDb().lessonProgress.get(lessonId);
}

export async function startOrResumeLesson(lessonId: string): Promise<LessonProgress> {
  const db = getDb();
  const now = Date.now();
  const existing = await db.lessonProgress.get(lessonId);
  if (existing) {
    if (existing.status === "completed" && existing.currentStep === -1) {
      // Starting a completed lesson again: new run, keep best score and completion date.
      const next: LessonProgress = { ...existing, currentStep: 0, completedSteps: [], attempts: existing.attempts + 1, updatedAt: now };
      await db.lessonProgress.put(next);
      await logEvent("lesson_started", lessonId, { repeat: true });
      return next;
    }
    await logEvent("lesson_resumed", lessonId, { step: existing.currentStep });
    return existing;
  }
  const p: LessonProgress = {
    lessonId,
    status: "in-progress",
    currentStep: 0,
    completedSteps: [],
    attempts: 1,
    timeSpentMs: 0,
    hintsUsed: 0,
    mistakes: 0,
    startedAt: now,
    updatedAt: now,
  };
  await db.lessonProgress.put(p);
  await logEvent("lesson_started", lessonId);
  return p;
}

export async function restartLesson(lessonId: string): Promise<LessonProgress> {
  const db = getDb();
  const existing = await db.lessonProgress.get(lessonId);
  const now = Date.now();
  const p: LessonProgress = existing
    ? { ...existing, currentStep: 0, completedSteps: [], attempts: existing.attempts + 1, updatedAt: now }
    : {
        lessonId,
        status: "in-progress",
        currentStep: 0,
        completedSteps: [],
        attempts: 1,
        timeSpentMs: 0,
        hintsUsed: 0,
        mistakes: 0,
        startedAt: now,
        updatedAt: now,
      };
  await db.lessonProgress.put(p);
  return p;
}

export async function updateLessonStep(
  lessonId: string,
  patch: { currentStep: number; completedStep?: number; hintsUsed?: number; mistakes?: number; timeSpentMs?: number },
) {
  const db = getDb();
  await db.transaction("rw", db.lessonProgress, async () => {
    const p = await db.lessonProgress.get(lessonId);
    if (!p) return;
    const completedSteps =
      patch.completedStep !== undefined && !p.completedSteps.includes(patch.completedStep)
        ? [...p.completedSteps, patch.completedStep]
        : p.completedSteps;
    await db.lessonProgress.put({
      ...p,
      status: p.status === "completed" ? "completed" : "in-progress",
      currentStep: patch.currentStep,
      completedSteps,
      hintsUsed: p.hintsUsed + (patch.hintsUsed ?? 0),
      mistakes: p.mistakes + (patch.mistakes ?? 0),
      timeSpentMs: p.timeSpentMs + (patch.timeSpentMs ?? 0),
      updatedAt: Date.now(),
    });
  });
}

export async function completeLesson(lessonId: string, score: number) {
  const db = getDb();
  const now = Date.now();
  await db.transaction("rw", db.lessonProgress, db.events, async () => {
    const p = await db.lessonProgress.get(lessonId);
    if (!p) return;
    await db.lessonProgress.put({
      ...p,
      status: "completed",
      currentStep: -1,
      score: Math.max(p.score ?? 0, score),
      lastScore: score,
      completionDate: p.completionDate ?? now,
      updatedAt: now,
    });
    await db.events.add({ type: "lesson_completed", refId: lessonId, at: now, data: { score } });
  });
}

// ---------- Attempts & reviews ----------

export interface RecordAttemptInput extends Omit<Attempt, "id" | "createdAt" | "clean" | "wasReview"> {
  createdAt?: number;
  /** When set, maintain a spaced-repetition card for this exercise. */
  review?: { kind: ReviewKind; reasonIfStruggled: string; /** Schedule a card even after a clean success (opening lines). */ always?: boolean; reasonIfClean?: string };
}

/**
 * Records one graded attempt and updates the review queue:
 * - an existing card is rescheduled with the new grade;
 * - a new card is only created when the learner struggled (failed, hinted, or erred).
 */
export async function recordAttempt(input: RecordAttemptInput): Promise<{ attempt: Attempt; card?: ReviewCard; grade: Grade }> {
  const db = getDb();
  const now = input.createdAt ?? Date.now();
  const grade = gradeFrom(input);
  return db.transaction("rw", db.attempts, db.reviews, db.events, async () => {
    let card: ReviewCard | undefined;
    let wasReview = false;
    if (input.review) {
      const id = `${input.review.kind}:${input.refId}`;
      const existing = await db.reviews.get(id);
      if (existing) {
        wasReview = existing.dueAt <= now;
        card = schedule(existing, grade, now);
        if (grade !== "good") card.reason = input.review.reasonIfStruggled;
        else if (input.review.reasonIfClean) card.reason = input.review.reasonIfClean;
        await db.reviews.put(card);
      } else if ((grade !== "good" || input.review.always) && !input.skipped) {
        const reason = grade === "good" ? (input.review.reasonIfClean ?? "Scheduled review.") : input.review.reasonIfStruggled;
        card = newCard({ kind: input.review.kind, refId: input.refId, skills: input.skills, grade, reason, now });
        await db.reviews.put(card);
      }
    }
    const attempt: Attempt = {
      kind: input.kind,
      refId: input.refId,
      skills: input.skills,
      difficulty: input.difficulty,
      solved: input.solved,
      clean: grade === "good",
      mistakes: input.mistakes,
      hintsUsed: input.hintsUsed,
      revealed: input.revealed,
      skipped: input.skipped,
      durationMs: input.durationMs,
      wasReview,
      createdAt: now,
    };
    attempt.id = await db.attempts.add(attempt);
    if (input.kind === "puzzle") {
      await db.events.add({ type: "puzzle_attempted", refId: input.refId, at: now });
      if (input.solved) await db.events.add({ type: "puzzle_solved", refId: input.refId, at: now });
    }
    if (input.hintsUsed > 0) await db.events.add({ type: "hint_used", refId: input.refId, at: now, data: { count: input.hintsUsed } });
    return { attempt, card, grade };
  });
}

export async function dueReviews(now = Date.now(), kind?: ReviewKind): Promise<ReviewCard[]> {
  const cards = await getDb().reviews.where("dueAt").belowOrEqual(now).toArray();
  return cards.filter((c) => (!kind || c.kind === kind) && !(c.lastResult === "good" && c.intervalDays > 21));
}

// ---------- Games ----------

export async function saveGame(game: ChessGameRecord) {
  await getDb().games.put({ ...game, updatedAt: Date.now() });
}

export async function getGame(id: string) {
  return getDb().games.get(id);
}

export async function deleteGame(id: string) {
  const db = getDb();
  await db.transaction("rw", db.games, db.analyses, async () => {
    await db.games.delete(id);
    await db.analyses.delete(id);
  });
}

export async function saveAnalysis(a: GameAnalysis) {
  const db = getDb();
  await db.transaction("rw", db.analyses, db.games, db.events, async () => {
    await db.analyses.put(a);
    const g = await db.games.get(a.gameId);
    if (g) await db.games.put({ ...g, analysisStatus: a.complete ? "complete" : "partial", updatedAt: Date.now() });
    if (a.complete) await db.events.add({ type: "game_reviewed", refId: a.gameId, at: Date.now() });
  });
}

// ---------- Openings ----------

export async function recordOpeningRecall(openingId: string, variationId: string, success: boolean, mistakes: number) {
  const db = getDb();
  const id = `${openingId}:${variationId}`;
  const now = Date.now();
  await db.transaction("rw", db.openingProgress, async () => {
    const p: OpeningProgress = (await db.openingProgress.get(id)) ?? {
      id,
      openingId,
      variationId,
      recallAttempts: 0,
      successfulRecalls: 0,
      bestStreak: 0,
    };
    p.recallAttempts += 1;
    if (success && mistakes === 0) p.successfulRecalls += 1;
    p.lastReviewedAt = now;
    await db.openingProgress.put(p);
  });
}

// ---------- Key/value (resume state, plans, etc.) ----------

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const r = await getDb().kv.get(key);
  return r?.value as T | undefined;
}

export async function kvSet(key: string, value: unknown) {
  await getDb().kv.put({ key, value, updatedAt: Date.now() });
}

export async function kvDelete(key: string) {
  await getDb().kv.delete(key);
}

// ---------- Export / import / reset ----------

export interface BackupFile {
  app: "ChessPath";
  schemaVersion: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export async function exportAll(): Promise<BackupFile> {
  const db = getDb();
  const tables: Record<string, unknown[]> = {};
  for (const t of ALL_TABLES) tables[t] = await db.table(t).toArray();
  return { app: "ChessPath", schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), tables };
}

export async function importAll(data: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!data || typeof data !== "object") return { ok: false, error: "This file is not a ChessPath backup." };
  const b = data as Partial<BackupFile>;
  if (b.app !== "ChessPath" || typeof b.tables !== "object" || !b.tables) return { ok: false, error: "This file is not a ChessPath backup." };
  if ((b.schemaVersion ?? 0) > SCHEMA_VERSION) return { ok: false, error: "This backup was created by a newer version of ChessPath." };
  const db = getDb();
  try {
    await db.transaction("rw", ALL_TABLES.map((t) => db.table(t)), async () => {
      for (const t of ALL_TABLES) {
        const rows = b.tables![t];
        await db.table(t).clear();
        if (Array.isArray(rows) && rows.length) await db.table(t).bulkPut(rows);
      }
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Import failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function resetAllData() {
  const db = getDb();
  await db.transaction("rw", ALL_TABLES.map((t) => db.table(t)), async () => {
    for (const t of ALL_TABLES) await db.table(t).clear();
  });
}
