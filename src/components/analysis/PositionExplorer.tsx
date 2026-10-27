"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, FlipVertical2, Loader2, RotateCcw, Check } from "lucide-react";
import { Chessboard, type BoardMove } from "@/components/board/Chessboard";
import { EvalBar } from "@/components/board/EvalBar";
import { MoveList, useMoveKeys } from "@/components/board/MoveList";
import { PanelCard, TrainerLayout } from "@/components/board/TrainerLayout";
import { Button, IconButton } from "@/components/ui/Button";
import { Callout } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { Chess, colorName, fenError } from "@/lib/chess/core";
import { emptyLine, fenAt, playAt, type Line } from "@/lib/chess/line";
import { uciLineToSan } from "@/lib/analysis/classify";
import { EngineError, type AnalysisLine } from "@/lib/engine/client";
import { formatScore } from "@/lib/engine/uci";
import { useEngine } from "@/hooks/useEngine";

/** Free analysis of a position given as FEN: play moves for either side and see Stockfish's top lines. */
export function PositionExplorer({ fen: startFen }: { fen: string }) {
  const error = fenError(startFen);
  if (error) {
    return (
      <div className="mx-auto max-w-xl">
        <Link href="/analysis/" className="t-small mb-4 inline-flex items-center gap-1 text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Analysis
        </Link>
        <Callout tone="danger" title="This position can't be analysed">
          <p className="t-small">{error}</p>
          <p className="t-small mt-1 break-all font-mono">{startFen}</p>
        </Callout>
      </div>
    );
  }
  return <Explorer key={startFen} startFen={startFen} />;
}

function Explorer({ startFen }: { startFen: string }) {
  const toast = useToast();
  const [line, setLine] = useState<Line>(() => emptyLine(startFen));
  const [cursor, setCursor] = useState(0);
  const [orientation, setOrientation] = useState<"w" | "b">(() => (new Chess(startFen).turn() === "b" ? "b" : "w"));
  const [copied, setCopied] = useState(false);
  const fen = fenAt(line, cursor);
  const chess = new Chess(fen);
  const lastPly = cursor > 0 ? line.plies[cursor - 1] : null;
  const [topLine, setTopLine] = useState<AnalysisLine | null>(null);

  const select = useCallback((p: number) => setCursor(p), []);
  useMoveKeys(true, cursor, line.plies.length, select);

  const onMove = (mv: BoardMove) => {
    const r = playAt(line, cursor, mv);
    if (!r) return;
    setLine(r.line);
    setCursor(cursor + 1);
  };

  const copyFen = async () => {
    try {
      await navigator.clipboard.writeText(fen);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Copying is not available here. Select the FEN text and copy it instead.", { tone: "error" });
    }
  };

  const status = chess.isCheckmate()
    ? `Checkmate: ${colorName(chess.turn() === "w" ? "b" : "w")} wins.`
    : chess.isStalemate()
      ? "Stalemate: draw."
      : chess.isInsufficientMaterial()
        ? "Draw: neither side can checkmate."
        : chess.isDraw()
          ? "Draw by the fifty-move rule."
          : `${colorName(chess.turn())} to move${chess.isCheck() ? " (in check)" : ""}.`;

  return (
    <div>
      <Link href="/analysis/" className="t-small mb-4 inline-flex items-center gap-1 text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Analysis
      </Link>
      <h1 className="t-page mb-4">Analyse a position</h1>
      <TrainerLayout
        board={
          <>
            <div className="flex gap-2">
              <div className="py-0.5">
                <EvalBar score={chess.isGameOver() ? undefined : topLine?.score} orientation={orientation} pending={topLine?.preliminary} />
              </div>
              <div className="min-w-0 flex-1">
                <Chessboard
                  fen={fen}
                  orientation={orientation}
                  movable={chess.isGameOver() ? "none" : chess.turn()}
                  onMove={onMove}
                  lastMove={lastPly ? { from: lastPly.from, to: lastPly.to } : null}
                  label="Analysis board: you can move for both sides"
                  testId="explorer-board"
                />
              </div>
            </div>
            <div className="mt-2 flex justify-end">
              <IconButton label="Flip board" size="sm" onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}>
                <FlipVertical2 className="h-4 w-4" aria-hidden />
              </IconButton>
            </div>
          </>
        }
        panel={
          <PanelCard>
            <p className="t-body font-medium text-fg" aria-live="polite">
              {status}
            </p>
            <p className="t-small mt-1 text-muted">Move pieces for either side to explore. Use ← and → to step through your moves.</p>
            <LiveLines key={fen} fen={fen} onTop={setTopLine} />
            <div className="mt-4">
              <h2 className="t-label mb-2 text-muted">Your moves from the starting position</h2>
              <MoveList line={line} cursor={cursor} onSelect={select} emptyText="Make a move on the board to start a line." className="max-h-48" />
            </div>
            <div className="mt-4">
              <label htmlFor="explorer-fen" className="t-label text-muted">
                FEN of the board position
              </label>
              <div className="mt-1 flex gap-2">
                <input id="explorer-fen" readOnly value={fen} onFocus={(e) => e.currentTarget.select()} className="t-notation min-w-0 flex-1 rounded-[var(--radius-md)] border border-border-strong bg-surface px-2 py-1.5 text-fg" />
                <Button size="sm" variant="secondary" onClick={copyFen} icon={copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={line.plies.length === 0}
                onClick={() => {
                  setLine(emptyLine(startFen));
                  setCursor(0);
                }}
                icon={<RotateCcw className="h-4 w-4" aria-hidden />}
              >
                Back to the starting position
              </Button>
            </div>
          </PanelCard>
        }
      />
    </div>
  );
}

/** Stockfish's top three lines for one position (keyed by FEN by the parent, so state starts fresh). */
function LiveLines({ fen, onTop }: { fen: string; onTop: (l: AnalysisLine | null) => void }) {
  const { engine, status } = useEngine(true);
  const over = new Chess(fen).isGameOver();
  const [lines, setLines] = useState<AnalysisLine[]>([]);
  const [final, setFinal] = useState(over);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    onTop(null);
    if (over) return;
    engine
      .analyse({
        fen,
        depth: 20,
        multipv: 3,
        onUpdate: (l) => {
          if (!alive) return;
          setLines(l);
          onTop(l[0] ?? null);
        },
      })
      .then((r) => {
        if (!alive) return;
        setLines(r.lines);
        onTop(r.lines[0] ?? null);
        setFinal(true);
      })
      .catch((e) => {
        if (alive && !(e instanceof EngineError && e.kind === "cancelled")) setErr(e instanceof Error ? e.message : "Engine error");
      });
    return () => {
      alive = false;
      engine.cancelAll();
    };
  }, [fen, engine, over, onTop]);

  if (over) return null;
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="t-label text-muted">Stockfish&apos;s top lines</h2>
        <span className="t-small text-subtle" aria-live="polite">
          {status === "loading" ? "loading engine…" : final ? `depth ${lines[0]?.depth ?? "–"} · final` : lines[0] ? `depth ${lines[0].depth} · searching…` : ""}
        </span>
      </div>
      {err && <p className="t-small mt-2 text-danger">{err}</p>}
      <ul className="mt-2 space-y-1.5" data-testid="explorer-lines">
        {lines.map((l) => (
          <li key={l.multipv} className="flex gap-2 rounded-[var(--radius-sm)] bg-surface-2 px-2 py-1.5">
            <span className="t-notation w-14 shrink-0 font-semibold">{l.score.mate !== undefined ? `#${l.score.mate}` : formatScore(l.score)}</span>
            <span className="t-notation min-w-0 text-muted">{uciLineToSan(fen, l.pv, 8).join(" ")}</span>
          </li>
        ))}
        {!lines.length && !err && (
          <li className="t-small flex items-center gap-2 text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Calculating…
          </li>
        )}
      </ul>
      <p className="t-small mt-2 text-subtle">Scores are in pawns from White&apos;s point of view. “#3” means mate in 3 (negative: Black mates).</p>
    </div>
  );
}
