"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { getDrill } from "@/content/drills";
import { getLesson } from "@/content/lessons";
import { StepPlayer } from "@/components/lesson/StepPlayer";
import { recordAttempt } from "@/lib/db/repo";
import { useActivityTimer } from "@/hooks/useActivityTimer";
import { DifficultyBadge } from "@/components/ui/primitives";

export function DrillPlayer({ drillId }: { drillId: string }) {
  const drill = getDrill(drillId)!;
  const [round, setRound] = useState(0);
  const started = useRef(0);
  useEffect(() => {
    started.current = Date.now();
  }, []);
  const lesson = drill.lesson ? getLesson(drill.lesson) : undefined;
  useActivityTimer("drill", drill.id);
  return (
    <div>
      <Link href="/learn/#drills" className="t-small mb-3 inline-flex items-center gap-1.5 font-medium text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Drills
      </Link>
      <StepPlayer
        key={round}
        step={drill.step}
        onComplete={(r) => {
          void recordAttempt({
            kind: "drill",
            refId: drill.id,
            skills: drill.skills,
            difficulty: drill.difficulty,
            solved: r.solved,
            mistakes: r.mistakes,
            hintsUsed: r.hintsUsed,
            revealed: r.revealed,
            skipped: false,
            durationMs: Date.now() - started.current,
          }).catch(() => {});
        }}
        onContinue={() => {
          started.current = Date.now();
          setRound((x) => x + 1);
        }}
        continueLabel="Play it again"
        header={
          <div className="mb-3">
            <h1 className="t-section">{drill.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <DifficultyBadge level={drill.difficulty} />
              {lesson && (
                <Link href={`/learn/${lesson.id}/`} className="t-small text-muted underline hover:text-fg">
                  Lesson: {lesson.title}
                </Link>
              )}
            </div>
          </div>
        }
      />
    </div>
  );
}
