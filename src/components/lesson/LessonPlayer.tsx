"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, RotateCcw, Trophy, BookOpen, Puzzle, Swords, LibraryBig, Microscope, ChevronRight, Info } from "lucide-react";
import type { Lesson } from "@/content/types";
import { StepPlayer } from "./StepPlayer";
import { RichParagraphs } from "./RichText";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Badge, Callout, Card, DifficultyBadge, ProgressBar } from "@/components/ui/primitives";
import { completeLesson, kvDelete, kvGet, kvSet, recordAttempt, restartLesson, startOrResumeLesson, updateLessonStep } from "@/lib/db/repo";
import type { LessonProgress } from "@/lib/db/types";
import { isInteractive, scoreLesson, scoredSteps, type StepResult } from "@/lib/lessons/engine";
import { getLesson, moduleOf, nextLessonAfter } from "@/content/lessons";
import { useActivityTimer } from "@/hooks/useActivityTimer";
import { GLOSSARY } from "@/content/glossary";
import { cn } from "@/lib/util";

type Phase = "intro" | "steps" | "complete";

export function LessonPlayer({ lesson }: { lesson: Lesson }) {
  const [progress, setProgress] = useState<LessonProgress | null>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [stepIndex, setStepIndex] = useState(0);
  const [results, setResults] = useState<Record<string, StepResult>>({});
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const stepStart = useRef(0);
  const mod = moduleOf(lesson.module);
  const next = nextLessonAfter(lesson.id);

  useActivityTimer("lesson", lesson.id, phase !== "intro");

  useEffect(() => {
    let cancelled = false;
    import("@/lib/db/repo")
      .then((r) => r.getLessonProgress(lesson.id))
      .then((p) => {
        if (cancelled) return;
        setProgress(p ?? null);
        if (p && p.status === "in-progress" && p.currentStep > 0) setStepIndex(Math.min(p.currentStep, lesson.steps.length - 1));
      })
      .catch(() => !cancelled && setLoadError("Your saved progress could not be loaded. You can still take the lesson."));
    return () => {
      cancelled = true;
    };
  }, [lesson]);

  const runKey = `lessonRun:${lesson.id}`;
  const begin = async (fromStart: boolean) => {
    let restored: Record<string, StepResult> = {};
    try {
      const p = fromStart ? await restartLesson(lesson.id) : await startOrResumeLesson(lesson.id);
      setProgress(p);
      setStepIndex(fromStart ? 0 : Math.max(0, Math.min(p.currentStep, lesson.steps.length - 1)));
      if (fromStart) await kvDelete(runKey);
      else restored = (await kvGet<Record<string, StepResult>>(runKey)) ?? {};
    } catch {
      setStepIndex(0);
    }
    setResults(restored);
    stepStart.current = Date.now();
    setPhase("steps");
  };

  const step = lesson.steps[stepIndex];

  const onComplete = useCallback(
    (r: StepResult) => {
      setResults((prev) => {
        if (prev[r.stepId]) return prev;
        const next = { ...prev, [r.stepId]: r };
        void kvSet(`lessonRun:${lesson.id}`, next).catch(() => {});
        return next;
      });
      const s = lesson.steps.find((x) => x.id === r.stepId);
      if (s && s.assessment && isInteractive(s)) {
        void recordAttempt({
          kind: "lesson",
          refId: `${lesson.id}#${s.id}`,
          skills: lesson.skills,
          difficulty: lesson.difficulty,
          solved: r.solved,
          mistakes: r.mistakes,
          hintsUsed: r.hintsUsed,
          revealed: r.revealed,
          skipped: !r.solved,
          durationMs: Date.now() - stepStart.current,
          review: {
            kind: "lesson",
            reasonIfStruggled: r.revealed ? `You looked at the solution in “${lesson.title}”.` : `You needed ${r.hintsUsed ? `${r.hintsUsed} hint${r.hintsUsed > 1 ? "s" : ""}` : `${r.mistakes} attempt${r.mistakes > 1 ? "s" : ""}`} on an exercise in “${lesson.title}”.`,
          },
        }).catch(() => {});
      }
    },
    [lesson],
  );

  const goNext = async () => {
    const r = results[step.id];
    const elapsed = Date.now() - stepStart.current;
    const nextIndex = stepIndex + 1;
    if (nextIndex >= lesson.steps.length) {
      const all = { ...results };
      const score = scoreLesson(lesson, all);
      setFinalScore(score);
      try {
        await updateLessonStep(lesson.id, { currentStep: stepIndex, completedStep: stepIndex, hintsUsed: r?.hintsUsed ?? 0, mistakes: r?.mistakes ?? 0, timeSpentMs: elapsed });
        await completeLesson(lesson.id, score);
      } catch {
        /* progress save failed: the completion screen still shows */
      }
      setPhase("complete");
      window.scrollTo({ top: 0 });
      return;
    }
    setStepIndex(nextIndex);
    stepStart.current = Date.now();
    void updateLessonStep(lesson.id, { currentStep: nextIndex, completedStep: stepIndex, hintsUsed: r?.hintsUsed ?? 0, mistakes: r?.mistakes ?? 0, timeSpentMs: elapsed }).catch(() => {});
  };

  const goPrev = () => {
    if (stepIndex === 0) return;
    setStepIndex((i) => i - 1);
    stepStart.current = Date.now();
  };

  const terms = useMemo(() => (lesson.terms ?? []).map((t) => GLOSSARY.find((g) => g.term.toLowerCase() === t.toLowerCase())).filter(Boolean), [lesson]);

  // ---------- Intro ----------
  if (phase === "intro") {
    const resumable = progress?.status === "in-progress" && progress.currentStep > 0;
    const done = progress?.status === "completed";
    return (
      <div className="mx-auto max-w-3xl">
        <BackLink />
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge tone="accent">
            Module {mod.letter} · {mod.title}
          </Badge>
          <DifficultyBadge level={lesson.difficulty} label={["First steps", "Beginner", "Improver", "Intermediate", "Advanced"][lesson.difficulty - 1]} />
          <span className="t-small text-muted">≈ {lesson.estimatedMinutes} min</span>
          {done && <Badge tone="success">Completed{progress?.score !== undefined ? ` · best score ${progress.score}%` : ""}</Badge>}
        </div>
        <h1 className="t-page">{lesson.title}</h1>
        <Card className="mt-5 p-5 sm:p-6">
          <p className="t-label text-accent">You will learn to</p>
          <p className="t-body mt-1 font-medium text-fg">{lesson.objective}</p>
          <RichParagraphs paragraphs={lesson.intro} className="t-body prose-lesson mt-4 text-fg/90" />
          {terms.length > 0 && (
            <details className="mt-4 rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 py-3">
              <summary className="t-small cursor-pointer font-medium text-fg">New terms in this lesson ({terms.length})</summary>
              <dl className="mt-2 space-y-2">
                {terms.map((g) => (
                  <div key={g!.term}>
                    <dt className="t-small font-semibold text-fg">{g!.term}</dt>
                    <dd className="t-small text-muted">{g!.definition}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          <div className="mt-4 flex items-start gap-2 text-muted">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="t-small">
              {lesson.steps.length} steps, including {scoredSteps(lesson).length} scored check{scoredSteps(lesson).length === 1 ? "" : "s"}. The lesson is complete when you finish every step; your score counts checks solved first time without hints.
            </p>
          </div>
          {loadError && <Callout tone="warning" className="mt-4">{loadError}</Callout>}
          <div className="mt-6 flex flex-wrap gap-3">
            {resumable ? (
              <>
                <Button size="lg" onClick={() => begin(false)}>
                  Resume at step {progress!.currentStep + 1}
                </Button>
                <Button size="lg" variant="secondary" onClick={() => begin(true)} icon={<RotateCcw className="h-4 w-4" aria-hidden />}>
                  Start over
                </Button>
              </>
            ) : (
              <Button size="lg" onClick={() => begin(true)}>
                {done ? "Take the lesson again" : "Start lesson"}
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  // ---------- Completion ----------
  if (phase === "complete") {
    const score = finalScore ?? 0;
    return (
      <div className="mx-auto max-w-3xl">
        <BackLink />
        <Card className="animate-fade-in p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-success-soft">
              <Trophy className="h-6 w-6 text-success" aria-hidden />
            </div>
            <div>
              <p className="t-label text-success">Lesson complete</p>
              <h1 className="t-section mt-0.5">{lesson.title}</h1>
            </div>
          </div>
          <div className="mt-5 rounded-[var(--radius-md)] bg-surface-2 p-4">
            <div className="flex items-baseline justify-between">
              <span className="t-small text-muted">Assessment score</span>
              <span className="t-stat text-fg">{score}%</span>
            </div>
            <ProgressBar value={score} label="Assessment score" className="mt-2" tone={score >= 80 ? "success" : score >= 50 ? "accent" : "warning"} />
            <p className="t-small mt-2 text-muted">
              {score >= 80
                ? "Excellent: you solved the checks cleanly. Mastery comes from getting it right again later, so ChessPath will bring this skill back in your reviews."
                : score >= 50
                  ? "Good progress. Exercises you found hard have been added to your review queue."
                  : "You finished the lesson. The exercises you found difficult are now in your review queue, and a quick repeat of this lesson will help."}
            </p>
          </div>
          <h2 className="t-card mt-6">Recap</h2>
          <ul className="mt-2 space-y-1.5">
            {lesson.recap.map((r, i) => (
              <li key={i} className="t-body flex gap-2 text-fg/90">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                {r}
              </li>
            ))}
          </ul>
          <div className="mt-7 flex flex-wrap gap-3">
            <FollowUpButton lesson={lesson} />
            {next && lesson.followUp.ref !== next.id && (
              <ButtonLink href={`/learn/${next.id}/`} variant="secondary" size="lg" icon={<ChevronRight className="h-4 w-4" aria-hidden />}>
                Next lesson: {next.title}
              </ButtonLink>
            )}
            <Button variant="ghost" size="lg" onClick={() => begin(true)} icon={<RotateCcw className="h-4 w-4" aria-hidden />}>
              Repeat lesson
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ---------- Steps ----------
  const header = (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="t-label truncate text-muted">{lesson.title}</p>
        <span className="t-small shrink-0 text-muted tabular">
          Step {stepIndex + 1} / {lesson.steps.length}
        </span>
      </div>
      <ProgressBar value={stepIndex + (results[step.id] ? 1 : 0)} max={lesson.steps.length} label="Lesson progress" />
      {step.assessment && (
        <Badge tone="info" className="mt-3">
          Scored check
        </Badge>
      )}
    </div>
  );
  const footer = (
    <div className="mt-5 flex items-center justify-between gap-2 border-t border-border pt-3">
      <Button variant="ghost" size="sm" onClick={goPrev} disabled={stepIndex === 0} icon={<ChevronLeft className="h-4 w-4" aria-hidden />}>
        Previous step
      </Button>
      <Link href="/learn/" className="t-small rounded px-2 py-1 font-medium text-muted hover:bg-surface-2 hover:text-fg">
        Save & exit
      </Link>
    </div>
  );

  return (
    <div>
      <BackLink compact />
      <StepPlayer
        key={`${step.id}-${stepIndex}`}
        step={step}
        onComplete={onComplete}
        header={header}
        footer={footer}
        onContinue={goNext}
        continueLabel={stepIndex === lesson.steps.length - 1 ? "Finish lesson" : "Continue"}
      />
    </div>
  );
}

function BackLink({ compact }: { compact?: boolean }) {
  return (
    <Link href="/learn/" className={cn("t-small mb-4 inline-flex items-center gap-1.5 font-medium text-muted hover:text-fg", compact && "mb-3")}>
      <ArrowLeft className="h-4 w-4" aria-hidden /> Curriculum
    </Link>
  );
}

function FollowUpButton({ lesson }: { lesson: Lesson }) {
  const f = lesson.followUp;
  const map = {
    lesson: { href: `/learn/${f.ref}/`, icon: BookOpen },
    puzzles: { href: f.ref ? `/puzzles/?theme=${f.ref}` : "/puzzles/", icon: Puzzle },
    play: { href: "/play/", icon: Swords },
    openings: { href: "/openings/", icon: LibraryBig },
    drills: { href: "/learn/#drills", icon: BookOpen },
    analysis: { href: "/analysis/", icon: Microscope },
  } as const;
  const target = map[f.kind];
  const Icon = target.icon;
  const label = f.kind === "lesson" && f.ref ? `Next: ${getLesson(f.ref)?.title ?? f.label}` : f.label;
  return (
    <ButtonLink href={target.href} size="lg" icon={<Icon className="h-4 w-4" aria-hidden />}>
      {label}
    </ButtonLink>
  );
}
