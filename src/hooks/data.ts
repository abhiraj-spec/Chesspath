"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db/db";
import type { Attempt, ChessGameRecord, GameAnalysis, LessonProgress, OpeningProgress, ReviewCard, TrainingSession, UserProfile } from "@/lib/db/types";

/**
 * Live database queries. Each returns `undefined` while loading, so components can show
 * skeletons, and re-render automatically when the underlying data changes.
 */

export function useProfile(): UserProfile | null | undefined {
  return useLiveQuery(async () => (await getDb().profile.get("me")) ?? null, []);
}

export function useLessonProgress(): Map<string, LessonProgress> | undefined {
  return useLiveQuery(async () => new Map((await getDb().lessonProgress.toArray()).map((p) => [p.lessonId, p])), []);
}

export function useAttempts(): Attempt[] | undefined {
  return useLiveQuery(() => getDb().attempts.orderBy("createdAt").toArray(), []);
}

export function useReviews(): ReviewCard[] | undefined {
  return useLiveQuery(() => getDb().reviews.toArray(), []);
}

export function useGames(): ChessGameRecord[] | undefined {
  return useLiveQuery(() => getDb().games.orderBy("updatedAt").reverse().toArray(), []);
}

export function useGame(id: string | null): ChessGameRecord | null | undefined {
  return useLiveQuery(async () => (id ? ((await getDb().games.get(id)) ?? null) : null), [id]);
}

export function useAnalysis(gameId: string | null): GameAnalysis | null | undefined {
  return useLiveQuery(async () => (gameId ? ((await getDb().analyses.get(gameId)) ?? null) : null), [gameId]);
}

export function useAnalyses(): GameAnalysis[] | undefined {
  return useLiveQuery(() => getDb().analyses.toArray(), []);
}

export function useOpeningProgress(): Map<string, OpeningProgress> | undefined {
  return useLiveQuery(async () => new Map((await getDb().openingProgress.toArray()).map((p) => [p.id, p])), []);
}

export function useSessions(): TrainingSession[] | undefined {
  return useLiveQuery(() => getDb().sessions.toArray(), []);
}

export function useKv<T>(key: string): T | null | undefined {
  return useLiveQuery(async () => ((await getDb().kv.get(key))?.value as T | undefined) ?? null, [key]);
}
