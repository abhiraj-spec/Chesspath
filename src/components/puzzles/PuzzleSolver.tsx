"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { CheckCircle2, Eye, ExternalLink, FlipVertical2, Lightbulb, RotateCcw, SkipForward, XCircle, ChevronRight, Info } from "lucide-react";
import { Chessboard, type BoardHighlight, type BoardMove } from "@/components/board/Chessboard";
import { PanelCard, TrainerLayout } from "@/components/board/TrainerLayout";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge, Callout, DifficultyBadge } from "@/components/ui/primitives";
import { DIFFICULTY_LABELS, type Puzzle } from "@/content/puzzles";
import { checkPuzzleMove } from "@/lib/puzzles/solve";
import { colorName } from "@/lib/chess/core";
import { playMoveSound, playSound } from "@/lib/sound";
import { cn } from "@/lib/util";

export interface PuzzleOutcome {
  solved: boolean;
  mistakes: number;
  hintsUsed: number;
  revealed: boolean;
  skipped: boolean;
  durationMs: number;
}

type Status = "intro" | "solving" | "solved" | "revealed" | "skipped";

/**
 * One puzzle, start to finish. The opponent's last move is animated first, then the learner
 * plays the solution; incorrect moves are shown briefly and taken back, with graduated hints.
 */
export function PuzzleSolver({
  puzzle,
  onFinished,
  onNext,
  header,
  context,
}: {
  puzzle: Puzzle;
  onFinished: (o: PuzzleOutcome) => void;
  onNext: () => void;
  header?: React.ReactNode;
  context?: React.ReactNode;
}) {
  const [fen, setFen] = useState(puzzle.fen);
  const [ply, setPly] = useState(0);
  const [status, setStatus] = useState<Status>("intro");
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [hints, setHints] = useState(0);
  const [feedback, setFeedback] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const [badSquare, setBadSquare] = useState<Square | null>(null);
  const [locked, setLocked] = useState(true);
  const [orientation, setOrientation] = useState<"w" | "b">(puzzle.sideToMove);
  const startedAt = useRef(0);
  const reported = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Animate the opponent's setup move.
  useEffect(() => {
    later(() => {
      const c = new Chess(puzzle.fen);
      const m = c.move({ from: puzzle.setupMove.slice(0, 2), to: puzzle.setupMove.slice(2, 4), promotion: puzzle.setupMove[4] });
      playMoveSound(m.san);
      setFen(c.fen());
      setLastMove({ from: m.from, to: m.to });
      setStatus("solving");
      setLocked(false);
      startedAt.current = Date.now();
    }, 550);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const report = useCallback(
    (o: Omit<PuzzleOutcome, "durationMs">) => {
      if (reported.current) return;
      reported.current = true;
      onFinished({ ...o, durationMs: Date.now() - startedAt.current });
    },
    [onFinished],
  );

  const onMove = (mv: BoardMove) => {
    if (status !== "solving" || locked) return;
    const r = checkPuzzleMove(puzzle, ply, fen, mv);
    if (!r) return;
    if (r.correct) {
      setBadSquare(null);
      const c = new Chess(fen);
      const m = c.move(mv);
      playMoveSound(m.san);
      setFen(r.fenAfter);
      setLastMove({ from: m.from, to: m.to });
      if (r.finished) {
        playSound("success");
        setStatus("solved");
        setFeedback({ tone: "success", text: mistakes === 0 && hints === 0 ? `${r.san}! Solved on the first try.` : `${r.san}: solved.` });
        report({ solved: true, mistakes, hintsUsed: hints, revealed: false, skipped: false });
        return;
      }
      setFeedback({ tone: "success", text: `${r.san}: correct. Keep going…` });
      setLocked(true);
      later(() => {
        const c2 = new Chess(r.fenAfter);
        const reply = c2.move({ from: r.reply!.slice(0, 2), to: r.reply!.slice(2, 4), promotion: r.reply![4] });
        playMoveSound(reply.san);
        setFen(c2.fen());
        setLastMove({ from: reply.from, to: reply.to });
        setPly((p) => p + 2);
        setLocked(false);
        setFeedback({ tone: "info", text: `Your opponent replied ${reply.san}. Find the next move.` });
      }, 600);
      return;
    }
    // Wrong
    const n = mistakes + 1;
    setMistakes(n);
    playSound("error");
    const prevFen = fen;
    const prevLast = lastMove;
    const c = new Chess(fen);
    const m = c.move(mv);
    setFen(r.fenAfter);
    setLastMove({ from: m.from, to: m.to });
    setBadSquare(m.to);
    setLocked(true);
    const nudge =
      n === 1
        ? "Look at checks, captures and threats first."
        : n === 2
          ? `Here is an idea: ${puzzle.hints[0]}`
          : `Think about your ${puzzle.hints[1]?.replace(/^Consider a move with your /, "").replace(/\.$/, "") ?? "pieces"}. You can also reveal the solution.`;
    if (n === 2 && hints === 0) setHints(1);
    setFeedback({ tone: "danger", text: `${r.san} doesn't solve it. ${nudge}` });
    later(() => {
      setFen(prevFen);
      setLastMove(prevLast);
      setLocked(false);
    }, 900);
  };

  const reveal = () => {
    if (status !== "solving") return;
    setLocked(true);
    let c = new Chess(fen);
    let delay = 0;
    for (let i = ply; i < puzzle.solution.length; i++) {
      const u = puzzle.solution[i];
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      const f = c.fen();
      later(() => {
        setFen(f);
        setLastMove({ from: m.from, to: m.to });
        playMoveSound(m.san);
      }, delay);
      delay += 750;
      c = new Chess(f);
    }
    later(() => {
      setStatus("revealed");
      setFeedback({ tone: "info", text: "Here is the solution. This puzzle has been added to your review queue." });
      report({ solved: false, mistakes, hintsUsed: hints, revealed: true, skipped: false });
    }, delay);
  };

  const skip = () => {
    if (status !== "solving" && status !== "intro") return;
    setStatus("skipped");
    report({ solved: false, mistakes, hintsUsed: hints, revealed: false, skipped: true });
    onNext();
  };

  const restart = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const c = new Chess(puzzle.fen);
    const m = c.move({ from: puzzle.setupMove.slice(0, 2), to: puzzle.setupMove.slice(2, 4), promotion: puzzle.setupMove[4] });
    setFen(c.fen());
    setLastMove({ from: m.from, to: m.to });
    setPly(0);
    setBadSquare(null);
    setLocked(false);
    setFeedback(null);
    if (status !== "solving") setStatus("solving");
  };

  const done = status === "solved" || status === "revealed";
  const highlights: BoardHighlight[] = [];
  if (badSquare) highlights.push({ square: badSquare, kind: "bad" });
  if (hints >= 3 && status === "solving") highlights.push({ square: puzzle.hintSquare as Square, kind: "hint" });
  const sideName = colorName(puzzle.sideToMove);

  return (
    <TrainerLayout
      board={
        <>
          <Chessboard fen={fen} orientation={orientation} movable={done || locked ? "none" : puzzle.sideToMove} onMove={onMove} lastMove={lastMove} highlights={highlights} label="Puzzle board" testId="puzzle-board" />
          <div className="mt-2 flex items-center justify-between">
            <p className="t-small text-muted">{done ? "" : status === "intro" ? "Watch your opponent's move…" : `${sideName} to move`}</p>
            <IconButton label="Flip board" size="sm" onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}>
              <FlipVertical2 className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
        </>
      }
      panel={
        <PanelCard>
          {header}
          <div className="flex flex-wrap items-center gap-2">
            <DifficultyBadge level={puzzle.difficulty} label={`${DIFFICULTY_LABELS[puzzle.difficulty].name}: ${DIFFICULTY_LABELS[puzzle.difficulty].description}`} />
            {(done || hints > 0) && <Badge tone="accent">{puzzle.themeName}</Badge>}
          </div>
          <h2 className="t-section mt-3">
            {done ? (status === "solved" ? "Solved" : "Solution") : `Find the best move for ${sideName}`}
          </h2>
          {!done && (
            <p className="t-small mt-1 text-muted">
              {puzzle.solverMoves > 1 ? `The solution is ${puzzle.solverMoves} moves long. Your opponent's replies are played automatically.` : "One precise move solves it."}
            </p>
          )}
          {context}
          {hints > 0 && !done && (
            <ol className="mt-3 space-y-1.5" aria-label="Hints">
              {puzzle.hints.slice(0, hints).map((h, i) => (
                <li key={i} className="t-small flex gap-2 rounded-[var(--radius-sm)] bg-warning-soft px-3 py-2 text-fg">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                  {h}
                </li>
              ))}
              {hints >= 3 && <li className="t-small rounded-[var(--radius-sm)] bg-warning-soft px-3 py-2 text-fg">The piece to move is highlighted on the board.</li>}
            </ol>
          )}
          {feedback && (
            <div aria-live="polite" className="mt-3">
              <Callout
                tone={feedback.tone}
                icon={
                  feedback.tone === "success" ? <CheckCircle2 className="h-5 w-5 text-success" aria-hidden /> : feedback.tone === "danger" ? <XCircle className="h-5 w-5 text-danger" aria-hidden /> : <Info className="h-5 w-5 text-info" aria-hidden />
                }
              >
                {feedback.text}
              </Callout>
            </div>
          )}
          {done && (
            <div className="animate-fade-in mt-3 space-y-3">
              <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
                <p className="t-label mb-1 text-muted">Explanation</p>
                <p className="t-small text-fg">{puzzle.explanation}</p>
                <p className="t-notation mt-2 text-fg">{puzzle.line}</p>
              </div>
              <p className="t-small text-subtle">
                {puzzle.attribution.split(", from")[0]}.{" "}
                <a href={puzzle.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline hover:text-fg">
                  View on Lichess <ExternalLink className="h-3 w-3" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </p>
            </div>
          )}
          <div className={cn("mt-4 flex flex-wrap gap-2", done && "hidden")}>
            <Button variant="secondary" size="sm" disabled={status !== "solving" || hints >= 3} onClick={() => setHints((h) => Math.min(3, h + 1))} icon={<Lightbulb className="h-4 w-4" aria-hidden />}>
              {hints === 0 ? "Hint" : hints < 3 ? "More help" : "All hints shown"}
            </Button>
            <Button variant="ghost" size="sm" disabled={status !== "solving" || (ply === 0 && mistakes === 0)} onClick={restart} icon={<RotateCcw className="h-4 w-4" aria-hidden />}>
              Restart
            </Button>
            <Button variant="ghost" size="sm" disabled={status !== "solving"} onClick={reveal} icon={<Eye className="h-4 w-4" aria-hidden />}>
              Show solution
            </Button>
            <Button variant="ghost" size="sm" onClick={skip} icon={<SkipForward className="h-4 w-4" aria-hidden />} title="Skipped puzzles are recorded as skipped: they don't count as failures and aren't added to reviews.">
              Skip
            </Button>
          </div>
          {!done && <p className="t-small mt-2 text-subtle">Skipping doesn&apos;t count as a miss; showing the solution adds the puzzle to your reviews.</p>}
          {done && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="lg" className="flex-1" onClick={onNext} icon={<ChevronRight className="h-5 w-5" aria-hidden />} autoFocus>
                Next puzzle
              </Button>
              <Button variant="secondary" size="lg" onClick={restart} icon={<RotateCcw className="h-4 w-4" aria-hidden />}>
                Replay
              </Button>
            </div>
          )}
        </PanelCard>
      }
    />
  );
}
