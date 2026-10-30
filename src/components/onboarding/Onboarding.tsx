"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import type { LearningGoal, SkillLevel, UserProfile } from "@/lib/db/types";
import { saveProfile, logEvent } from "@/lib/db/repo";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/primitives";
import { LogoMark } from "@/components/layout/Logo";
import { DIAGNOSTIC, diagnose, type DiagnosticAnswer } from "@/content/diagnostic";
import { StepPlayer } from "@/components/lesson/StepPlayer";
import { getLesson } from "@/content/lessons";
import { startLessonId } from "@/lib/learning/plan";
import { cn } from "@/lib/util";

const LEVELS: { value: SkillLevel; title: string; description: string }[] = [
  { value: "complete-beginner", title: "Complete beginner", description: "I'm new to chess or only know some of the pieces." },
  { value: "beginner", title: "Beginner", description: "I know the rules, but I often lose pieces or miss tactics." },
  { value: "intermediate", title: "Intermediate", description: "I play regularly and want to improve calculation, openings or endgames." },
  { value: "advanced", title: "Advanced learner", description: "I train seriously and want demanding exercises and analysis." },
];

const GOALS: { value: LearningGoal; title: string }[] = [
  { value: "from-scratch", title: "Learn chess from scratch" },
  { value: "tactics", title: "Improve tactical calculation" },
  { value: "rapid-classical", title: "Play better rapid or classical games" },
  { value: "openings", title: "Improve opening knowledge" },
  { value: "positional", title: "Develop positional understanding" },
  { value: "endgames", title: "Improve endgame technique" },
  { value: "tournaments", title: "Prepare for tournaments" },
  { value: "overall", title: "Improve overall performance" },
];

const TARGETS: UserProfile["dailyTargetMinutes"][] = [10, 15, 30, 60];

type Stage = "welcome" | "level" | "goal" | "time" | "diagnostic-offer" | "diagnostic" | "done";

export function Onboarding() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("welcome");
  const [level, setLevel] = useState<SkillLevel>("complete-beginner");
  const [goal, setGoal] = useState<LearningGoal>("from-scratch");
  const [target, setTarget] = useState<UserProfile["dailyTargetMinutes"]>(15);
  const [diagIndex, setDiagIndex] = useState(0);
  const [answers, setAnswers] = useState<DiagnosticAnswer[]>([]);
  const [result, setResult] = useState<{ lessonId: string; summary: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const finish = async (withDiagnostic: { lessonId: string; summary: string } | null) => {
    setSaving(true);
    const base: Partial<UserProfile> = { skillLevel: level, learningGoals: [goal], dailyTargetMinutes: target, onboardingCompleted: true };
    await saveProfile({
      ...base,
      diagnostic: withDiagnostic
        ? { takenAt: Date.now(), answers, recommendedLessonId: withDiagnostic.lessonId, summary: withDiagnostic.summary }
        : undefined,
    }).catch(() => {});
    await logEvent("onboarding_completed", undefined, { level, goal, target, diagnostic: Boolean(withDiagnostic) });
    setSaving(false);
    setStage("done");
  };

  const skipAll = async () => {
    await saveProfile({ onboardingCompleted: true }).catch(() => {});
    router.push("/learn/board-coordinates/");
  };

  const steps: Stage[] = ["level", "goal", "time"];
  const stepNo = steps.indexOf(stage);

  if (stage === "welcome") {
    return (
      <div className="mx-auto max-w-xl pt-6 text-center sm:pt-12">
        <div className="mx-auto mb-5 w-fit">
          <LogoMark size={56} />
        </div>
        <h1 className="t-page">Welcome to ChessPath</h1>
        <p className="t-body mx-auto mt-3 max-w-md text-muted">
          Learn chess step by step with interactive lessons, puzzles from real games and a computer opponent. No account needed: your progress is saved on this device.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Button size="lg" onClick={() => setStage("level")} icon={<Sparkles className="h-5 w-5" aria-hidden />}>
            Personalise my training (1 minute)
          </Button>
          <button type="button" onClick={skipAll} className="t-small font-medium text-muted underline-offset-4 hover:text-fg hover:underline">
            Skip and start the first lesson
          </button>
        </div>
      </div>
    );
  }

  if (stage === "done") {
    const lessonId = result?.lessonId ?? startLessonId({ skillLevel: level, learningGoals: [goal] });
    const lesson = getLesson(lessonId)!;
    return (
      <div className="mx-auto max-w-xl pt-6 sm:pt-10">
        <div className="mb-4 grid grid-cols-1 h-12 w-12 place-items-center rounded-full bg-success-soft">
          <Check className="h-6 w-6 text-success" aria-hidden />
        </div>
        <h1 className="t-page">You&apos;re all set</h1>
        {result ? <p className="t-body mt-3 text-fg/90">{result.summary}</p> : <p className="t-body mt-3 text-muted">Based on your answers, here is the best place to start. You can change level, goal and daily target any time in Settings.</p>}
        <Card className="mt-6 p-5">
          <p className="t-label text-accent">Recommended first lesson</p>
          <p className="t-section mt-1">{lesson.title}</p>
          <p className="t-small mt-1 text-muted">{lesson.objective}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button size="lg" onClick={() => router.push(`/learn/${lesson.id}/`)} icon={<ArrowRight className="h-5 w-5" aria-hidden />}>
              Start lesson
            </Button>
            <Button size="lg" variant="secondary" onClick={() => router.push("/")}>
              Go to my dashboard
            </Button>
          </div>
        </Card>
        <p className="t-small mt-4 text-subtle">This is a recommendation, not a rating. ChessPath does not award official ratings.</p>
      </div>
    );
  }

  if (stage === "diagnostic-offer") {
    return (
      <Shell onBack={() => setStage("time")} title="Optional: a 2-minute check" step={null}>
        <p className="t-body text-muted">
          Six quick positions help us pick your starting lesson. Answer without hints if you can; it is only used for this recommendation, never as a rating.
        </p>
        {level === "complete-beginner" && <p className="t-small mt-3 rounded-[var(--radius-md)] bg-info-soft px-3 py-2 text-fg">As a complete beginner you can skip this: we&apos;ll start from the very first lesson.</p>}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button size="lg" onClick={() => setStage("diagnostic")}>
            Take the check
          </Button>
          <Button size="lg" variant="secondary" loading={saving} onClick={() => finish(null)}>
            Skip
          </Button>
        </div>
      </Shell>
    );
  }

  if (stage === "diagnostic") {
    const item = DIAGNOSTIC[diagIndex];
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <button type="button" className="t-small inline-flex items-center gap-1 text-muted hover:text-fg" onClick={() => setStage("diagnostic-offer")}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </button>
          <button type="button" className="t-small text-muted underline hover:text-fg" onClick={() => finish(null)}>
            Stop the check
          </button>
        </div>
        <StepPlayer
          key={item.id}
          step={item.step}
          onComplete={(r) => {
            setAnswers((a) => [...a.filter((x) => x.id !== item.id), { id: item.id, skill: item.skill, correct: r.solved && !r.revealed && r.mistakes === 0 && r.hintsUsed === 0 }]);
          }}
          onContinue={() => {
            if (diagIndex + 1 < DIAGNOSTIC.length) setDiagIndex((i) => i + 1);
            else {
              const final = answers;
              const res = diagnose(final);
              setResult(res);
              void finish(res);
            }
          }}
          continueLabel={diagIndex + 1 < DIAGNOSTIC.length ? "Next question" : "See my recommendation"}
          header={
            <p className="t-small mb-3 text-muted">
              Placement check · question {diagIndex + 1} of {DIAGNOSTIC.length}
            </p>
          }
        />
      </div>
    );
  }

  return (
    <Shell
      onBack={() => setStage(stepNo <= 0 ? "welcome" : steps[stepNo - 1])}
      title={stage === "level" ? "How well do you know chess?" : stage === "goal" ? "What is your main goal?" : "How much time per day?"}
      step={stepNo}
    >
      {stage === "level" && (
        <OptionList
          name="level"
          value={level}
          onChange={(v) => {
            setLevel(v as SkillLevel);
            if (v !== "complete-beginner" && goal === "from-scratch") setGoal("overall");
            if (v === "complete-beginner") setGoal("from-scratch");
          }}
          options={LEVELS.map((l) => ({ value: l.value, title: l.title, description: l.description }))}
        />
      )}
      {stage === "goal" && <OptionList name="goal" value={goal} onChange={(v) => setGoal(v as LearningGoal)} options={GOALS.map((g) => ({ value: g.value, title: g.title }))} columns />}
      {stage === "time" && (
        <>
          <OptionList
            name="target"
            value={String(target)}
            onChange={(v) => setTarget(Number(v) as UserProfile["dailyTargetMinutes"])}
            options={TARGETS.map((t) => ({ value: String(t), title: `${t} minutes`, description: t === 10 ? "A short daily habit" : t === 15 ? "Recommended for steady progress" : t === 30 ? "Serious improvement" : "Intensive training" }))}
            columns
          />
          <p className="t-small mt-3 text-muted">Your daily plan is built around this. Durations are estimates: there&apos;s no timer and no pressure.</p>
        </>
      )}
      <div className="mt-6 flex justify-end">
        <Button size="lg" onClick={() => setStage(stage === "level" ? "goal" : stage === "goal" ? "time" : "diagnostic-offer")} icon={<ArrowRight className="h-5 w-5" aria-hidden />}>
          Continue
        </Button>
      </div>
    </Shell>
  );
}

function Shell({ title, children, onBack, step }: { title: string; children: React.ReactNode; onBack: () => void; step: number | null }) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <button type="button" onClick={onBack} className="t-small inline-flex items-center gap-1 font-medium text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back
        </button>
        {step !== null && (
          <div className="flex gap-1.5" aria-label={`Step ${step + 1} of 3`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={cn("h-1.5 w-8 rounded-full", i <= step ? "bg-accent" : "bg-surface-3")} />
            ))}
          </div>
        )}
        <Link href="/" className="t-small text-muted hover:text-fg">
          Close
        </Link>
      </div>
      <h1 className="t-page">{title}</h1>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function OptionList({ name, value, onChange, options, columns }: { name: string; value: string; onChange: (v: string) => void; options: { value: string; title: string; description?: string }[]; columns?: boolean }) {
  return (
    <fieldset>
      <legend className="sr-only">{name}</legend>
      <div className={cn("grid grid-cols-1 gap-2.5", columns && "sm:grid-cols-2")}>
        {options.map((o) => {
          const checked = value === o.value;
          return (
            <label
              key={o.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-[var(--radius-lg)] border bg-surface p-4 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]",
                checked ? "border-accent bg-accent-soft/50" : "border-border hover:border-border-strong",
              )}
            >
              <input type="radio" name={name} value={o.value} checked={checked} onChange={() => onChange(o.value)} className="sr-only" />
              <span className={cn("mt-0.5 grid grid-cols-1 h-5 w-5 shrink-0 place-items-center rounded-full border-2", checked ? "border-accent bg-accent" : "border-border-strong")} aria-hidden>
                {checked && <Check className="h-3 w-3 text-accent-contrast" strokeWidth={3} />}
              </span>
              <span>
                <span className="t-card block text-fg">{o.title}</span>
                {o.description && <span className="t-small mt-0.5 block text-muted">{o.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
