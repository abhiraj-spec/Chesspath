"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Repeat, Sparkles, Shapes, Layers, Puzzle as PuzzleIcon, CheckCircle2 } from "lucide-react";
import { PUZZLES, DIFFICULTY_LABELS, getPuzzle, puzzleThemes } from "@/content/puzzles";
import { useAnalyses, useAttempts, useGames, useProfile, useReviews } from "@/hooks/data";
import { selectPuzzle, type PuzzleMode, type Selection } from "@/lib/learning/puzzleSelect";
import { computeSkillStats, findWeaknesses } from "@/lib/learning/mastery";
import { describeDue, isDue } from "@/lib/learning/srs";
import { kvDelete, kvGet, kvSet, recordAttempt } from "@/lib/db/repo";
import { PuzzleSolver, type PuzzleOutcome } from "./PuzzleSolver";
import { LessonReview } from "./LessonReview";
import { Badge, EmptyState, PageHeader, PageSkeleton, Segmented, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { skillInfo } from "@/content/skills";
import { useActivityTimer } from "@/hooks/useActivityTimer";
import { useNow } from "@/hooks/useNow";
import type { ReviewCard } from "@/lib/db/types";
import { cn } from "@/lib/util";

type Current = { kind: "puzzle"; selection: Selection } | { kind: "lesson"; card: ReviewCard } | null;
const CURRENT_KEY = "puzzles:current";

export function PuzzleTrainer() {
  const params = useSearchParams();
  const router = useRouter();
  const initialMode: PuzzleMode = params.get("mode") === "review" ? "review" : params.get("theme") ? "theme" : params.get("level") ? "level" : "adaptive";
  const [mode, setMode] = useState<PuzzleMode>(initialMode);
  const [theme, setTheme] = useState<string>(params.get("theme") ?? puzzleThemes()[0].theme);
  const [level, setLevel] = useState<number>(Number(params.get("level") ?? 1) || 1);
  const [current, setCurrent] = useState<Current>(null);
  const [round, setRound] = useState(0);
  const [session, setSession] = useState({ solved: 0, attempted: 0 });
  const profile = useProfile();
  const attempts = useAttempts();
  const reviews = useReviews();
  const analyses = useAnalyses();
  const games = useGames();
  const resumed = useRef(false);

  useActivityTimer(mode === "review" ? "review" : "puzzles");

  const loading = attempts === undefined || reviews === undefined || profile === undefined || analyses === undefined || games === undefined;

  const weakSkills = useMemo(() => {
    if (!attempts || !analyses || !games) return [];
    const colorOf = (id: string) => games.find((g) => g.id === id)?.computer?.userColor ?? null;
    return findWeaknesses(computeSkillStats(attempts), analyses, colorOf).map((w) => w.skill);
  }, [attempts, analyses, games]);

  const now = useNow();
  const dueCards = useMemo(() => (reviews ?? []).filter((c) => (c.kind === "puzzle" || c.kind === "lesson") && isDue(c, now)).sort((a, b) => a.dueAt - b.dueAt), [reviews, now]);

  const pickNext = useCallback(
    (excludeId?: string) => {
      if (!attempts || !reviews) return;
      if (mode === "review") {
        const card = (reviews ?? []).filter((c) => (c.kind === "puzzle" || c.kind === "lesson") && isDue(c, Date.now()) && c.refId !== excludeId).sort((a, b) => a.dueAt - b.dueAt)[0];
        if (!card) {
          setCurrent(null);
          return;
        }
        if (card.kind === "lesson") {
          setCurrent({ kind: "lesson", card });
          return;
        }
        const p = getPuzzle(card.refId);
        if (p) setCurrent({ kind: "puzzle", selection: { puzzle: p, reason: card.reason, isReview: true } });
        return;
      }
      const sel = selectPuzzle({ puzzles: PUZZLES, attempts, reviews, mode, theme, level, skillLevel: profile?.skillLevel, weakSkills, excludeId });
      setCurrent(sel ? { kind: "puzzle", selection: sel } : null);
      if (sel) void kvSet(CURRENT_KEY, { id: sel.puzzle.id, mode, theme, level, reason: sel.reason }).catch(() => {});
    },
    [attempts, reviews, mode, theme, level, profile, weakSkills],
  );

  // First load: resume an unfinished puzzle if there is one.
  useEffect(() => {
    if (loading || resumed.current) return;
    resumed.current = true;
    void (async () => {
      const saved = await kvGet<{ id: string; mode: PuzzleMode; theme: string; level: number; reason: string }>(CURRENT_KEY).catch(() => undefined);
      const p = saved && getPuzzle(saved.id);
      if (p && initialMode !== "review" && !params.get("theme") && (saved.mode === mode || initialMode === "adaptive")) {
        setMode(saved.mode);
        if (saved.theme) setTheme(saved.theme);
        if (saved.level) setLevel(saved.level);
        setCurrent({ kind: "puzzle", selection: { puzzle: p, reason: `Resumed: ${saved.reason}`, isReview: false } });
      } else {
        pickNext();
      }
    })();
  }, [loading, pickNext, initialMode, mode, params]);

  const changeMode = (m: PuzzleMode) => {
    setMode(m);
    const q = m === "review" ? "?mode=review" : m === "theme" ? `?theme=${theme}` : m === "level" ? `?level=${level}` : "";
    router.replace(`/puzzles/${q}`, { scroll: false });
  };

  // Re-pick whenever the mode or filter changes (after the initial load).
  const firstPick = useRef(true);
  useEffect(() => {
    if (!resumed.current) return;
    if (firstPick.current) {
      firstPick.current = false;
      return;
    }
    pickNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, theme, level]);

  const onPuzzleFinished = async (sel: Selection, o: PuzzleOutcome) => {
    const p = sel.puzzle;
    setSession((s) => ({ solved: s.solved + (o.solved ? 1 : 0), attempted: s.attempted + (o.skipped ? 0 : 1) }));
    const reason = o.revealed
      ? `You looked at the solution of this ${p.themeName.toLowerCase()} puzzle.`
      : o.mistakes > 0
        ? `You needed ${o.mistakes + 1} tries on this ${p.themeName.toLowerCase()} puzzle.`
        : o.hintsUsed > 0
          ? `You used ${o.hintsUsed} hint${o.hintsUsed > 1 ? "s" : ""} on this ${p.themeName.toLowerCase()} puzzle.`
          : "";
    try {
      await recordAttempt({
        kind: "puzzle",
        refId: p.id,
        skills: p.skills,
        difficulty: p.difficulty,
        solved: o.solved,
        mistakes: o.mistakes,
        hintsUsed: o.hintsUsed,
        revealed: o.revealed,
        skipped: o.skipped,
        durationMs: o.durationMs,
        review: { kind: "puzzle", reasonIfStruggled: reason || "Scheduled review." },
      });
      await kvDelete(CURRENT_KEY);
    } catch {
      /* attempt not saved; the session continues */
    }
  };

  const next = () => {
    const id = current?.kind === "puzzle" ? current.selection.puzzle.id : current?.kind === "lesson" ? current.card.refId : undefined;
    setRound((r) => r + 1);
    pickNext(id);
    document.getElementById("main")?.scrollIntoView({ block: "start" });
  };

  if (loading) return <PageSkeleton />;

  const themes = puzzleThemes();
  const modeBar = (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Segmented
        label="Puzzle mode"
        value={mode}
        onChange={changeMode}
        options={[
          { value: "adaptive", label: <span className="inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4" aria-hidden />Adaptive</span>, description: "Chosen for your level and weak spots" },
          { value: "theme", label: <span className="inline-flex items-center gap-1.5"><Shapes className="h-4 w-4" aria-hidden />By theme</span> },
          { value: "level", label: <span className="inline-flex items-center gap-1.5"><Layers className="h-4 w-4" aria-hidden />By level</span> },
          { value: "review", label: <span className="inline-flex items-center gap-1.5"><Repeat className="h-4 w-4" aria-hidden />Review{dueCards.length ? ` (${dueCards.length})` : ""}</span> },
        ]}
      />
      {mode === "theme" && (
        <div className="sm:w-64">
          <Select label="Theme" hideLabel value={theme} onChange={setTheme} options={themes.map((t) => ({ value: t.theme, label: `${t.name} (${t.count})` }))} />
        </div>
      )}
      {mode === "level" && (
        <div className="sm:w-72">
          <Select label="Level" hideLabel value={String(level)} onChange={(v) => setLevel(Number(v))} options={[1, 2, 3, 4, 5].map((l) => ({ value: String(l), label: `${DIFFICULTY_LABELS[l].name}: ${DIFFICULTY_LABELS[l].description} (${PUZZLES.filter((p) => p.difficulty === l).length})` }))} />
        </div>
      )}
      {session.attempted > 0 && (
        <p className="t-small text-muted sm:ml-auto" aria-live="polite">
          <CheckCircle2 className="mr-1 inline h-4 w-4 text-success" aria-hidden />
          This session: {session.solved}/{session.attempted} solved
        </p>
      )}
    </div>
  );

  const header = (
    <PageHeader
      eyebrow="Tactics trainer"
      title="Puzzles"
      compactOnMobile
      description={`${PUZZLES.length} verified positions from real games. Solve, learn the pattern, and the trainer adapts to you.`}
    />
  );

  if (!current) {
    const nextDue = (reviews ?? []).filter((c) => !isDue(c, now) && (c.kind === "puzzle" || c.kind === "lesson")).sort((a, b) => a.dueAt - b.dueAt)[0];
    return (
      <div>
        {header}
        {modeBar}
        {mode === "review" ? (
          <EmptyState
            icon={<Repeat className="h-8 w-8" aria-hidden />}
            title="Nothing to review right now"
            description={
              nextDue
                ? `Your next review is ${describeDue(nextDue, now).toLowerCase()}. Exercises you miss or need hints for are scheduled here automatically.`
                : "When you miss a puzzle or need hints, it comes back here at growing intervals (spaced repetition) until you know the pattern."
            }
            action={<Button onClick={() => changeMode("adaptive")}>Solve new puzzles</Button>}
          />
        ) : (
          <EmptyState icon={<PuzzleIcon className="h-8 w-8" aria-hidden />} title="No puzzles match" description="Try another theme or level." action={<Button onClick={() => changeMode("adaptive")}>Adaptive puzzles</Button>} />
        )}
      </div>
    );
  }

  if (current.kind === "lesson") {
    return (
      <div>
        {header}
        {modeBar}
        <LessonReview key={`${current.card.id}-${round}`} card={current.card} onNext={next} />
      </div>
    );
  }

  const sel = current.selection;
  return (
    <div>
      {header}
      {modeBar}
      <PuzzleSolver
        key={`${sel.puzzle.id}-${round}`}
        puzzle={sel.puzzle}
        onFinished={(o) => void onPuzzleFinished(sel, o)}
        onNext={next}
        context={
          <p className={cn("t-small mt-3 rounded-[var(--radius-sm)] px-3 py-2", sel.isReview ? "bg-info-soft text-fg" : "bg-surface-2 text-muted")}>
            {sel.isReview ? (
              <>
                <Badge tone="info" className="mr-1.5">Review</Badge>
                {sel.reason}
              </>
            ) : (
              sel.reason
            )}
          </p>
        }
      />
      {weakSkills.length > 0 && mode === "adaptive" && (
        <p className="t-small mt-4 text-muted">
          Weak areas being targeted: {weakSkills.slice(0, 3).map((s) => skillInfo(s).name).join(", ")}. <Link href="/progress/" className="underline hover:text-fg">See why</Link>
        </p>
      )}
    </div>
  );
}

