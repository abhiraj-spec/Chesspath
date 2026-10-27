"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { getLesson } from "@/content/lessons";
import type { ReviewCard } from "@/lib/db/types";
import { StepPlayer } from "@/components/lesson/StepPlayer";
import { recordAttempt } from "@/lib/db/repo";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";

/** Replays a single lesson exercise that is due for spaced-repetition review. */
export function LessonReview({ card, onNext }: { card: ReviewCard; onNext: () => void }) {
  const [lessonId, stepId] = card.refId.split("#");
  const lesson = getLesson(lessonId);
  const step = lesson?.steps.find((s) => s.id === stepId);
  const started = useRef(0);
  useEffect(() => {
    started.current = Date.now();
  }, []);
  if (!lesson || !step) {
    return <EmptyState title="This review item is no longer available" description="The lesson content has changed." action={<Button onClick={onNext}>Next review</Button>} />;
  }
  return (
    <StepPlayer
      step={step}
      onComplete={(r) => {
        void recordAttempt({
          kind: "lesson",
          refId: card.refId,
          skills: lesson.skills,
          difficulty: lesson.difficulty,
          solved: r.solved,
          mistakes: r.mistakes,
          hintsUsed: r.hintsUsed,
          revealed: r.revealed,
          skipped: false,
          durationMs: Date.now() - started.current,
          review: { kind: "lesson", reasonIfStruggled: `This exercise from “${lesson.title}” still needed help.` },
        }).catch(() => {});
      }}
      onContinue={onNext}
      continueLabel="Next review"
      header={
        <div className="mb-3">
          <Badge tone="info">Review</Badge>
          <p className="t-small mt-2 text-muted">
            From the lesson <Link className="underline hover:text-fg" href={`/learn/${lesson.id}/`}>{lesson.title}</Link>. {card.reason}
          </p>
        </div>
      }
    />
  );
}
