"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { AlertTriangle, ArrowLeft, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, FlipVertical2, Info, Lightbulb, Loader2, Play, RotateCcw, Square as StopIcon, Undo2, BookOpen, Puzzle } from "lucide-react";
import { useAnalysis, useGame, useKv } from "@/hooks/data";
import { buildLine, fenAt, playAt, type Line } from "@/lib/chess/line";
import { Chessboard, type BoardArrow, type BoardMove } from "@/components/board/Chessboard";
import { CLASS_ORDER, CLASS_STYLE, ClassIcon, MoveList, useMoveKeys } from "@/components/board/MoveList";
import { EvalBar, displayScore } from "@/components/board/EvalBar";
import { EvalGraph } from "./EvalGraph";
import { PanelCard } from "@/components/board/TrainerLayout";
import { Badge, Callout, EmptyState, PageSkeleton, ProgressBar, Segmented, Select } from "@/components/ui/primitives";
import { Button, ButtonLink, IconButton } from "@/components/ui/Button";
import { CopyFenButton } from "@/components/board/CopyFenButton";
import { useEngine } from "@/hooks/useEngine";
import { useActivityTimer } from "@/hooks/useActivityTimer";
import { runAnalysis } from "@/lib/analysis/runner";
import { buildReport, classCounts, reviewMove } from "@/lib/analysis/report";
import { ActionDock } from "@/components/ui/ActionDock";
import { CC_KEY } from "@/lib/chesscom/store";
import type { CcImport } from "@/lib/chesscom/types";
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

/** `initialPly`: open on the position before this ply (1-based), e.g. to show a specific mistake. */
export function GameAnalysisView({ gameId, initialPly, autoStart }: { gameId: string; initialPly?: number; /** Start the analysis straight away if there is none yet. */ autoStart?: boolean }) {
  const game = useGame(gameId);
  const ccImport = useKv<CcImport>(CC_KEY);
  const analysis = useAnalysis(gameId);
  const settings = useSettings();
  const { engine, restart } = useEngine(false);
  // Reviews start from the first move (or the requested move), so "Next" steps through the game.
  const [cursor, setCursor] = useState<number | null>(initialPly ? initialPly - 1 : 0);
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
  const mainCursor = Math.min(cursor ?? total, total);
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

  // Opened with "review": start the analysis straight away when there is none (or it was interrupted).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current || !game || analysis === undefined || analysis?.complete || game.moves.length === 0) return;
    autoStarted.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, game, analysis]);

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
  // The move that led to the board position: the one being reviewed.
  const playedEval = !variation && mainCursor > 0 ? evalsByPly.get(mainCursor) : undefined;
  const currentEval = !variation ? (mainCursor === 0 ? evalsByPly.get(1)?.before : evalsByPly.get(mainCursor)?.after) : undefined;
  const arrows: BoardArrow[] = [];
  // Green arrow: the better move that could have been played instead of the one just played.
  if (showBest && playedEval && analysis?.complete && reviewMove(playedEval).better && playedEval.bestMove) {
    arrows.push({ from: playedEval.bestMove.slice(0, 2) as Square, to: playedEval.bestMove.slice(2, 4) as Square, kind: "main" });
  }

  const ratings = playerRatings(game, ccImport);

  /** Play the engine's better line from the position before the reviewed move, as a variation. */
  const showBestLine = (e: MoveEvaluation) => {
    const base = e.ply - 1;
    let l = buildLine(fenAt(line, base), []).line;
    for (const san of e.bestLine) {
      const r = playAt(l, l.plies.length, san);
      if (!r) break;
      l = r.line;
    }
    if (l.plies.length) setVariation({ base, line: l, cursor: 1 });
  };

  // Mobile and desktop move navigation (main line or variation).
  const navMax = variation ? variation.line.plies.length : total;
  const navCursor = variation ? variation.cursor : mainCursor;
  const go = (p: number) => {
    const q = Math.max(0, Math.min(navMax, p));
    if (variation) setVariation({ ...variation, cursor: q });
    else select(q);
  };

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
          {game.whitePlayer}
          {ratings.w ? <span className="font-normal text-muted"> ({ratings.w})</span> : null} vs {game.blackPlayer}
          {ratings.b ? <span className="font-normal text-muted"> ({ratings.b})</span> : null}
        </h1>
        <p className="t-small text-muted">
          {game.result === "*" ? (game.status === "in-progress" ? "Game in progress" : "Unfinished game") : describeResult(game.result, game.terminalReason)}
          {analysis?.opening && ` · ${analysis.opening.eco} ${analysis.opening.name}`}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] lg:items-start">
        <div className="min-w-0">
          <div className="mx-auto flex w-full max-w-[min(100%,max(16rem,calc(100dvh-22rem-var(--host-inset,0px))))] gap-2 lg:max-w-[min(100%,calc(100dvh-8rem))]" data-testid="review-board">
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
              <CopyFenButton fen={boardFen} />
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
                <MoveList line={variation.line} cursor={variation.cursor} onSelect={(p) => setVariation({ ...variation, cursor: p })} className="mt-3" navClassName="hidden lg:flex" />
              </div>
            ) : (
              <MoveList line={line} cursor={mainCursor} onSelect={select} classes={classes} navClassName="hidden lg:flex" />
            )}
            {!variation && analysis?.complete && (playedEval ? <CoachCard e={playedEval} onBestLine={() => showBestLine(playedEval)} /> : mainCursor === 0 && total > 0 ? <p className="t-small mt-4 text-muted">Step forward to review each move.</p> : null)}
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
                {tab === "summary" && (
                  <SummaryTab
                    analysisDepth={analysis.analysisSettings.depth}
                    complete={Boolean(complete)}
                    report={report}
                    accuracy={analysis.accuracy}
                    userColor={userColor}
                    evals={analysis.moveEvaluations}
                    names={{ w: game.whitePlayer, b: game.blackPlayer }}
                    ratings={ratings}
                    reanalyse={
                      running ? undefined : (
                        <ReanalyseControls depth={depth} setDepth={setDepth} onStart={start} older={!analysis.moveEvaluations.some((m) => m.secondSan !== undefined)} />
                      )
                    }
                  />
                )}
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
      <ActionDock dockOnly revealPanel={false} note={variation ? <span className="text-muted">Exploring a line. The saved game is unchanged.</span> : playedEval && analysis?.complete ? <DockVerdict e={playedEval} /> : mainCursor === 0 ? <span className="text-muted">Start of the game</span> : null}>
        <div className="flex items-center gap-1.5" role="toolbar" aria-label="Move navigation">
          <IconButton label="First position" onClick={() => go(0)} disabled={navCursor === 0}>
            <ChevronFirst className="h-5 w-5" aria-hidden />
          </IconButton>
          <Button variant="secondary" className="flex-1" onClick={() => go(navCursor - 1)} disabled={navCursor === 0} icon={<ChevronLeft className="h-5 w-5" aria-hidden />}>
            Back
          </Button>
          <Button className="flex-1" onClick={() => go(navCursor + 1)} disabled={navCursor >= navMax}>
            Next <ChevronRight className="h-5 w-5" aria-hidden />
          </Button>
          <IconButton label="Last position" onClick={() => go(navMax)} disabled={navCursor >= navMax}>
            <ChevronLast className="h-5 w-5" aria-hidden />
          </IconButton>
          {variation ? (
            <IconButton label="Return to game" onClick={() => setVariation(null)}>
              <Undo2 className="h-5 w-5" aria-hidden />
            </IconButton>
          ) : playedEval && analysis?.complete && reviewMove(playedEval).better ? (
            <IconButton label="Show the best line" onClick={() => showBestLine(playedEval)}>
              <Lightbulb className="h-5 w-5" aria-hidden />
            </IconButton>
          ) : null}
        </div>
      </ActionDock>
    </div>
  );
}

/** Player ratings from the PGN headers, or from the Chess.com import for games saved before ratings were recorded. */
function playerRatings(game: { id: string; headers?: Record<string, string> }, imp: CcImport | null | undefined): { w?: number; b?: number } {
  const num = (v?: string) => (v && /^\d{2,4}$/.test(v) ? Number(v) : undefined);
  let w = num(game.headers?.WhiteElo);
  let b = num(game.headers?.BlackElo);
  if ((!w || !b) && imp && game.id.startsWith("cc_")) {
    const g = imp.games.find((x) => `cc_${x.id}` === game.id);
    if (g) {
      w ??= g.userColor === "w" ? g.userRating : g.oppRating;
      b ??= g.userColor === "w" ? g.oppRating : g.userRating;
    }
  }
  return { w, b };
}

/** One-line verdict for the phone dock. */
function DockVerdict({ e }: { e: MoveEvaluation }) {
  const r = reviewMove(e);
  return (
    <span className="flex items-center gap-2" data-testid="dock-verdict">
      <ClassIcon cls={e.classification} size={22} />
      <span className="min-w-0">
        <span className={cn("font-semibold", CLASS_STYLE[e.classification].className)}>
          <span className="t-notation">{e.san}</span> · {CLASS_STYLE[e.classification].label}
        </span>
        {r.better && (
          <span className="font-normal text-muted">
            {" "}
            · Best: <span className="t-notation font-semibold text-fg">{r.better.san}</span>
          </span>
        )}
      </span>
    </span>
  );
}

/** Review of the move just played: its type, what it did, and the better move. */
function CoachCard({ e, onBestLine }: { e: MoveEvaluation; onBestLine: () => void }) {
  const r = reviewMove(e);
  return (
    <div className="mt-4 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3" data-testid="coach">
      <div className="flex items-center gap-2">
        <ClassIcon cls={e.classification} size={26} />
        <p className="t-body font-semibold text-fg">
          {r.headline}
          {isMissedOpportunity(e) && (
            <Badge tone="info" className="ml-2 align-middle">
              Missed win
            </Badge>
          )}
        </p>
      </div>
      <ul className="t-small mt-2 space-y-1 text-muted">
        {r.details.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
      {r.better && (
        <div className="mt-3 rounded-[var(--radius-sm)] border border-border bg-surface p-2.5">
          <p className="t-small text-fg">
            Best was <span className="t-notation font-semibold">{r.better.san}</span> <span className="text-muted">(shown by the arrow on the board)</span>
          </p>
          {r.better.line.length > 1 && <p className="t-notation t-small mt-0.5 text-muted">{r.better.line.slice(0, 6).join(" ")}</p>}
          <Button size="sm" variant="secondary" className="mt-2" onClick={onBestLine} icon={<Lightbulb className="h-4 w-4" aria-hidden />}>
            Show the best line
          </Button>
        </div>
      )}
    </div>
  );
}

function ReanalyseControls({ depth, setDepth, onStart, older }: { depth: string; setDepth: (d: string) => void; onStart: () => void; older: boolean }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border p-3">
      <p className="t-small text-muted">
        {older ? "This analysis was made before Great and Brilliant moves were detected. Analyse again to see them." : "Want a more thorough check? A deeper analysis takes longer but misjudges fewer positions."}
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="w-56">
          <Select label="Depth" value={depth} onChange={setDepth} options={DEPTHS} />
        </div>
        <Button size="sm" variant="secondary" onClick={onStart} icon={<RotateCcw className="h-4 w-4" aria-hidden />}>
          Analyse again
        </Button>
      </div>
    </div>
  );
}

/** "Missed opportunity": the engine's move won material or forced mate, and the played move let it slip. */
function isMissedOpportunity(e: MoveEvaluation): boolean {
  return e.tags.includes("missed-win") || e.tags.includes("missed-mate");
}

function SummaryTab({
  report,
  accuracy,
  userColor,
  complete,
  analysisDepth,
  evals,
  names,
  ratings,
  reanalyse,
}: {
  report: NonNullable<ReturnType<typeof buildReport>>;
  accuracy?: { w: number; b: number };
  userColor: "w" | "b" | null;
  complete: boolean;
  analysisDepth: number;
  evals: MoveEvaluation[];
  names: { w: string; b: string };
  ratings: { w?: number; b?: number };
  reanalyse?: React.ReactNode;
}) {
  const counts = { w: classCounts(evals, "w"), b: classCounts(evals, "b") };
  return (
    <div className="space-y-4">
      {!complete && <Callout tone="warning">This summary covers only the moves analysed so far.</Callout>}
      <p className="t-body text-fg">{report.summary}</p>
      {accuracy && (
        <div className="grid grid-cols-2 gap-2" data-testid="accuracy">
          {(["w", "b"] as const).map((c) => (
            <div key={c} className={cn("min-w-0 rounded-[var(--radius-md)] border p-3", userColor === c ? "border-accent/40 bg-accent-soft/40" : "border-border")}>
              <p className="t-small break-words text-muted">
                {c === "w" ? "White" : "Black"}
                {userColor === c ? " (you)" : ""}: <span className="font-medium text-fg">{names[c]}</span>
                {ratings[c] ? ` (${ratings[c]})` : ""}
              </p>
              <p className="t-stat">{accuracy[c].toFixed(0)}%</p>
              <p className="t-small text-subtle">approx. accuracy</p>
            </div>
          ))}
        </div>
      )}
      <div>
        <h3 className="t-label mb-2 text-muted">Move types</h3>
        <table className="t-small w-full" data-testid="class-counts">
          <thead>
            <tr className="text-muted">
              <th scope="col" className="pb-1 text-left font-medium">
                <span className="sr-only">Move type</span>
              </th>
              <th scope="col" className="pb-1 text-right font-medium">White</th>
              <th scope="col" className="pb-1 text-right font-medium">Black</th>
            </tr>
          </thead>
          <tbody>
            {CLASS_ORDER.map((c) => (
              <tr key={c} className="border-t border-border">
                <th scope="row" className="py-1 text-left font-normal">
                  <span className="inline-flex items-center gap-2">
                    <ClassIcon cls={c} size={18} />
                    <span className={cn("font-medium", CLASS_STYLE[c].className || "text-fg")}>{CLASS_STYLE[c].label}</span>
                  </span>
                </th>
                <td className={cn("py-1 text-right tabular-nums", userColor === "w" && "font-semibold text-fg")}>{counts.w[c]}</td>
                <td className={cn("py-1 text-right tabular-nums", userColor === "b" && "font-semibold text-fg")}>{counts.b[c]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <details className="t-small mt-2 text-muted">
          <summary className="cursor-pointer font-medium text-fg">How moves are rated</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Each move is rated by how much it changed the mover&apos;s winning chances, according to Stockfish.</li>
            <li><b>Best</b>: Stockfish&apos;s choice, or within 1 point of it. <b>Excellent</b>: within 2.5 points. <b>Good</b>: within 5.</li>
            <li><b>Inaccuracy</b>: loses 5 to 10 points. <b>Mistake</b>: 10 to 15. <b>Blunder</b>: 15 or more, or walking into a forced mate.</li>
            <li><b>Great</b>: the best move when Stockfish&apos;s second choice would have lost at least 10 points (the only good move). Not given for recaptures or when the position was already won.</li>
            <li><b>Brilliant</b>: a best move that gives up at least 2 pawns&apos; worth of material and still keeps the position at least equal (in a position that was already won, it must also be the only move that keeps the win).</li>
            <li><b>Book</b>: a known opening move. Great, Brilliant, Mistake and Blunder are double-checked at depth 18 before they are shown.</li>
          </ul>
        </details>
      </div>
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
      {reanalyse}
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
              <span className={cn("t-small ml-2 font-sans font-medium", CLASS_STYLE[m.classification].className)}>{CLASS_STYLE[m.classification].label}</span>
              {isMissedOpportunity(m) && <span className="t-small ml-1 font-sans text-muted">· missed opportunity</span>}
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

