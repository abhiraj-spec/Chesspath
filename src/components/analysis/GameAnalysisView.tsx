"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { AlertTriangle, ArrowLeft, FlipVertical2, Info, Loader2, Play, Square as StopIcon, Undo2, BookOpen, Puzzle } from "lucide-react";
import { useAnalysis, useGame } from "@/hooks/data";
import { buildLine, fenAt, playAt, type Line } from "@/lib/chess/line";
import { Chessboard, type BoardArrow, type BoardMove } from "@/components/board/Chessboard";
import { CLASS_STYLE, MoveList, useMoveKeys } from "@/components/board/MoveList";
import { EvalBar, displayScore } from "@/components/board/EvalBar";
import { EvalGraph } from "./EvalGraph";
import { PanelCard } from "@/components/board/TrainerLayout";
import { Badge, Callout, EmptyState, PageSkeleton, ProgressBar, Segmented, Select } from "@/components/ui/primitives";
import { Button, ButtonLink, IconButton } from "@/components/ui/Button";
import { useEngine } from "@/hooks/useEngine";
import { useActivityTimer } from "@/hooks/useActivityTimer";
import { runAnalysis } from "@/lib/analysis/runner";
import { buildReport } from "@/lib/analysis/report";
import { saveAnalysis } from "@/lib/db/repo";
import { describeResult } from "@/lib/chess/status";
import type { AnalysisLine } from "@/lib/engine/client";
import { EngineError } from "@/lib/engine/client";
import type { MoveClass, MoveEvaluation } from "@/lib/db/types";
import { useSettings } from "@/lib/settings";
import { uciLineToSan } from "@/lib/analysis/classify";
import { formatScore } from "@/lib/engine/uci";
import { getLesson } from "@/content/lessons";
import { skillInfo } from "@/content/skills";
import { cn } from "@/lib/util";
import type { Square } from "chess.js";

const DEPTHS = [
  { value: "10", label: "Quick (depth 10)" },
  { value: "13", label: "Standard (depth 13)" },
  { value: "16", label: "Deep (depth 16, slower)" },
];

type Tab = "summary" | "moments" | "engine";

export function GameAnalysisView({ gameId }: { gameId: string }) {
  const game = useGame(gameId);
  const analysis = useAnalysis(gameId);
  const settings = useSettings();
  const { engine, restart } = useEngine(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [variation, setVariation] = useState<{ base: number; line: Line; cursor: number } | null>(null);
  const [orientation, setOrientation] = useState<"w" | "b" | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [depth, setDepth] = useState("13");
  const [tab, setTab] = useState<Tab>("summary");
  const [showBest, setShowBest] = useState(true);
  const cancelRef = useRef(false);

  useActivityTimer("analysis", gameId);
  useEffect(
    () => () => {
      cancelRef.current = true;
      engine.cancelAll();
    },
    [engine],
  );

  const line = useMemo(() => (game ? buildLine(game.startingFen, game.moves).line : null), [game]);
  const total = line?.plies.length ?? 0;
  const mainCursor = cursor ?? total;
  const userColor = game?.computer?.userColor ?? game?.userColor ?? null;
  const boardOrientation = orientation ?? userColor ?? "w";

  const evalsByPly = useMemo(() => new Map((analysis?.moveEvaluations ?? []).map((e) => [e.ply, e])), [analysis]);
  // Classifications are only shown once the analysis (including verification of mistakes) is complete.
  const classes = useMemo(() => (analysis?.complete ? new Map<number, MoveClass>([...evalsByPly.values()].map((e) => [e.ply, e.classification])) : new Map<number, MoveClass>()), [evalsByPly, analysis]);
  const report = useMemo(
    () => (analysis && analysis.complete && analysis.moveEvaluations.length ? buildReport({ evals: analysis.moveEvaluations, result: game?.result ?? "*", userColor, opening: analysis.opening }) : null),
    [analysis, game, userColor],
  );

  const select = useCallback((p: number) => {
    setVariation(null);
    setCursor(p);
  }, []);
  useMoveKeys(Boolean(line) && !variation, mainCursor, total, select);

  const start = async () => {
    if (!game) return;
    setRunError(null);
    setRunning(true);
    cancelRef.current = false;
    try {
      await runAnalysis({
        game,
        engine,
        depth: Number(depth),
        existing: analysis,
        save: saveAnalysis,
        isCancelled: () => cancelRef.current,
        onProgress: (done, t) => setProgress({ done, total: t }),
      });
    } catch (e) {
      if (!(e instanceof EngineError && e.kind === "cancelled")) setRunError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const stop = () => {
    cancelRef.current = true;
    engine.cancelAll();
  };

  if (game === undefined || analysis === undefined) return <PageSkeleton />;
  if (game === null || !line)
    return (
      <EmptyState
        title="Game not found"
        description="It may have been deleted, or it was saved in another browser."
        action={<ButtonLink href="/analysis/">Back to your games</ButtonLink>}
      />
    );

  // Board position: main line or temporary variation.
  const boardFen = variation ? fenAt(variation.line, variation.cursor) : fenAt(line, mainCursor);
  const lastPly = variation ? (variation.cursor > 0 ? variation.line.plies[variation.cursor - 1] : mainCursor > 0 ? line.plies[variation.base - 1] : undefined) : mainCursor > 0 ? line.plies[mainCursor - 1] : undefined;
  const nextEval = !variation ? evalsByPly.get(mainCursor + 1) : undefined; // the move about to be played from this position
  const currentEval = !variation ? (mainCursor === 0 ? evalsByPly.get(1)?.before : evalsByPly.get(mainCursor)?.after) : undefined;
  const arrows: BoardArrow[] = [];
  if (showBest && nextEval && !variation && analysis?.complete) {
    if (nextEval.bestMove && nextEval.bestMove !== nextEval.uci) arrows.push({ from: nextEval.bestMove.slice(0, 2) as Square, to: nextEval.bestMove.slice(2, 4) as Square, kind: "main" });
    if (["inaccuracy", "mistake", "blunder"].includes(nextEval.classification)) arrows.push({ from: nextEval.uci.slice(0, 2) as Square, to: nextEval.uci.slice(2, 4) as Square, kind: "bad" });
  }

  const onBoardMove = (mv: BoardMove) => {
    if (variation) {
      const r = playAt(variation.line, variation.cursor, mv);
      if (r) setVariation({ ...variation, line: r.line, cursor: variation.cursor + 1 });
      return;
    }
    const next = line.plies[mainCursor];
    if (next && next.from === mv.from && next.to === mv.to && (next.promotion ?? undefined) === (mv.promotion ?? undefined)) {
      setCursor(mainCursor + 1);
      return;
    }
    const base = buildLine(fenAt(line, mainCursor), []).line;
    const r = playAt(base, 0, mv);
    if (r) setVariation({ base: mainCursor, line: r.line, cursor: 1 });
  };

  const complete = analysis?.complete;
  const partial = analysis && !analysis.complete;

  return (
    <div>
      <Link href="/analysis/" className="t-small mb-3 inline-flex items-center gap-1.5 font-medium text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All games
      </Link>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="t-section">
          {game.whitePlayer} vs {game.blackPlayer}
        </h1>
        <p className="t-small text-muted">
          {game.result === "*" ? (game.status === "in-progress" ? "Game in progress" : "Unfinished game") : describeResult(game.result, game.terminalReason)}
          {analysis?.opening && ` · ${analysis.opening.eco} ${analysis.opening.name}`}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] lg:items-start">
        <div className="min-w-0">
          <div className="mx-auto flex w-full max-w-[min(100%,calc(100dvh-10rem))] gap-2 lg:max-w-[min(100%,calc(100dvh-8rem))]">
            {settings.showEvalBar && complete !== undefined && (
              <div className="py-0.5">
                <EvalBar score={currentEval} orientation={boardOrientation} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <Chessboard fen={boardFen} orientation={boardOrientation} movable="both" onMove={onBoardMove} lastMove={lastPly ? { from: lastPly.from, to: lastPly.to } : null} arrows={arrows} label="Analysis board" testId="analysis-board" />
            </div>
          </div>
          <div className="mx-auto mt-2 flex max-w-[min(100%,calc(100dvh-8rem))] flex-wrap items-center justify-between gap-2">
            <p className="t-small text-muted">
              {variation ? (
                <>Exploring a variation. The saved game is unchanged.</>
              ) : currentEval ? (
                <>
                  Evaluation: <span className="t-notation font-semibold text-fg">{displayScore(currentEval)}</span> <span className="text-subtle">(+ favours White, − favours Black)</span>
                </>
              ) : (
                "Make any move on the board to explore a variation."
              )}
            </p>
            <div className="flex items-center gap-1">
              {analysis && (
                <label className="t-small inline-flex items-center gap-1.5 text-muted">
                  <input type="checkbox" checked={showBest} onChange={(e) => setShowBest(e.target.checked)} className="accent-[var(--accent)]" />
                  Show arrows
                </label>
              )}
              <IconButton label="Flip board" size="sm" onClick={() => setOrientation(boardOrientation === "w" ? "b" : "w")}>
                <FlipVertical2 className="h-4 w-4" aria-hidden />
              </IconButton>
            </div>
          </div>
          {analysis && analysis.moveEvaluations.length > 0 && (
            <div className="mx-auto mt-4 max-w-[min(100%,calc(100dvh-8rem))]">
              <EvalGraph evals={analysis.moveEvaluations} cursor={mainCursor} onSelect={select} />
            </div>
          )}
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-6">
          <PanelCard>
            {variation ? (
              <div>
                <div className="flex items-center justify-between">
                  <p className="t-card">Variation from move {Math.ceil((variation.base + 1) / 2)}</p>
                  <Button size="sm" variant="secondary" onClick={() => setVariation(null)} icon={<Undo2 className="h-4 w-4" aria-hidden />}>
                    Return to game
                  </Button>
                </div>
                <MoveList line={variation.line} cursor={variation.cursor} onSelect={(p) => setVariation({ ...variation, cursor: p })} className="mt-3" />
              </div>
            ) : (
              <MoveList line={line} cursor={mainCursor} onSelect={select} classes={classes} />
            )}
            {nextEval && !variation && analysis?.complete && <MoveDetail e={nextEval} />}
          </PanelCard>

          {/* Analysis controls */}
          {!complete && (
            <PanelCard>
              <h2 className="t-card">{partial ? "Analysis partly done" : "Analyse this game"}</h2>
              <p className="t-small mt-1 text-muted">
                Stockfish evaluates every position on your device. A {total}-ply game takes roughly {Math.max(10, Math.round(total * (depth === "10" ? 0.15 : depth === "13" ? 0.35 : 0.9)))} seconds. You can keep browsing the moves while it runs, and progress is saved if you leave.
              </p>
              {!running && (
                <div className="mt-3 sm:w-64">
                  <Select label="Depth" value={depth} onChange={setDepth} options={DEPTHS} />
                </div>
              )}
              {running && progress && progress.done >= progress.total && (
                <p className="t-small mt-3 text-muted" aria-live="polite">
                  Double-checking possible mistakes at a greater depth before reporting them…
                </p>
              )}
              {running && progress && progress.done < progress.total && (
                <div className="mt-3" aria-live="polite">
                  <ProgressBar value={progress.done} max={progress.total} label="Analysis progress" />
                  <p className="t-small mt-1 text-muted tabular">
                    Position {progress.done} of {progress.total}
                  </p>
                </div>
              )}
              {runError && (
                <Callout tone="danger" className="mt-3" icon={<AlertTriangle className="h-5 w-5 text-danger" aria-hidden />} title="Analysis stopped">
                  <p className="t-small">{runError} Results so far are saved.</p>
                  <Button
                    size="sm"
                    className="mt-2"
                    onClick={async () => {
                      await restart();
                      void start();
                    }}
                  >
                    Restart engine and continue
                  </Button>
                </Callout>
              )}
              <div className="mt-4 flex gap-2">
                {running ? (
                  <Button variant="secondary" onClick={stop} icon={<StopIcon className="h-4 w-4" aria-hidden />}>
                    Stop
                  </Button>
                ) : (
                  <Button onClick={start} icon={<Play className="h-4 w-4" aria-hidden />}>
                    {partial ? "Continue analysis" : "Start analysis"}
                  </Button>
                )}
              </div>
            </PanelCard>
          )}

          {analysis && report && (
            <PanelCard>
              <Segmented
                label="Analysis detail"
                size="sm"
                value={tab}
                onChange={setTab}
                options={[
                  { value: "summary", label: "Summary" },
                  { value: "moments", label: `Key moments (${report.keyMoments.length})` },
                  { value: "engine", label: "Engine" },
                ]}
              />
              <div className="mt-4">
                {tab === "summary" && <SummaryTab analysisDepth={analysis.analysisSettings.depth} complete={Boolean(complete)} report={report} accuracy={analysis.accuracy} userColor={userColor} />}
                {tab === "moments" && (
                  <KeyMoments
                    moments={report.keyMoments}
                    onGo={(ply) => {
                      setVariation(null);
                      setCursor(ply - 1);
                      setShowBest(true);
                    }}
                  />
                )}
                {tab === "engine" &&
                  (running ? (
                    <p className="t-small text-muted">Live analysis is paused while the full game analysis runs (they share the engine).</p>
                  ) : (
                    <EngineTab key={boardFen} fen={boardFen} evals={analysis.moveEvaluations} depth={analysis.analysisSettings.depth} />
                  ))}
              </div>
            </PanelCard>
          )}
        </aside>
      </div>
    </div>
  );
}

function MoveDetail({ e }: { e: MoveEvaluation }) {
  const style = CLASS_STYLE[e.classification];
  return (
    <div className="mt-4 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
      <p className="t-small text-muted">
        Next move: <span className="t-notation font-semibold text-fg">{e.san}</span>{" "}
        <Badge tone={e.classification === "blunder" ? "danger" : e.classification === "mistake" ? "warning" : e.classification === "inaccuracy" ? "warning" : e.classification === "book" ? "neutral" : "success"}>{style.label}</Badge>
      </p>
      {e.bestSan && e.bestSan !== e.san && e.classification !== "book" && (
        <p className="t-small mt-1 text-muted">
          Engine preferred <span className="t-notation font-semibold text-fg">{e.bestSan}</span> (green arrow).
        </p>
      )}
    </div>
  );
}

function SummaryTab({
  report,
  accuracy,
  userColor,
  complete,
  analysisDepth,
}: {
  report: NonNullable<ReturnType<typeof buildReport>>;
  accuracy?: { w: number; b: number };
  userColor: "w" | "b" | null;
  complete: boolean;
  analysisDepth: number;
}) {
  return (
    <div className="space-y-4">
      {!complete && <Callout tone="warning">This summary covers only the moves analysed so far.</Callout>}
      <p className="t-body text-fg">{report.summary}</p>
      {accuracy && (
        <div className="grid grid-cols-2 gap-2">
          {(["w", "b"] as const).map((c) => (
            <div key={c} className={cn("rounded-[var(--radius-md)] border p-3", userColor === c ? "border-accent/40 bg-accent-soft/40" : "border-border")}>
              <p className="t-small text-muted">
                {c === "w" ? "White" : "Black"}
                {userColor === c ? " (you)" : ""}
              </p>
              <p className="t-stat">{accuracy[c].toFixed(0)}%</p>
              <p className="t-small text-subtle">approx. accuracy</p>
            </div>
          ))}
        </div>
      )}
      <div>
        <h3 className="t-label mb-2 text-muted">By phase</h3>
        <ul className="space-y-2">
          {report.phases.map((p) => (
            <li key={p.phase} className="t-small">
              <span className="font-semibold text-fg">{p.phase}: </span>
              <span className="text-muted">{p.text}</span>
            </li>
          ))}
        </ul>
      </div>
      {report.recommendations.length > 0 && (
        <div>
          <h3 className="t-label mb-2 text-muted">Recommended training</h3>
          <ul className="space-y-2">
            {report.recommendations.map((r) => {
              const href = r.kind === "lesson" ? `/learn/${r.ref}/` : `/puzzles/?theme=${r.ref}`;
              const title = r.kind === "lesson" ? `Lesson: ${getLesson(r.ref)?.title ?? r.ref}` : `Puzzles: ${skillInfo(r.ref).name}`;
              const Icon = r.kind === "lesson" ? BookOpen : Puzzle;
              return (
                <li key={`${r.kind}-${r.ref}`}>
                  <Link href={href} className="flex gap-2 rounded-[var(--radius-md)] border border-border p-2.5 hover:border-accent/50">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                    <span>
                      <span className="t-small block font-medium text-fg">{title}</span>
                      <span className="t-small block text-muted">{r.reason}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div>
        <h3 className="t-label mb-2 text-muted">Your improvement plan</h3>
        <ul className="list-disc space-y-1 pl-5">
          {report.plan.map((p, i) => (
            <li key={i} className="t-small text-fg">
              {p}
            </li>
          ))}
        </ul>
      </div>
      <p className="t-small flex gap-1.5 text-subtle">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Based on Stockfish 19 (lite) at depth {analysisDepth}. Shallow analysis can misjudge complex positions; treat it as guidance, not proof. Accuracy is an informal measure, not a rating.
      </p>
    </div>
  );
}

function KeyMoments({ moments, onGo }: { moments: MoveEvaluation[]; onGo: (ply: number) => void }) {
  if (moments.length === 0) return <p className="t-body text-muted">No mistakes or blunders were found for this side at this depth.</p>;
  return (
    <ol className="space-y-3">
      {moments.map((m) => (
        <li key={m.ply} className="rounded-[var(--radius-md)] border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="t-notation font-semibold">
              {Number(m.fenBefore.split(" ")[5])}
              {m.color === "w" ? "." : "..."} {m.san}
              <span className={cn("ml-1", CLASS_STYLE[m.classification].className)}>{CLASS_STYLE[m.classification].symbol}</span>
            </span>
            <Button size="sm" variant="secondary" onClick={() => onGo(m.ply)}>
              Show on board
            </Button>
          </div>
          <p className="t-small mt-2 text-fg">{m.explanation}</p>
        </li>
      ))}
    </ol>
  );
}

/** Live multi-line engine analysis of whatever position is on the board. */
function EngineTab({ fen, evals, depth }: { fen: string; evals: MoveEvaluation[]; depth: number }) {
  const { engine, status } = useEngine(true);
  // Keyed by FEN in the parent, so state starts fresh for every position.
  const [lines, setLines] = useState<AnalysisLine[]>([]);
  const [final, setFinal] = useState(() => new Chess(fen).isGameOver());
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (new Chess(fen).isGameOver()) return;
    engine
      .analyse({ fen, depth: 18, multipv: 3, onUpdate: (l) => alive && setLines(l) })
      .then((r) => {
        if (!alive) return;
        setLines(r.lines);
        setFinal(true);
      })
      .catch((e) => {
        if (alive && !(e instanceof EngineError && e.kind === "cancelled")) setErr(e instanceof Error ? e.message : "Engine error");
      });
    return () => {
      alive = false;
      engine.cancelAll();
    };
  }, [fen, engine]);
  const mistakes = evals.filter((e) => e.classification === "inaccuracy" || e.classification === "mistake" || e.classification === "blunder");
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="t-label text-muted">Live analysis of the board position</h3>
          <span className="t-small text-subtle" aria-live="polite">
            {status === "loading" ? "loading engine…" : final ? `depth ${lines[0]?.depth ?? "–"} · final` : lines[0] ? `depth ${lines[0].depth} · searching…` : ""}
          </span>
        </div>
        {err && <p className="t-small mt-2 text-danger">{err}</p>}
        {new Chess(fen).isGameOver() ? (
          <p className="t-small mt-2 text-muted">The game is over in this position.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {lines.map((l) => (
              <li key={l.multipv} className="flex gap-2 rounded-[var(--radius-sm)] bg-surface-2 px-2 py-1.5">
                <span className="t-notation w-14 shrink-0 font-semibold">{l.score.mate !== undefined ? `#${l.score.mate}` : formatScore(l.score)}</span>
                <span className="t-notation min-w-0 truncate text-muted" title={uciLineToSan(fen, l.pv, 12).join(" ")}>
                  {uciLineToSan(fen, l.pv, 8).join(" ")}
                </span>
              </li>
            ))}
            {!lines.length && !err && (
              <li className="t-small flex items-center gap-2 text-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Calculating…
              </li>
            )}
          </ul>
        )}
        <p className="t-small mt-2 text-subtle">Scores are in pawns from White&apos;s point of view: +1.00 ≈ White a pawn better. “#3” means mate in 3 (negative: Black mates). Lines marked “searching” are preliminary.</p>
      </div>
      <div>
        <h3 className="t-label mb-2 text-muted">Inaccuracies, mistakes and blunders (depth {depth})</h3>
        {mistakes.length === 0 ? (
          <p className="t-small text-muted">None found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="t-small w-full text-left">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-2 font-medium">Move</th>
                  <th className="py-1 pr-2 font-medium">Before</th>
                  <th className="py-1 pr-2 font-medium">After</th>
                  <th className="py-1 pr-2 font-medium">CP loss</th>
                  <th className="py-1 font-medium">Best</th>
                </tr>
              </thead>
              <tbody className="t-notation">
                {mistakes.map((m) => (
                  <tr key={m.ply} className="border-t border-border">
                    <td className={cn("py-1 pr-2", CLASS_STYLE[m.classification].className)}>
                      {m.san}
                      {CLASS_STYLE[m.classification].symbol}
                    </td>
                    <td className="py-1 pr-2">{displayScore(m.before)}</td>
                    <td className="py-1 pr-2">{displayScore(m.after)}</td>
                    <td className="py-1 pr-2">{m.cpLoss}</td>
                    <td className="py-1">{m.bestSan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="t-small mt-2 text-subtle">
          Classification uses the drop in the mover&apos;s winning chances: inaccuracy ≥ 5, mistake ≥ 10, blunder ≥ 15 percentage points (the same thresholds Lichess uses). Centipawn loss is capped at ±10 pawns; mates are treated as decisive.
        </p>
      </div>
    </div>
  );
}

