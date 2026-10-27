"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Lightbulb, RotateCcw, Loader2, AlertTriangle, FlipVertical2 } from "lucide-react";
import { Chessboard, type BoardMove } from "@/components/board/Chessboard";
import { PanelCard, TrainerLayout } from "@/components/board/TrainerLayout";
import { Button, IconButton } from "@/components/ui/Button";
import { Callout } from "@/components/ui/primitives";
import type { GoalStep } from "@/content/types";
import { colorName, turnOf } from "@/lib/chess/core";
import { useEngine } from "@/hooks/useEngine";
import { playMoveSound, playSound } from "@/lib/sound";
import { RichText } from "./RichText";
import { ContinueBar, type StepPlayerProps } from "./StepPlayer";
import { EngineError } from "@/lib/engine/client";

type GoalStatus = "playing" | "won" | "failed";

/**
 * Plays a position out against Stockfish and checks the real outcome:
 *  - checkmate: the learner must deliver mate within maxMoves;
 *  - promote: the learner must promote a pawn that cannot be captured immediately;
 *  - hold-draw: the opponent must not promote or mate within maxMoves (a draw by rule also succeeds).
 */
export function evaluateGoal(
  goal: GoalStep["goal"],
  chess: Chess,
  lastMove: { color: "w" | "b"; promotion?: string; to: Square } | null,
  userColor: "w" | "b",
  userMoves: number,
  maxMoves: number,
): { status: GoalStatus; message?: string } {
  const opp = userColor === "w" ? "b" : "w";
  if (chess.isCheckmate()) {
    return chess.turn() === opp
      ? goal === "checkmate" || goal === "hold-draw"
        ? { status: "won", message: "Checkmate! Goal achieved." }
        : { status: "won", message: "Checkmate!" }
      : { status: "failed", message: "You were checkmated." };
  }
  if (chess.isStalemate()) return goal === "hold-draw" ? { status: "won", message: "Stalemate: a draw. You held." } : { status: "failed", message: "Stalemate! The game is drawn. Leave the king a square until you can mate." };
  if (chess.isDraw()) {
    return goal === "hold-draw" ? { status: "won", message: "The game is drawn. You held the position." } : { status: "failed", message: "The game ended in a draw." };
  }
  if (lastMove?.promotion) {
    if (lastMove.color === userColor && goal === "promote") {
      const attacked = chess.isAttacked(lastMove.to, opp);
      const defended = chess.attackers(lastMove.to, userColor).length > 0;
      if (attacked && !defended) return { status: "failed", message: "You promoted, but the new piece can be captured immediately." };
      return { status: "won", message: "Promoted, and the new piece is safe. Goal achieved." };
    }
    if (lastMove.color === opp && goal === "hold-draw") return { status: "failed", message: "Your opponent promoted the pawn." };
  }
  if (lastMove?.color === userColor && userMoves >= maxMoves) {
    return goal === "hold-draw" ? { status: "won", message: `You held for ${maxMoves} moves without letting the pawn through.` } : { status: "failed", message: `Out of moves: the goal was not reached within ${maxMoves} moves.` };
  }
  return { status: "playing" };
}

export function GoalPlayer({ step, onComplete, header, footer, onContinue, continueLabel }: StepPlayerProps & { step: GoalStep }) {
  const userColor = turnOf(step.fen);
  const { engine, status: engineStatus, restart } = useEngine();
  const [fen, setFen] = useState(step.fen);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [userMoves, setUserMoves] = useState(0);
  const [status, setStatus] = useState<GoalStatus>("playing");
  const [message, setMessage] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);
  const [hintsShown, setHintsShown] = useState(0);
  const [orientation, setOrientation] = useState<"w" | "b">(userColor);
  const reported = useRef(false);
  const [reportedState, setReportedState] = useState(false);
  const history = useRef<string[]>([]);
  const gen = useRef(0);

  useEffect(() => () => engine.cancelAll(), [engine]);

  const chessFromHistory = useCallback(() => {
    const c = new Chess(step.fen);
    for (const m of history.current) c.move(m);
    return c;
  }, [step.fen]);

  const conclude = (s: GoalStatus, msg?: string) => {
    setStatus(s);
    setMessage(msg ?? null);
    if (s === "won") {
      playSound("success");
      if (!reported.current) {
        reported.current = true;
        setReportedState(true);
        onComplete({ stepId: step.id, solved: true, mistakes: failures, hintsUsed: hintsShown, revealed: false });
      }
    } else {
      playSound("error");
      setFailures((f) => f + 1);
    }
  };

  const engineReply = useCallback(
    async (myGen: number, movesSoFar: number) => {
      setThinking(true);
      setEngineError(null);
      try {
        const c = chessFromHistory();
        const res = await engine.analyse({ fen: c.fen(), depth: 12 });
        if (myGen !== gen.current) return; // position was reset meanwhile
        if (!res.bestMove) return;
        const m = c.move({ from: res.bestMove.slice(0, 2), to: res.bestMove.slice(2, 4), promotion: res.bestMove[4] });
        history.current.push(m.san);
        playMoveSound(m.san);
        setFen(c.fen());
        setLastMove({ from: m.from, to: m.to });
        const ev = evaluateGoal(step.goal, c, { color: m.color, promotion: m.promotion, to: m.to }, userColor, movesSoFar, step.maxMoves);
        if (ev.status !== "playing") conclude(ev.status, ev.message);
      } catch (e) {
        if (myGen !== gen.current) return;
        if (e instanceof EngineError && e.kind === "cancelled") return;
        setEngineError(e instanceof Error ? e.message : "The engine is unavailable.");
      } finally {
        if (myGen === gen.current) setThinking(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, step, userColor],
  );

  const onMove = (mv: BoardMove) => {
    if (status !== "playing" || thinking) return;
    const c = chessFromHistory();
    let m;
    try {
      m = c.move(mv);
    } catch {
      return;
    }
    history.current.push(m.san);
    playMoveSound(m.san);
    const moves = userMoves + 1;
    setUserMoves(moves);
    setFen(c.fen());
    setLastMove({ from: m.from, to: m.to });
    const ev = evaluateGoal(step.goal, c, { color: m.color, promotion: m.promotion, to: m.to }, userColor, moves, step.maxMoves);
    if (ev.status !== "playing") {
      conclude(ev.status, ev.message);
      return;
    }
    void engineReply(gen.current, moves);
  };

  const reset = () => {
    gen.current++;
    engine.cancelAll();
    history.current = [];
    setFen(step.fen);
    setLastMove(null);
    setUserMoves(0);
    setThinking(false);
    setMessage(null);
    if (status !== "won") setStatus("playing");
    else setStatus("playing");
  };

  const retryEngine = async () => {
    setEngineError(null);
    await restart();
    if (engine.status === "ready") void engineReply(gen.current, userMoves);
  };

  const goalLabel = step.goal === "checkmate" ? "Deliver checkmate" : step.goal === "promote" ? "Promote a pawn safely" : "Stop the opponent's pawn";
  const won = status === "won";

  return (
    <TrainerLayout
      board={
        <>
          <Chessboard fen={fen} orientation={orientation} movable={status === "playing" && !thinking && !engineError ? userColor : "none"} onMove={onMove} lastMove={lastMove} label="Endgame practice board" testId="exercise-board" />
          <div className="mt-2 flex justify-end">
            <IconButton label="Flip board" size="sm" onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}>
              <FlipVertical2 className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
        </>
      }
      panel={
        <PanelCard>
          {header}
          <p className="t-small mb-2 text-muted">
            You play {colorName(userColor)} against Stockfish · {goalLabel}
          </p>
          <RichText text={step.prompt} className="t-body font-medium text-fg" />
          <div className="mt-3 flex items-center justify-between rounded-[var(--radius-md)] bg-surface-2 px-3 py-2">
            <span className="t-small text-muted">Your moves</span>
            <span className="t-small font-semibold tabular text-fg">
              {userMoves} / {step.maxMoves}
            </span>
          </div>
          <p className="t-small mt-2 flex min-h-5 items-center gap-2 text-muted" aria-live="polite">
            {engineStatus === "loading" && (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading the engine…
              </>
            )}
            {thinking && status === "playing" && (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Stockfish is thinking…
              </>
            )}
          </p>
          {engineError && (
            <Callout tone="danger" icon={<AlertTriangle className="h-5 w-5 text-danger" aria-hidden />} title="The engine stopped working" className="mt-2">
              <p className="t-small">{engineError} Your position is kept.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={retryEngine}>
                  Restart engine
                </Button>
                {!reportedState && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      reported.current = true;
                      setReportedState(true);
                      onComplete({ stepId: step.id, solved: false, mistakes: failures, hintsUsed: hintsShown, revealed: true });
                      onContinue?.();
                    }}
                  >
                    Skip this exercise
                  </Button>
                )}
              </div>
            </Callout>
          )}
          {message && (
            <Callout tone={won ? "success" : "danger"} title={won ? "Goal achieved" : "Not this time"} className="mt-2" live>
              {message}
            </Callout>
          )}
          {won && (
            <div className="animate-fade-in mt-3 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
              <p className="t-label mb-1 text-muted">Takeaway</p>
              <RichText text={step.explanation} className="t-small text-fg" />
            </div>
          )}
          {hintsShown > 0 && (
            <ol className="mt-3 space-y-1.5">
              {step.hints.slice(0, hintsShown).map((h, i) => (
                <li key={i} className="t-small flex gap-2 rounded-[var(--radius-sm)] bg-warning-soft px-3 py-2">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                  {h}
                </li>
              ))}
            </ol>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {!won && (
              <Button variant="secondary" size="sm" disabled={hintsShown >= step.hints.length} onClick={() => setHintsShown((h) => h + 1)} icon={<Lightbulb className="h-4 w-4" aria-hidden />}>
                Hint
              </Button>
            )}
            <Button variant={status === "failed" ? "primary" : "ghost"} size="sm" onClick={reset} icon={<RotateCcw className="h-4 w-4" aria-hidden />}>
              {status === "failed" ? "Try again" : "Restart position"}
            </Button>
          </div>
          <ContinueBar done={won} onContinue={onContinue} label={continueLabel} />
          {footer}
        </PanelCard>
      }
    />
  );
}
