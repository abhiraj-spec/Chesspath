"use client";

import { ActionDock, focusVisible } from "@/components/ui/ActionDock";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Chess, type Square } from "chess.js";
import { CheckCircle2, ChevronLeft, ChevronRight, Eye, Lightbulb, RotateCcw, XCircle, Info, FlipVertical2 } from "lucide-react";
import { Chessboard, type BoardHighlight, type BoardMove } from "@/components/board/Chessboard";
import { PanelCard, TrainerLayout } from "@/components/board/TrainerLayout";
import { Button, IconButton } from "@/components/ui/Button";
import { Callout } from "@/components/ui/primitives";
import type { ChoiceStep, ExplainStep, LessonStep, PlayStep, SquaresStep } from "@/content/types";
import { matchMove, passTurnFen, resolveTargets, wrongFor, type StepResult } from "@/lib/lessons/engine";
import { colorName, turnOf } from "@/lib/chess/core";
import { playMoveSound, playSound } from "@/lib/sound";
import { RichParagraphs, RichText } from "./RichText";
import { GoalPlayer } from "./GoalPlayer";
import { cn } from "@/lib/util";

export interface StepPlayerProps {
  step: LessonStep;
  onComplete: (r: StepResult) => void;
  /** Rendered at the top of the side panel (lesson title, progress). */
  header?: ReactNode;
  /** Rendered at the bottom of the side panel (navigation). */
  footer?: ReactNode;
  onContinue?: () => void;
  continueLabel?: string;
  boardLabel?: string;
}

type Feedback = { tone: "success" | "danger" | "info" | "warning"; title?: string; text: string } | null;

const strip = (san: string) => san.replace(/[+#]+$/, "");

export function StepPlayer(props: StepPlayerProps) {
  const { step } = props;
  switch (step.kind) {
    case "explain":
      return <ExplainPlayer key={step.id} {...props} step={step} />;
    case "play":
      return <PlayPlayer key={step.id} {...props} step={step} />;
    case "squares":
      return <SquaresPlayer key={step.id} {...props} step={step} />;
    case "choice":
      return <ChoicePlayer key={step.id} {...props} step={step} />;
    case "goal":
      return <GoalPlayer key={step.id} {...props} step={step} />;
  }
}

// ---------------------------------------------------------------------------------------------

export function ContinueBar({ done, onContinue, label, note }: { done: boolean; onContinue?: () => void; label?: string; note?: ReactNode }) {
  // Only bring the explanation into view when the learner has just solved the exercise,
  // not for explanation steps that are "done" as soon as they open.
  const [solvedHere] = useState(() => !done);
  useEffect(() => {
    if (done) focusVisible("[data-continue]");
  }, [done]);
  if (!done || !onContinue) return null;
  return (
    <ActionDock note={note} revealPanel={solvedHere}>
      <Button data-continue size="lg" className="w-full" onClick={onContinue} icon={<ChevronRight className="h-5 w-5" aria-hidden />}>
        {label ?? "Continue"}
      </Button>
    </ActionDock>
  );
}

function SideToMove({ fen, passTurn }: { fen: string; passTurn?: boolean }) {
  const t = turnOf(fen);
  return (
    <p className="t-small mb-2 flex items-center gap-2 text-muted">
      <span className={cn("inline-block h-3 w-3 rounded-full border border-border-strong", t === "w" ? "bg-white" : "bg-neutral-900")} aria-hidden />
      {colorName(t)} to move{passTurn ? " (drill: the other side passes)" : ""}
    </p>
  );
}

/** Compact instruction shown above the board on small screens (the full panel is below the board). */
export function MobilePrompt({ text, fen }: { text: string; fen?: string }) {
  return (
    <p className="t-small mb-2 font-medium text-fg md:hidden" aria-hidden>
      {fen ? `${colorName(turnOf(fen))} to move · ` : ""}
      {text.replace(/\*\*/g, "")}
    </p>
  );
}

function FeedbackView({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  const icon =
    feedback.tone === "success" ? (
      <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />
    ) : feedback.tone === "danger" ? (
      <XCircle className="h-5 w-5 text-danger" aria-hidden />
    ) : (
      <Info className="h-5 w-5 text-info" aria-hidden />
    );
  return (
    <div aria-live="polite" className="mt-3">
      <Callout tone={feedback.tone} title={feedback.title} icon={icon} className="animate-fade-in">
        <RichText text={feedback.text} />
      </Callout>
    </div>
  );
}

function HintList({ hints, shown }: { hints: string[]; shown: number }) {
  if (shown === 0) return null;
  return (
    <ol className="mt-3 space-y-1.5" aria-label="Hints">
      {hints.slice(0, shown).map((h, i) => (
        <li key={i} className="t-small flex gap-2 rounded-[var(--radius-sm)] bg-warning-soft px-3 py-2 text-fg">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span>
            <span className="sr-only">Hint {i + 1}: </span>
            {h}
          </span>
        </li>
      ))}
    </ol>
  );
}

function OrientationToggle({ orientation, onFlip }: { orientation: "w" | "b"; onFlip: () => void }) {
  return (
    <IconButton label={`Flip board (currently ${orientation === "w" ? "White" : "Black"} at the bottom)`} size="sm" variant="ghost" onClick={onFlip}>
      <FlipVertical2 className="h-4 w-4" aria-hidden />
    </IconButton>
  );
}

// ---------------------------------------------------------------------------------------------
// Explain (with optional demonstration)

function ExplainPlayer({ step, onComplete, header, footer, onContinue, continueLabel }: StepPlayerProps & { step: ExplainStep }) {
  const [demoIdx, setDemoIdx] = useState(0);
  const [orientation, setOrientation] = useState<"w" | "b">(step.orientation ?? "w");
  const completed = useRef(false);
  const demo = step.demo;

  const { fen, last } = useMemo(() => {
    if (!step.fen) return { fen: undefined, last: null };
    const c = new Chess(step.fen);
    let lastMv: { from: Square; to: Square } | null = null;
    if (demo) {
      for (let i = 0; i < demoIdx; i++) {
        const m = c.move(demo.moves[i]);
        lastMv = { from: m.from, to: m.to };
      }
    }
    return { fen: c.fen(), last: lastMv };
  }, [step.fen, demo, demoIdx]);

  const demoDone = !demo || demoIdx >= demo.moves.length;
  const finish = () => {
    if (!completed.current) {
      completed.current = true;
      onComplete({ stepId: step.id, solved: true, mistakes: 0, hintsUsed: 0, revealed: false });
    }
    onContinue?.();
  };

  const panel = (
    <PanelCard>
      {header}
      {step.title && <h2 className="t-section mb-2">{step.title}</h2>}
      <RichParagraphs paragraphs={step.text} className="t-body prose-lesson text-fg/90" />
      {demo && (
        <div className="mt-4 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
          <p className="t-label mb-1 text-muted">Demonstration</p>
          <p className="t-small min-h-[2.5rem] text-fg" aria-live="polite">
            {demoIdx === 0 ? "Use “Next move” to step through the example." : (demo.notes?.[demoIdx - 1] ?? `Played ${demo.moves[demoIdx - 1]}.`)}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setDemoIdx((i) => Math.max(0, i - 1))} disabled={demoIdx === 0} icon={<ChevronLeft className="h-4 w-4" aria-hidden />}>
              Back
            </Button>
            <Button size="sm" variant={demoDone ? "secondary" : "primary"} onClick={() => setDemoIdx((i) => Math.min(demo.moves.length, i + 1))} disabled={demoDone}>
              Next move
            </Button>
            <span className="t-small ml-auto text-muted tabular">
              {demoIdx}/{demo.moves.length}
            </span>
          </div>
        </div>
      )}
      <ActionDock revealPanel={false} className="mt-5">
        <Button size="lg" className="w-full" onClick={finish} icon={<ChevronRight className="h-5 w-5" aria-hidden />}>
          {continueLabel ?? "Continue"}
        </Button>
      </ActionDock>
      {footer}
    </PanelCard>
  );

  if (!fen) return <div className="mx-auto max-w-2xl">{panel}</div>;
  return (
    <TrainerLayout
      board={
        <>
          <Chessboard fen={fen} orientation={orientation} movable="none" arrows={demoIdx === 0 ? step.arrows : []} highlights={demoIdx === 0 ? step.marks : []} lastMove={last} label="Lesson demonstration board" />
          <div className="mt-2 flex justify-end">
            <OrientationToggle orientation={orientation} onFlip={() => setOrientation((o) => (o === "w" ? "b" : "w"))} />
          </div>
        </>
      }
      panel={panel}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Play: the learner makes moves

function PlayPlayer({ step, onComplete, header, footer, onContinue, continueLabel }: StepPlayerProps & { step: PlayStep }) {
  const [fen, setFen] = useState(step.fen);
  const [moveIdx, setMoveIdx] = useState(0);
  const [status, setStatus] = useState<"playing" | "solved" | "revealed">("playing");
  const [mistakes, setMistakes] = useState(0);
  const [hintsShown, setHintsShown] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [badSquare, setBadSquare] = useState<Square | null>(null);
  const [locked, setLocked] = useState(false);
  const [orientation, setOrientation] = useState<"w" | "b">(step.orientation ?? turnOf(step.fen));
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const reported = useRef(false);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  const finish = useCallback(
    (revealed: boolean) => {
      setStatus(revealed ? "revealed" : "solved");
      if (!reported.current) {
        reported.current = true;
        onComplete({ stepId: step.id, solved: true, mistakes, hintsUsed: hintsShown, revealed });
      }
    },
    [onComplete, step.id, mistakes, hintsShown],
  );

  const applyCorrect = useCallback(
    (currentFen: string, san: string, idx: number) => {
      const pm = step.moves[idx];
      const c = new Chess(currentFen);
      const m = c.move(san);
      playMoveSound(m.san);
      setLastMove({ from: m.from, to: m.to });
      const isLast = idx === step.moves.length - 1;
      if (pm.reply && !isLast) {
        setFen(c.fen());
        setLocked(true);
        setFeedback({ tone: "success", text: pm.feedback ?? "Correct." });
        later(() => {
          const r = c.move(pm.reply!);
          playMoveSound(r.san);
          setFen(c.fen());
          setLastMove({ from: r.from, to: r.to });
          setMoveIdx(idx + 1);
          setLocked(false);
        }, 650);
        return c.fen();
      }
      if (pm.reply && isLast) {
        // A final reply shows the consequence of the solution.
        setFen(c.fen());
        later(() => {
          const r = c.move(pm.reply!);
          playMoveSound(r.san);
          setFen(c.fen());
          setLastMove({ from: r.from, to: r.to });
        }, 650);
      } else {
        const next = step.passTurn ? passTurnFen(c.fen()) : c.fen();
        setFen(next);
      }
      if (isLast) return null;
      setMoveIdx(idx + 1);
      setFeedback({ tone: "success", text: pm.feedback ?? "Correct. Keep going." });
      return c.fen();
    },
    [step],
  );

  const onMove = (mv: BoardMove) => {
    if (status !== "playing" || locked) return;
    const c = new Chess(fen);
    let move;
    try {
      move = c.move(mv);
    } catch {
      return;
    }
    const pm = step.moves[moveIdx];
    if (matchMove(move, pm.accept)) {
      setBadSquare(null);
      const isLast = moveIdx === step.moves.length - 1;
      applyCorrect(fen, move.san, moveIdx);
      if (isLast) {
        playSound("success");
        setFeedback({ tone: "success", title: "Correct!", text: pm.feedback ?? "Well done." });
        finish(false);
      }
      return;
    }
    // Wrong move: show it briefly, explain, and take it back.
    setMistakes((n) => n + 1);
    playSound("error");
    const specific = wrongFor(step, moveIdx).find((w) => strip(w.san) === strip(move.san));
    let text = specific?.text ?? step.wrongDefault;
    if (!text) {
      if (c.isStalemate()) text = `${move.san} would be stalemate, which is only a draw.`;
      else text = `${move.san} is not the move we are looking for.${hintsShown < step.hints.length ? " Try again, or take a hint." : " Try again."}`;
    }
    setFeedback({ tone: "danger", title: "Not quite", text });
    setLocked(true);
    setFen(c.fen());
    setLastMove({ from: move.from, to: move.to });
    setBadSquare(move.to);
    later(() => {
      setFen(fen);
      setLastMove(null);
      setLocked(false);
    }, 900);
  };

  const reveal = () => {
    if (status !== "playing" || locked) return;
    setLocked(true);
    setFeedback({ tone: "info", title: "Solution", text: "Watch the solution being played." });
    let currentFen = fen;
    let delay = 0;
    for (let i = moveIdx; i < step.moves.length; i++) {
      const pm = step.moves[i];
      const c = new Chess(currentFen);
      const candidates = c.moves({ verbose: true }).filter((m) => matchMove(m, pm.accept));
      const pick = pm.accept.san ? (candidates.find((m) => strip(m.san) === strip(pm.accept.san![0])) ?? candidates[0]) : candidates[0];
      if (!pick) break;
      c.move(pick.san);
      const after = c.fen();
      later(() => {
        setFen(step.passTurn && !pm.reply ? passTurnFen(after) : after);
        setLastMove({ from: pick.from, to: pick.to });
        playMoveSound(pick.san);
      }, delay);
      delay += 700;
      if (pm.reply) {
        const r = c.move(pm.reply);
        const afterReply = c.fen();
        later(() => {
          setFen(afterReply);
          setLastMove({ from: r.from, to: r.to });
        }, delay);
        delay += 700;
      }
      currentFen = step.passTurn && !pm.reply ? passTurnFen(c.fen()) : c.fen();
    }
    later(() => {
      setLocked(false);
      setFeedback({ tone: "info", title: "Solution shown", text: "Study the idea below. You can restart this exercise to try it yourself." });
      finish(true);
    }, delay);
  };

  const restart = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setFen(step.fen);
    setMoveIdx(0);
    setLastMove(null);
    setBadSquare(null);
    setLocked(false);
    setFeedback(null);
    if (status !== "playing") setStatus("playing");
  };

  const highlights: BoardHighlight[] = [...(step.marks ?? [])];
  if (badSquare) highlights.push({ square: badSquare, kind: "bad" });
  if (hintsShown >= step.hints.length && step.hintSquares && status === "playing") for (const s of step.hintSquares) highlights.push({ square: s, kind: "hint" });

  const done = status !== "playing";
  const canReveal = mistakes >= 2 || hintsShown >= step.hints.length;

  return (
    <TrainerLayout
      above={<MobilePrompt text={step.prompt} fen={fen} />}
      board={
        <>
          <Chessboard
            fen={fen}
            orientation={orientation}
            movable={done || locked ? "none" : turnOf(fen)}
            onMove={onMove}
            lastMove={lastMove}
            highlights={highlights}
            arrows={moveIdx === 0 && !lastMove ? step.arrows : []}
            label="Exercise board"
            testId="exercise-board"
          />
          <div className="mt-2 flex justify-end">
            <OrientationToggle orientation={orientation} onFlip={() => setOrientation((o) => (o === "w" ? "b" : "w"))} />
          </div>
        </>
      }
      panel={
        <PanelCard>
          {header}
          <SideToMove fen={fen} passTurn={step.passTurn} />
          <RichText text={step.prompt} className="t-body font-medium text-fg" />
          {step.moves.length > 1 && (
            <p className="t-small mt-1 text-muted">
              Move {Math.min(moveIdx + 1, step.moves.length)} of {step.moves.length}
            </p>
          )}
          <HintList hints={step.hints} shown={hintsShown} />
          <FeedbackView feedback={feedback} />
          {done && (
            <div className="animate-fade-in mt-3 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
              <p className="t-label mb-1 text-muted">Why it works</p>
              <RichText text={step.explanation} className="t-small text-fg" />
            </div>
          )}
          {!done && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setHintsShown((h) => Math.min(step.hints.length, h + 1))}
                disabled={hintsShown >= step.hints.length}
                icon={<Lightbulb className="h-4 w-4" aria-hidden />}
              >
                {hintsShown === 0 ? "Hint" : hintsShown < step.hints.length ? "Another hint" : step.hintSquares ? "Hint shown on board" : "No more hints"}
              </Button>
              <Button variant="ghost" size="sm" onClick={restart} icon={<RotateCcw className="h-4 w-4" aria-hidden />}>
                Reset
              </Button>
              {canReveal && (
                <Button variant="ghost" size="sm" onClick={reveal} icon={<Eye className="h-4 w-4" aria-hidden />}>
                  Show solution
                </Button>
              )}
            </div>
          )}
          {done && status === "revealed" && (
            <Button variant="secondary" size="sm" className="mt-3" onClick={restart} icon={<RotateCcw className="h-4 w-4" aria-hidden />}>
              Try it yourself
            </Button>
          )}
          <ContinueBar done={done} onContinue={onContinue} label={continueLabel} />
          {footer}
        </PanelCard>
      }
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Squares: select a set of squares

function SquaresPlayer({ step, onComplete, header, footer, onContinue, continueLabel }: StepPlayerProps & { step: SquaresStep }) {
  const targets = useMemo(() => resolveTargets(step.fen, step.targets), [step]);
  const [selected, setSelected] = useState<Square[]>([]);
  const [checked, setChecked] = useState<{ missing: Square[]; extra: Square[] } | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [hintsShown, setHintsShown] = useState(0);
  const [done, setDone] = useState<null | "solved" | "revealed">(null);
  const [orientation, setOrientation] = useState<"w" | "b">(step.orientation ?? "w");
  const reported = useRef(false);
  const single = targets.length === 1;

  const complete = (revealed: boolean) => {
    setDone(revealed ? "revealed" : "solved");
    if (!reported.current) {
      reported.current = true;
      onComplete({ stepId: step.id, solved: true, mistakes, hintsUsed: hintsShown, revealed });
    }
  };

  const evaluate = (sel: Square[]) => {
    const missing = targets.filter((t) => !sel.includes(t));
    const extra = sel.filter((s) => !targets.includes(s));
    if (missing.length === 0 && extra.length === 0) {
      playSound("success");
      setChecked({ missing, extra });
      complete(false);
    } else {
      playSound("error");
      setMistakes((m) => m + 1);
      setChecked({ missing, extra });
    }
  };

  const toggle = (sq: Square) => {
    if (done) return;
    if (single) {
      setSelected([sq]);
      evaluate([sq]);
      return;
    }
    setChecked(null);
    setSelected((s) => (s.includes(sq) ? s.filter((x) => x !== sq) : [...s, sq]));
  };

  const highlights: BoardHighlight[] = [...(step.marks ?? [])];
  if (done) {
    for (const t of targets) highlights.push({ square: t, kind: "good" });
  } else if (checked) {
    for (const s of selected) highlights.push({ square: s, kind: checked.extra.includes(s) ? "bad" : "good" });
  }

  let feedback: Feedback = null;
  if (done === "solved") feedback = { tone: "success", title: "Correct!", text: single ? "That's the one." : `All ${targets.length} squares found.` };
  else if (done === "revealed") feedback = { tone: "info", title: "Answer shown", text: `The correct squares are highlighted: ${targets.join(", ")}.` };
  else if (checked) {
    const found = targets.length - checked.missing.length;
    const parts = [];
    if (single) parts.push(`That is ${selected[0]}, not the square we want.`);
    else {
      parts.push(`You found ${found} of ${targets.length}.`);
      if (checked.extra.length) parts.push(`${checked.extra.length === 1 ? "One square is" : `${checked.extra.length} squares are`} wrong (marked red). Click to remove ${checked.extra.length === 1 ? "it" : "them"}.`);
      if (checked.missing.length) parts.push(`${checked.missing.length} still missing.`);
    }
    feedback = { tone: "danger", title: "Not quite", text: parts.join(" ") };
  }

  return (
    <TrainerLayout
      above={<MobilePrompt text={step.prompt} />}
      board={
        <>
          <Chessboard fen={step.fen} orientation={orientation} onSquareSelect={toggle} selectedSquares={done ? [] : selected} highlights={highlights} label="Square selection board" testId="exercise-board" />
          <div className="mt-2 flex justify-end">
            <OrientationToggle orientation={orientation} onFlip={() => setOrientation((o) => (o === "w" ? "b" : "w"))} />
          </div>
        </>
      }
      panel={
        <PanelCard>
          {header}
          <RichText text={step.prompt} className="t-body font-medium text-fg" />
          {!single && !done && (
            <p className="t-small mt-1 text-muted">
              Selected: {selected.length ? selected.slice().sort().join(", ") : "none yet"}. Click a square again to deselect it.
            </p>
          )}
          <HintList hints={step.hints} shown={hintsShown} />
          <FeedbackView feedback={feedback} />
          {done && (
            <div className="animate-fade-in mt-3 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
              <p className="t-label mb-1 text-muted">Explanation</p>
              <RichText text={step.explanation} className="t-small text-fg" />
            </div>
          )}
          {!done && (
            <div className="mt-4 flex flex-wrap gap-2">
              {!single && (
                <Button size="sm" onClick={() => evaluate(selected)} disabled={selected.length === 0}>
                  Check answer
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => setHintsShown((h) => Math.min(step.hints.length, h + 1))} disabled={hintsShown >= step.hints.length} icon={<Lightbulb className="h-4 w-4" aria-hidden />}>
                Hint
              </Button>
              {(mistakes >= 2 || hintsShown >= step.hints.length) && (
                <Button variant="ghost" size="sm" onClick={() => complete(true)} icon={<Eye className="h-4 w-4" aria-hidden />}>
                  Show answer
                </Button>
              )}
            </div>
          )}
          <ContinueBar done={!!done} onContinue={onContinue} label={continueLabel} />
          {footer}
        </PanelCard>
      }
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Choice: multiple choice question

function ChoicePlayer({ step, onComplete, header, footer, onContinue, continueLabel }: StepPlayerProps & { step: ChoiceStep }) {
  const [picked, setPicked] = useState<number[]>([]);
  const [hintsShown, setHintsShown] = useState(0);
  const [solved, setSolved] = useState(false);
  const reported = useRef(false);
  const last = picked.at(-1);

  const choose = (i: number) => {
    if (solved || picked.includes(i)) return;
    const next = [...picked, i];
    setPicked(next);
    if (step.options[i].correct) {
      playSound("success");
      setSolved(true);
      if (!reported.current) {
        reported.current = true;
        onComplete({ stepId: step.id, solved: true, mistakes: next.length - 1, hintsUsed: hintsShown, revealed: false });
      }
    } else {
      playSound("error");
    }
  };

  const panel = (
    <PanelCard>
      {header}
      <h2 className="t-body font-semibold text-fg" id={`q-${step.id}`}>
        {step.question}
      </h2>
      <div role="group" aria-labelledby={`q-${step.id}`} className="mt-3 space-y-2">
        {step.options.map((o, i) => {
          const was = picked.includes(i);
          const isCorrect = o.correct;
          return (
            <button
              key={i}
              type="button"
              onClick={() => choose(i)}
              disabled={solved || was}
              aria-pressed={was}
              className={cn(
                "flex w-full items-start gap-3 rounded-[var(--radius-md)] border px-3.5 py-3 text-left text-[0.925rem] transition-colors",
                was && isCorrect && "border-success/50 bg-success-soft",
                was && !isCorrect && "border-danger/40 bg-danger-soft",
                !was && "border-border bg-surface hover:border-accent hover:bg-accent-soft/40",
                solved && !was && "opacity-60",
              )}
            >
              <span className="mt-0.5 shrink-0" aria-hidden>
                {was ? isCorrect ? <CheckCircle2 className="h-5 w-5 text-success" /> : <XCircle className="h-5 w-5 text-danger" /> : <span className="block h-5 w-5 rounded-full border-2 border-border-strong" />}
              </span>
              <span className="text-fg">
                {o.text}
                {was && <span className="sr-only">{isCorrect ? " (correct)" : " (incorrect)"}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {last !== undefined && (
        <FeedbackView
          feedback={{ tone: step.options[last].correct ? "success" : "danger", title: step.options[last].correct ? "Correct!" : "Not quite", text: step.options[last].feedback }}
        />
      )}
      {step.hints && !solved && (
        <>
          <HintList hints={step.hints} shown={hintsShown} />
          {hintsShown < step.hints.length && (
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => setHintsShown((h) => h + 1)} icon={<Lightbulb className="h-4 w-4" aria-hidden />}>
              Hint
            </Button>
          )}
        </>
      )}
      {solved && (
        <div className="animate-fade-in mt-3 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
          <p className="t-label mb-1 text-muted">Explanation</p>
          <RichText text={step.explanation} className="t-small text-fg" />
        </div>
      )}
      <ContinueBar done={solved} onContinue={onContinue} label={continueLabel} />
      {footer}
    </PanelCard>
  );

  if (!step.fen) return <div className="mx-auto max-w-2xl">{panel}</div>;
  return (
    <TrainerLayout
      board={<Chessboard fen={step.fen} orientation={step.orientation ?? "w"} movable="none" highlights={step.marks} arrows={step.arrows} label="Question board" />}
      panel={panel}
    />
  );
}
