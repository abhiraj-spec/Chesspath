"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, BookOpen, CheckCircle2, Circle, Clock, EyeOff, Flame, Lightbulb, LibraryBig, Microscope, Puzzle, Repeat, RotateCcw, Sparkles, Swords, Target } from "lucide-react";
import { useAnalyses, useAttempts, useGames, useKv, useLessonProgress, useProfile, useReviews, useSessions } from "@/hooks/data";
import { buildDailyPlan, buildRecommendations, nextRecommendedLesson, type PlanBlock } from "@/lib/learning/plan";
import { computeSkillStats, findWeaknesses } from "@/lib/learning/mastery";
import { recentPuzzleAccuracy } from "@/lib/learning/puzzleSelect";
import { isDue } from "@/lib/learning/srs";
import { kvSet } from "@/lib/db/repo";
import { ALL_LESSONS, moduleOf } from "@/content/lessons";
import { Card, CardHeader, PageSkeleton, ProgressBar, ProgressRing } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/Button";
import { LogoMark } from "@/components/layout/Logo";
import { cn, dateKey, formatDuration, formatRelative, pct } from "@/lib/util";
import { computeStreak } from "@/lib/learning/stats";
import { useNow } from "@/hooks/useNow";

const GOAL_LABEL: Record<string, string> = {
  "from-scratch": "Learn chess from scratch",
  tactics: "Improve tactical calculation",
  "rapid-classical": "Play better rapid and classical games",
  openings: "Improve opening knowledge",
  positional: "Develop positional understanding",
  endgames: "Improve endgame technique",
  tournaments: "Prepare for tournaments",
  overall: "Improve overall performance",
};

const BLOCK_ICON = { lesson: BookOpen, puzzles: Puzzle, review: Repeat, opening: LibraryBig, play: Swords, drill: Target } as const;

function greeting(name?: string) {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name}` : part;
}

export function Dashboard() {
  const profile = useProfile();
  const progress = useLessonProgress();
  const attempts = useAttempts();
  const reviews = useReviews();
  const sessions = useSessions();
  const analyses = useAnalyses();
  const games = useGames();
  const now = useNow(60_000);
  const today = dateKey(now);
  const hidden = useKv<string[]>(`plan-hidden:${today}`);

  const loading = [profile, progress, attempts, reviews, sessions, analyses, games, hidden].some((x) => x === undefined);

  const derived = useMemo(() => {
    if (loading || !profile) return null;
    const stats = computeSkillStats(attempts!);
    const colorOf = (id: string) => games!.find((g) => g.id === id)?.computer?.userColor ?? null;
    const weaknesses = findWeaknesses(stats, analyses!, colorOf);
    const openingDue = reviews!.filter((c) => c.kind === "opening" && isDue(c, now)).length;
    const plan = buildDailyPlan({ profile, progress: progress!, attempts: attempts!, reviews: reviews!, sessions: sessions!, weaknesses, openingDue, now });
    const recs = buildRecommendations({ weaknesses, progress: progress!, reviews: reviews!, now });
    return { stats, weaknesses, plan, recs };
  }, [loading, profile, progress, attempts, reviews, sessions, analyses, games, now]);

  if (loading) return <PageSkeleton />;

  // ---------- First-time visitor ----------
  if (!profile || !profile.onboardingCompleted) {
    return (
      <div className="mx-auto max-w-3xl pt-2 sm:pt-8">
        <div className="mb-5">
          <LogoMark size={44} />
        </div>
        <h1 className="t-page">Learn chess, one clear step at a time</h1>
        <p className="t-body mt-3 max-w-2xl text-muted">
          Interactive lessons from the very first move, tactics puzzles from real games, a Stockfish opponent and honest game analysis. Free, private and saved on this device. No account needed.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <ButtonLink href="/learn/board-coordinates/" size="lg" icon={<ArrowRight className="h-5 w-5" aria-hidden />}>
            Start your first lesson
          </ButtonLink>
          <ButtonLink href="/onboarding/" size="lg" variant="secondary" icon={<Sparkles className="h-4 w-4" aria-hidden />}>
            Personalise (1 min)
          </ButtonLink>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { icon: BookOpen, title: `${ALL_LESSONS.length} interactive lessons`, text: "From how the pieces move to rook endgames." },
            { icon: Puzzle, title: "Adaptive puzzles", text: "Verified positions that adapt to your results." },
            { icon: Microscope, title: "Game review", text: "Stockfish analysis explained in plain language." },
          ].map((f) => (
            <Card key={f.title} className="p-4">
              <f.icon className="h-5 w-5 text-accent" aria-hidden />
              <p className="t-card mt-2">{f.title}</p>
              <p className="t-small mt-0.5 text-muted">{f.text}</p>
            </Card>
          ))}
        </div>
        <p className="t-small mt-6 text-subtle">Already know the rules? Personalise your training and we&apos;ll skip ahead.</p>
      </div>
    );
  }

  const { plan, recs, weaknesses } = derived!;
  const next = nextRecommendedLesson(progress!, profile);
  const nextProgress = next ? progress!.get(next.id) : undefined;
  const hiddenSet = new Set(hidden ?? []);
  const visibleBlocks = plan.blocks.filter((b) => !hiddenSet.has(b.id));
  const firstOpen = visibleBlocks.find((b) => !b.done);
  const inProgressGame = games!.find((g) => g.status === "in-progress" && g.source === "computer");
  const unfinishedAnalysis = games!.find((g) => g.analysisStatus === "partial");
  const completedLessons = [...progress!.values()].filter((p) => p.status === "completed").length;
  const acc = recentPuzzleAccuracy(attempts!);
  const weekStart = now - 7 * 24 * 3600 * 1000;
  const weekMs = sessions!.filter((s) => new Date(s.sessionDate).getTime() >= weekStart - 24 * 3600 * 1000).reduce((s, x) => s + x.duration, 0);
  const due = reviews!.filter((c) => isDue(c, now)).length;
  const streak = computeStreak(sessions!, now);
  const isNewUser = attempts!.length === 0 && completedLessons === 0;

  // Primary action: the most relevant thing to do now.
  let primary: { label: string; href: string; detail: string; cta?: string };
  if (inProgressGame) primary = { label: "Resume your game", cta: "Resume", href: "/play/", detail: `Game against the computer started ${formatRelative(inProgressGame.createdAt)}.` };
  else if (nextProgress?.status === "in-progress" && next) primary = { label: `Continue: ${next.title}`, cta: "Continue", href: `/learn/${next.id}/`, detail: `You stopped at step ${nextProgress.currentStep + 1} of ${next.steps.length}.` };
  else if (isNewUser && next) primary = { label: `Start your first lesson: ${next.title}`, href: `/learn/${next.id}/`, detail: next.objective };
  else if (firstOpen) primary = { label: plan.minutesToday > 0 ? "Resume today's training" : "Start today's training", cta: plan.minutesToday > 0 ? "Resume" : "Start", href: firstOpen.href, detail: `${firstOpen.title} · about ${firstOpen.minutes} min` };
  else if (next) primary = { label: `Continue learning: ${next.title}`, href: `/learn/${next.id}/`, detail: next.objective };
  else primary = { label: "Solve puzzles", href: "/puzzles/", detail: "You've completed the curriculum. Keep your skills sharp." };

  const hideBlock = (id: string) => void kvSet(`plan-hidden:${today}`, [...hiddenSet, id]);
  const restoreBlocks = () => void kvSet(`plan-hidden:${today}`, []);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <p className="t-small text-muted">{GOAL_LABEL[profile.learningGoals[0]] ?? "Your training"}</p>
        <h1 className="t-page">{greeting(profile.displayName || undefined)}</h1>
      </header>

      {/* Primary action */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="t-label text-accent">Up next</p>
            <p className="t-section mt-1">{primary.label}</p>
            <p className="t-small mt-1 text-muted">{primary.detail}</p>
          </div>
          <ButtonLink href={primary.href} size="lg" className="shrink-0" icon={<ArrowRight className="h-5 w-5" aria-hidden />}>
            {primary.cta ?? "Start"}
          </ButtonLink>
        </div>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Today's plan */}
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="t-card">Today&apos;s training plan</h2>
              <p className="t-small mt-0.5 text-muted">
                About {profile.dailyTargetMinutes} minutes · estimates, not deadlines.{" "}
                <Link href="/settings/" className="underline hover:text-fg">
                  Change target
                </Link>
              </p>
            </div>
            <ProgressRing value={pct(plan.minutesToday, plan.targetMinutes)} label={`${plan.minutesToday} of ${plan.targetMinutes} minutes trained today`} />
          </div>
          <ul className="mt-4 space-y-2">
            {visibleBlocks.map((b) => (
              <PlanRow key={b.id} block={b} onHide={() => hideBlock(b.id)} />
            ))}
          </ul>
          {hiddenSet.size > 0 && (
            <button type="button" onClick={restoreBlocks} className="t-small mt-3 inline-flex items-center gap-1 text-muted hover:text-fg">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restore {hiddenSet.size} skipped activit{hiddenSet.size === 1 ? "y" : "ies"}
            </button>
          )}
          <p className="t-small mt-3 text-subtle">
            {plan.minutesToday > 0 ? `${formatDuration(plan.minutesToday * 60000)} trained today.` : "Nothing logged yet today."} Time counts only while you are active.
          </p>
        </Card>

        {/* Right column: continue + resume */}
        <div className="space-y-6">
          {next && (
            <Card className="p-5">
              <CardHeader title="Continue the curriculum" description={`Module ${moduleOf(next.module).letter} · ${moduleOf(next.module).title}`} />
              <p className="t-body mt-3 font-medium text-fg">{next.title}</p>
              <p className="t-small mt-0.5 text-muted">{next.summary}</p>
              <ProgressBar className="mt-3" value={completedLessons} max={ALL_LESSONS.length} label="Curriculum progress" />
              <p className="t-small mt-1.5 text-muted tabular">
                {completedLessons} of {ALL_LESSONS.length} lessons completed
              </p>
              <ButtonLink href={`/learn/${next.id}/`} variant="secondary" size="sm" className="mt-3">
                {nextProgress?.status === "in-progress" ? `Resume at step ${nextProgress.currentStep + 1}` : "Open lesson"}
              </ButtonLink>
            </Card>
          )}
          {unfinishedAnalysis && (
            <Card className="p-5">
              <CardHeader title="Unfinished analysis" description={`${unfinishedAnalysis.whitePlayer} vs ${unfinishedAnalysis.blackPlayer}`} />
              <ButtonLink href={`/analysis/?game=${unfinishedAnalysis.id}`} variant="secondary" size="sm" className="mt-3" icon={<Microscope className="h-4 w-4" aria-hidden />}>
                Continue analysis
              </ButtonLink>
            </Card>
          )}
        </div>
      </div>

      {/* Recent progress */}
      <section aria-labelledby="recent-title">
        <div className="mb-3 flex items-end justify-between">
          <h2 id="recent-title" className="t-card">
            Recent progress
          </h2>
          <Link href="/progress/" className="t-small font-medium text-accent hover:underline">
            Full progress
          </Link>
        </div>
        {isNewUser ? (
          <Card className="p-5">
            <p className="t-body text-muted">Your statistics will appear here after your first lesson or puzzle. Nothing is shown until there is real activity to report.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Lessons completed" value={`${completedLessons}`} sub={`of ${ALL_LESSONS.length}`} />
            <Stat label="Puzzle accuracy" value={acc.count >= 5 ? `${Math.round(acc.accuracy * 100)}%` : "–"} sub={acc.count >= 5 ? `last ${acc.count} puzzles` : `${acc.count} attempted; shown after 5`} />
            <Stat label="Training this week" value={formatDuration(weekMs)} sub={streak > 1 ? `${streak}-day streak` : "active time"} icon={streak > 1 ? <Flame className="h-4 w-4 text-warning" aria-hidden /> : undefined} />
            <Stat label="Review queue" value={`${due}`} sub={due === 1 ? "exercise due" : "exercises due"} href={due ? "/puzzles/?mode=review" : undefined} />
          </div>
        )}
      </section>

      {/* Recommendations */}
      <section aria-labelledby="recs-title">
        <h2 id="recs-title" className="t-card mb-3">
          Recommended for you
        </h2>
        {recs.length === 0 ? (
          <Card className="p-5">
            <p className="t-body text-muted">
              {attempts!.length < 5
                ? "Personal recommendations appear once you have completed a few exercises: ChessPath only recommends things it has evidence for."
                : "No weak spots stand out right now. Keep following your daily plan."}
            </p>
          </Card>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {recs.map((r) => (
              <li key={r.id}>
                <Link href={r.href} className="flex h-full flex-col rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-card)] hover:border-accent/50">
                  <span className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-accent" aria-hidden />
                    <span className="t-card">{r.title}</span>
                  </span>
                  <span className="t-small mt-1.5 text-muted">
                    <span className="font-medium text-fg">Why: </span>
                    {r.reason}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {weaknesses.some((w) => w.improving) && (
          <p className="t-small mt-3 text-success">
            Improving: {weaknesses.filter((w) => w.improving).map((w) => w.name).join(", ")}
          </p>
        )}
      </section>
    </div>
  );
}

function PlanRow({ block, onHide }: { block: PlanBlock; onHide: () => void }) {
  const Icon = BLOCK_ICON[block.kind];
  return (
    <li className={cn("flex items-center gap-3 rounded-[var(--radius-md)] border px-3 py-3", block.done ? "border-success/30 bg-success-soft/40" : "border-border bg-surface")}>
      {block.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-label="Done" /> : <Circle className="h-5 w-5 shrink-0 text-subtle" aria-label="Not done yet" />}
      <Icon className="hidden h-5 w-5 shrink-0 text-muted sm:block" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={cn("t-body font-medium", block.done ? "text-muted" : "text-fg")}>{block.title}</p>
        <p className="t-small text-muted">
          <Clock className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />≈ {block.minutes} min{block.progressText ? ` · ${block.progressText}` : ""} · {block.reason}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!block.done && (
          <ButtonLink href={block.href} size="sm" variant={block.done ? "ghost" : "secondary"}>
            Start
          </ButtonLink>
        )}
        {!block.done && (
          <button type="button" onClick={onHide} className="grid grid-cols-1 h-8 w-8 place-items-center rounded-[var(--radius-sm)] text-subtle hover:bg-surface-2 hover:text-fg" aria-label={`Skip “${block.title}” for today`} title="Skip for today">
            <EyeOff className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </li>
  );
}

function Stat({ label, value, sub, href, icon }: { label: string; value: string; sub: string; href?: string; icon?: React.ReactNode }) {
  const body = (
    <>
      <p className="t-small text-muted">{label}</p>
      <p className="t-stat mt-1 flex items-center gap-1.5 text-fg">
        {value}
        {icon}
      </p>
      <p className="t-small mt-0.5 text-subtle">{sub}</p>
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-card)] hover:border-accent/50">
      {body}
    </Link>
  ) : (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-card)]">{body}</div>
  );
}

