"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BarChart3, TrendingUp, Info } from "lucide-react";
import { useAnalyses, useAttempts, useGames, useKv, useLessonProgress, useOpeningProgress, useProfile, useReviews, useSessions } from "@/hooks/data";
import { Badge, Card, CardHeader, EmptyState, PageHeader, PageSkeleton, ProgressBar, Segmented, type Tone } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/Button";
import { ALL_LESSONS, MODULES } from "@/content/lessons";
import { computeSkillStats, findWeaknesses, MASTERY_LABEL, type MasteryLevel } from "@/lib/learning/mastery";
import { computeStreak, dailyMinutes, gameResults, weeklyPuzzleAccuracy, STREAK_MIN_MS } from "@/lib/learning/stats";
import { describeDue, isDue } from "@/lib/learning/srs";
import { skillInfo } from "@/content/skills";
import { getPuzzle } from "@/content/puzzles";
import { OPENINGS } from "@/content/openings/library";
import { DRILLS } from "@/content/drills";
import { BarChart } from "./BarChart";
import { kvSet } from "@/lib/db/repo";
import { formatDuration } from "@/lib/util";
import { getLesson } from "@/content/lessons";
import { useNow } from "@/hooks/useNow";

const LEVEL_TONE: Record<MasteryLevel, Tone> = { new: "neutral", learning: "warning", practising: "info", proficient: "accent", mastered: "success" };

export function ProgressView() {
  const profile = useProfile();
  const progress = useLessonProgress();
  const attempts = useAttempts();
  const reviews = useReviews();
  const sessions = useSessions();
  const games = useGames();
  const analyses = useAnalyses();
  const openings = useOpeningProgress();
  const weeklyGoal = useKv<number>("goal:weeklyDays");
  const now = useNow(60_000);

  const loading = [profile, progress, attempts, reviews, sessions, games, analyses, openings, weeklyGoal].some((x) => x === undefined);
  const stats = useMemo(() => (attempts ? computeSkillStats(attempts) : new Map()), [attempts]);
  if (loading) return <PageSkeleton />;

  const totalMs = sessions!.reduce((s, x) => s + x.duration, 0);
  const hasActivity = attempts!.length > 0 || [...progress!.values()].length > 0 || totalMs > 0 || games!.length > 0;
  if (!hasActivity) {
    return (
      <div>
        <PageHeader eyebrow="Progress" title="Your progress" />
        <EmptyState
          icon={<BarChart3 className="h-8 w-8" aria-hidden />}
          title="No activity yet"
          description="Complete a lesson or solve a few puzzles and your real statistics will appear here. ChessPath never shows sample data."
          action={<ButtonLink href="/learn/">Start learning</ButtonLink>}
        />
      </div>
    );
  }

  const completed = [...progress!.values()].filter((p) => p.status === "completed");
  const puzzleAttempts = attempts!.filter((a) => a.kind === "puzzle" && !a.skipped);
  const solved = puzzleAttempts.filter((a) => a.solved && !a.revealed).length;
  const streak = computeStreak(sessions!, now);
  const days = dailyMinutes(sessions!, 14, now);
  const weekly = weeklyPuzzleAccuracy(attempts!, 8, now);
  const colorOf = (id: string) => games!.find((g) => g.id === id)?.computer?.userColor ?? games!.find((g) => g.id === id)?.userColor ?? null;
  const weaknesses = findWeaknesses(stats, analyses!, colorOf);
  const results = gameResults(games!);
  const due = reviews!.filter((c) => isDue(c, now));
  const upcoming = reviews!.filter((c) => !isDue(c, now)).sort((a, b) => a.dueAt - b.dueAt).slice(0, 5);
  const goalDays = weeklyGoal ?? 4;
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const activeDaysThisWeek = sessions!.filter((s) => s.duration >= STREAK_MIN_MS && new Date(s.sessionDate + "T12:00:00").getTime() >= weekStart.getTime()).length;
  const skillRows = [...stats.values()].sort((a, b) => b.attempts - a.attempts);
  const themeRows = [...stats.values()].filter((s) => skillInfo(s.skill).puzzleTheme && puzzleAttempts.some((a) => a.skills.includes(s.skill)));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Progress" title="Your progress" description="Everything here is calculated from your own activity on this device." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Lessons completed" value={`${completed.length}/${ALL_LESSONS.length}`} />
        <Tile label="Puzzles solved" value={`${solved}`} sub={puzzleAttempts.length ? `${Math.round((solved / puzzleAttempts.length) * 100)}% of ${puzzleAttempts.length} attempted` : "none attempted"} />
        <Tile label="Training time" value={formatDuration(totalMs)} sub="active time, all days" />
        <Tile label="Streak" value={`${streak} day${streak === 1 ? "" : "s"}`} sub="days with 5+ active minutes" />
        <Tile label="Review queue" value={`${due.length}`} sub={due.length ? "due now" : "nothing due"} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <CardHeader title="Training time, last 14 days" description="Minutes of active practice per day" />
          <div className="mt-4">
            {days.every((d) => d.minutes === 0) ? (
              <p className="t-small text-muted">No timed practice yet.</p>
            ) : (
              <BarChart
                title="Training minutes per day"
                unit="Minutes"
                bars={days.map((d) => ({ key: d.date, label: new Date(d.date + "T12:00:00").toLocaleDateString(undefined, { day: "numeric" }), value: d.minutes, detail: `${new Date(d.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}: ${d.minutes} min` }))}
              />
            )}
          </div>
        </Card>
        <Card className="p-5">
          <CardHeader title="Weekly goal" description="Days this week with at least 5 minutes of practice" />
          <div className="mt-4 flex items-end justify-between">
            <p className="t-stat">
              {activeDaysThisWeek} / {goalDays} days
            </p>
            <Segmented
              size="sm"
              label="Weekly goal (days)"
              value={goalDays}
              onChange={(v) => void kvSet("goal:weeklyDays", v)}
              options={[3, 4, 5, 6, 7].map((d) => ({ value: d, label: String(d) }))}
            />
          </div>
          <ProgressBar className="mt-3" value={Math.min(activeDaysThisWeek, goalDays)} max={goalDays} label="Weekly goal progress" tone={activeDaysThisWeek >= goalDays ? "success" : "accent"} />
          <p className="t-small mt-3 text-muted">
            {activeDaysThisWeek >= goalDays ? "Goal reached this week. Nice consistency." : `Daily target: ${profile?.dailyTargetMinutes ?? 15} minutes. Consistency beats long sessions.`}{" "}
            <Link href="/settings/" className="underline">
              Change daily target
            </Link>
          </p>
        </Card>
      </div>

      <Card className="p-5">
        <CardHeader title="Puzzle accuracy over time" description="Share of attempted puzzles solved, per week (skipped puzzles excluded)" />
        <div className="mt-4">
          {weekly.length < 2 ? (
            <p className="t-small text-muted">A trend appears after puzzles on at least two different weeks. {weekly[0] ? `This week: ${Math.round(weekly[0].accuracy * 100)}% of ${weekly[0].count}.` : ""}</p>
          ) : (
            <BarChart title="Puzzle accuracy per week" unit="Accuracy %" max={100} yTicks={[0, 50, 100]} bars={weekly.map((w) => ({ key: w.label, label: w.label, value: Math.round(w.accuracy * 100), detail: `Week of ${w.label}: ${Math.round(w.accuracy * 100)}% of ${w.count}` }))} />
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <CardHeader title="Weak spots" description="Detected from repeated exercise results and analysed games" />
          {weaknesses.length === 0 ? (
            <p className="t-small mt-3 text-muted">{attempts!.length < 10 ? "Not enough data yet: weak spots need at least 3 recent exercises on a skill, or the same mistake in 2 analysed games." : "No weak spots stand out right now."}</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {weaknesses.slice(0, 5).map((w) => {
                const info = skillInfo(w.skill);
                return (
                  <li key={w.skill} className="rounded-[var(--radius-md)] border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="t-card">{w.name}</p>
                      {w.improving ? (
                        <Badge tone="success" icon={<TrendingUp className="h-3 w-3" aria-hidden />}>
                          Improving
                        </Badge>
                      ) : (
                        <Badge tone="warning">Needs work</Badge>
                      )}
                    </div>
                    <p className="t-small mt-1 text-muted">{w.evidence}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {info.puzzleTheme && (
                        <ButtonLink href={`/puzzles/?theme=${info.puzzleTheme}`} size="sm" variant="secondary">
                          Practise
                        </ButtonLink>
                      )}
                      {info.lesson && (
                        <ButtonLink href={`/learn/${info.lesson}/`} size="sm" variant="ghost">
                          Lesson: {getLesson(info.lesson)?.title}
                        </ButtonLink>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="t-small mt-3 text-subtle">A weak spot is only cleared when your recent score recovers, not after one success.</p>
        </Card>

        <Card className="p-5">
          <CardHeader title="Curriculum by module" />
          <ul className="mt-3 space-y-3">
            {MODULES.map((m) => {
              const ls = ALL_LESSONS.filter((l) => l.module === m.id);
              const d = ls.filter((l) => progress!.get(l.id)?.status === "completed").length;
              return (
                <li key={m.id}>
                  <div className="t-small mb-1 flex justify-between">
                    <span className="text-fg">
                      {m.letter}. {m.title}
                    </span>
                    <span className="text-muted tabular">
                      {d}/{ls.length}
                    </span>
                  </div>
                  <ProgressBar value={d} max={ls.length} label={`${m.title} completion`} tone={d === ls.length ? "success" : "accent"} />
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card className="p-5">
        <CardHeader title="Skills and mastery" description="Mastery needs repeated success over time, not a single completed lesson" />
        {skillRows.length === 0 ? (
          <p className="t-small mt-3 text-muted">Scored lesson checks and puzzles will build your skill profile.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="t-small w-full min-w-[36rem] text-left">
              <thead className="text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Skill</th>
                  <th className="py-2 pr-3 font-medium">Level</th>
                  <th className="py-2 pr-3 text-right font-medium">Exercises</th>
                  <th className="py-2 pr-3 text-right font-medium">Recent score</th>
                  <th className="py-2 font-medium">Why this level</th>
                </tr>
              </thead>
              <tbody>
                {skillRows.map((s) => (
                  <tr key={s.skill} className="border-t border-border align-top">
                    <td className="py-2 pr-3 font-medium text-fg">{skillInfo(s.skill).name}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={LEVEL_TONE[s.level as MasteryLevel]}>{MASTERY_LABEL[s.level as MasteryLevel]}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-right tabular">{s.attempts}</td>
                    <td className="py-2 pr-3 text-right tabular">{Math.round(s.recentScore * 100)}%</td>
                    <td className="py-2 text-muted">{s.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <details className="mt-3">
          <summary className="t-small cursor-pointer text-muted">How mastery is calculated</summary>
          <ul className="t-small mt-2 list-disc space-y-1 pl-5 text-muted">
            <li>Each exercise earns 1 point when solved first time without hints, 0.5 when solved after a mistake or hint, 0 when failed, revealed or skipped.</li>
            <li>Recent score = average over the last 10 exercises for that skill.</li>
            <li>Practising: 3+ exercises and 60%+. Proficient: 6+ exercises, 80%+, on 2+ days. Mastered: 10+ exercises, 85%+, and a clean solve at least 3 days after you first practised the skill.</li>
          </ul>
        </details>
      </Card>

      {themeRows.length > 0 && (
        <Card className="p-5">
          <CardHeader title="Puzzle performance by theme" description="Recent score per tactical theme" />
          <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {themeRows.map((s) => (
              <li key={s.skill}>
                <div className="t-small mb-1 flex justify-between">
                  <span>{skillInfo(s.skill).name}</span>
                  <span className="text-muted tabular">
                    {Math.round(s.recentScore * 100)}% · {s.attempts}
                  </span>
                </div>
                <ProgressBar value={s.recentScore * 100} label={`${skillInfo(s.skill).name} recent score`} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <CardHeader title="Games vs computer" />
          {results.total === 0 ? (
            <p className="t-small mt-3 text-muted">No finished games yet.</p>
          ) : (
            <p className="t-body mt-3">
              <span className="font-semibold text-success">{results.wins} won</span> · <span className="font-semibold">{results.draws} drawn</span> · <span className="font-semibold text-danger">{results.losses} lost</span>
            </p>
          )}
          <ul className="mt-3 space-y-1">
            {games!.slice(0, 4).map((g) => (
              <li key={g.id} className="t-small flex justify-between gap-2">
                <Link href={`/analysis/?game=${g.id}`} className="truncate underline-offset-2 hover:underline">
                  {g.whitePlayer} vs {g.blackPlayer}
                </Link>
                <span className="shrink-0 text-muted">{g.result === "*" ? "unfinished" : g.result}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <CardHeader title="Opening recall" />
          {openings!.size === 0 ? (
            <p className="t-small mt-3 text-muted">No opening lines practised from memory yet.</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {[...openings!.values()].map((p) => {
                const o = OPENINGS.find((x) => x.id === p.openingId);
                const v = o?.variations.find((x) => x.id === p.variationId);
                return (
                  <li key={p.id} className="t-small flex justify-between gap-2">
                    <span className="truncate">
                      {o?.name}: {v?.name}
                    </span>
                    <span className="shrink-0 text-muted tabular">
                      {p.successfulRecalls}/{p.recallAttempts} flawless
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <CardHeader title="Endgame drills" />
          {(() => {
            const drills = attempts!.filter((a) => a.kind === "drill");
            if (!drills.length) return <p className="t-small mt-3 text-muted">No drills played yet.</p>;
            return (
              <ul className="mt-3 space-y-1">
                {DRILLS.filter((d) => drills.some((a) => a.refId === d.id)).map((d) => {
                  const list = drills.filter((a) => a.refId === d.id);
                  return (
                    <li key={d.id} className="t-small flex justify-between gap-2">
                      <span className="truncate">{d.title}</span>
                      <span className="shrink-0 text-muted tabular">
                        {list.filter((a) => a.solved).length}/{list.length} achieved
                      </span>
                    </li>
                  );
                })}
              </ul>
            );
          })()}
        </Card>
      </div>

      <Card className="p-5">
        <CardHeader title="Review queue" description="Spaced repetition: exercises you found hard return at growing intervals" action={due.length ? <ButtonLink href="/puzzles/?mode=review" size="sm">Review {due.length} now</ButtonLink> : undefined} />
        {reviews!.length === 0 ? (
          <p className="t-small mt-3 text-muted">Empty. Missed puzzles, hinted lesson checks and practised opening lines will appear here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {[...due.slice(0, 5), ...upcoming].map((c) => (
              <li key={c.id} className="t-small flex flex-wrap justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="font-medium text-fg">{reviewTitle(c.kind, c.refId)}</span>
                  <span className="block text-muted">{c.reason}</span>
                </span>
                <span className="shrink-0 text-muted">{describeDue(c, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="t-small flex items-center gap-1.5 text-subtle">
        <Info className="h-3.5 w-3.5" aria-hidden />
        ChessPath does not estimate an official rating or playing strength; every figure here comes from your own activity.
      </p>
    </div>
  );
}

function reviewTitle(kind: string, refId: string): string {
  if (kind === "puzzle") {
    const p = getPuzzle(refId);
    return p ? `Puzzle: ${p.themeName} (level ${p.difficulty})` : "Puzzle";
  }
  if (kind === "lesson") {
    const [l] = refId.split("#");
    return `Lesson exercise: ${getLesson(l)?.title ?? l}`;
  }
  const [o, v] = refId.split(":");
  const op = OPENINGS.find((x) => x.id === o);
  return `Opening: ${op?.name ?? o} (${op?.variations.find((x) => x.id === v)?.name ?? v})`;
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <p className="t-small text-muted">{label}</p>
      <p className="t-stat mt-1">{value}</p>
      {sub && <p className="t-small mt-0.5 text-subtle">{sub}</p>}
    </div>
  );
}
