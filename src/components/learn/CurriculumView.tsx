"use client";

import Link from "next/link";
import { CheckCircle2, Circle, CircleDot, Clock, ArrowRight } from "lucide-react";
import { ALL_LESSONS, MODULES } from "@/content/lessons";
import { useLessonProgress, useProfile } from "@/hooks/data";
import { Badge, Card, PageHeader, ProgressBar, Skeleton, DifficultyBadge } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/Button";
import type { LessonProgress } from "@/lib/db/types";
import { nextRecommendedLesson } from "@/lib/learning/plan";
import { DrillsSection } from "./DrillsSection";
import { cn } from "@/lib/util";

export function CurriculumView() {
  const progress = useLessonProgress();
  const profile = useProfile();
  const loading = progress === undefined;
  const completed = progress ? [...progress.values()].filter((p) => p.status === "completed").length : 0;
  const next = progress ? nextRecommendedLesson(progress, profile ?? undefined) : undefined;

  return (
    <div>
      <PageHeader
        eyebrow="Curriculum"
        title="Learn chess step by step"
        description="Seven modules take you from the rules to endgame technique. Every lesson has interactive exercises, hints and a short scored check."
        actions={
          next && (
            <ButtonLink href={`/learn/${next.id}/`} icon={<ArrowRight className="h-4 w-4" aria-hidden />}>
              {progress?.get(next.id)?.status === "in-progress" ? "Resume" : "Continue"}: {next.title}
            </ButtonLink>
          )
        }
      />
      <Card className="mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="t-small text-muted">Overall progress</p>
          {loading ? <Skeleton className="mt-2 h-2 w-full" /> : <ProgressBar value={completed} max={ALL_LESSONS.length} label="Lessons completed" className="mt-2" />}
        </div>
        <p className="t-card tabular sm:ml-6">
          {loading ? "–" : completed} / {ALL_LESSONS.length} lessons
        </p>
      </Card>

      <div className="space-y-8">
        {MODULES.map((m) => {
          const lessons = ALL_LESSONS.filter((l) => l.module === m.id);
          const done = lessons.filter((l) => progress?.get(l.id)?.status === "completed").length;
          return (
            <section key={m.id} aria-labelledby={`mod-${m.id}`}>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="t-label text-accent">Module {m.letter}</p>
                  <h2 id={`mod-${m.id}`} className="t-section">
                    {m.title}
                  </h2>
                  <p className="t-small mt-0.5 max-w-2xl text-muted">
                    {m.description} <span className="text-subtle">{m.audience}</span>
                  </p>
                </div>
                <span className="t-small text-muted tabular">
                  {done}/{lessons.length} complete
                </span>
              </div>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {lessons.map((l) => (
                  <li key={l.id}>
                    <LessonCard id={l.id} title={l.title} summary={l.summary} minutes={l.estimatedMinutes} difficulty={l.difficulty} progress={progress?.get(l.id)} loading={loading} recommended={next?.id === l.id} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        <DrillsSection />
      </div>
    </div>
  );
}

function LessonCard({
  id,
  title,
  summary,
  minutes,
  difficulty,
  progress,
  loading,
  recommended,
}: {
  id: string;
  title: string;
  summary: string;
  minutes: number;
  difficulty: number;
  progress?: LessonProgress;
  loading: boolean;
  recommended: boolean;
}) {
  const status = progress?.status ?? "not-started";
  const Icon = status === "completed" ? CheckCircle2 : status === "in-progress" ? CircleDot : Circle;
  return (
    <Link
      href={`/learn/${id}/`}
      className={cn(
        "group flex h-full flex-col rounded-[var(--radius-lg)] border bg-surface p-4 shadow-[var(--shadow-card)] transition-colors hover:border-accent/50",
        recommended ? "border-accent/50 ring-1 ring-accent/30" : "border-border",
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", status === "completed" ? "text-success" : status === "in-progress" ? "text-accent" : "text-subtle")} aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="t-card text-fg group-hover:text-accent">{title}</h3>
          <p className="t-small mt-0.5 text-muted">{summary}</p>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3">
        <DifficultyBadge level={difficulty} />
        <span className="t-small inline-flex items-center gap-1 text-muted">
          <Clock className="h-3.5 w-3.5" aria-hidden /> {minutes} min
        </span>
        {loading ? null : status === "completed" ? (
          <Badge tone="success">Completed{progress?.score !== undefined ? ` · ${progress.score}%` : ""}</Badge>
        ) : status === "in-progress" ? (
          <Badge tone="accent">In progress · step {progress!.currentStep + 1}</Badge>
        ) : recommended ? (
          <Badge tone="accent">Recommended next</Badge>
        ) : null}
      </div>
      <span className="sr-only">{status === "completed" ? "Completed" : status === "in-progress" ? "In progress" : "Not started"}</span>
    </Link>
  );
}
