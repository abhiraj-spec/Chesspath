import type { Attempt, ChessGameRecord, TrainingSession } from "@/lib/db/types";
import { dateKey } from "@/lib/util";

/** Minimum active minutes for a day to count towards the streak. */
export const STREAK_MIN_MS = 5 * 60 * 1000;

/**
 * Consecutive days (ending today, or yesterday if today has no practice yet) with at least
 * 5 minutes of active training. Rewards meaningful practice, not clicks.
 */
export function computeStreak(sessions: TrainingSession[], now = Date.now()): number {
  const active = new Set(sessions.filter((s) => s.duration >= STREAK_MIN_MS).map((s) => s.id));
  const day = 24 * 3600 * 1000;
  let cursor = now;
  if (!active.has(dateKey(cursor))) cursor -= day;
  let streak = 0;
  while (active.has(dateKey(cursor))) {
    streak++;
    cursor -= day;
  }
  return streak;
}

/** Last N calendar days with training minutes (oldest first). */
export function dailyMinutes(sessions: TrainingSession[], days = 14, now = Date.now()): { date: string; minutes: number }[] {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const out: { date: string; minutes: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = dateKey(now - i * 24 * 3600 * 1000);
    out.push({ date: k, minutes: Math.round((byId.get(k)?.duration ?? 0) / 60000) });
  }
  return out;
}

/** Puzzle accuracy per ISO week (oldest first), only weeks with attempts. */
export function weeklyPuzzleAccuracy(attempts: Attempt[], weeks = 8, now = Date.now()): { label: string; accuracy: number; count: number }[] {
  const out: { label: string; accuracy: number; count: number }[] = [];
  const week = 7 * 24 * 3600 * 1000;
  for (let i = weeks - 1; i >= 0; i--) {
    const end = now - i * week;
    const start = end - week;
    const list = attempts.filter((a) => a.kind === "puzzle" && !a.skipped && a.createdAt > start && a.createdAt <= end);
    if (!list.length) continue;
    const d = new Date(start + 24 * 3600 * 1000);
    out.push({ label: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }), accuracy: list.filter((a) => a.solved && !a.revealed).length / list.length, count: list.length });
  }
  return out;
}

export function gameResults(games: ChessGameRecord[]): { wins: number; draws: number; losses: number; total: number } {
  let wins = 0,
    draws = 0,
    losses = 0;
  for (const g of games) {
    if (g.source !== "computer" || g.status !== "finished" || !g.computer) continue;
    const me = g.computer.userColor;
    if (g.result === "1/2-1/2") draws++;
    else if ((g.result === "1-0" && me === "w") || (g.result === "0-1" && me === "b")) wins++;
    else if (g.result !== "*") losses++;
  }
  return { wins, draws, losses, total: wins + draws + losses };
}
