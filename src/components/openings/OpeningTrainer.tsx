"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { ArrowLeft, BookOpen, Brain, CheckCircle2, ChevronLeft, ChevronRight, Eye, FlipVertical2, RotateCcw, XCircle } from "lucide-react";
import { getOpening, type Opening, type OpeningVariation } from "@/content/openings/library";
import { Chessboard, type BoardArrow, type BoardMove } from "@/components/board/Chessboard";
import { PanelCard, TrainerLayout } from "@/components/board/TrainerLayout";
import { Badge, Callout, PageSkeleton, ProgressBar, Segmented, Select } from "@/components/ui/primitives";
import { Button, IconButton } from "@/components/ui/Button";
import { recordAttempt, recordOpeningRecall } from "@/lib/db/repo";
import { useOpeningProgress, useReviews } from "@/hooks/data";
import { describeDue } from "@/lib/learning/srs";
import { playMoveSound, playSound } from "@/lib/sound";
import { useActivityTimer } from "@/hooks/useActivityTimer";
import { Suspense } from "react";
import { useNow } from "@/hooks/useNow";

export function OpeningTrainer({ openingId }: { openingId: string }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Inner openingId={openingId} />
    </Suspense>
  );
}

function Inner({ openingId }: { openingId: string }) {
  const opening = getOpening(openingId)!;
  const params = useSearchParams();
  const router = useRouter();
  const [variationId, setVariationId] = useState(params.get("v") ?? opening.variations[0].id);
  const [mode, setMode] = useState<"study" | "recall">(params.get("mode") === "recall" ? "recall" : "study");
  const variation = opening.variations.find((v) => v.id === variationId) ?? opening.variations[0];
  const progress = useOpeningProgress();
  const reviews = useReviews();
  const now = useNow();
  useActivityTimer("opening", `${opening.id}:${variation.id}`);

  const changeVariation = (id: string) => {
    setVariationId(id);
    router.replace(`/openings/${opening.id}/?v=${id}&mode=${mode}`, { scroll: false });
  };
  const changeMode = (m: "study" | "recall") => {
    setMode(m);
    router.replace(`/openings/${opening.id}/?v=${variation.id}&mode=${m}`, { scroll: false });
  };

  const p = progress?.get(`${opening.id}:${variation.id}`);
  const card = reviews?.find((c) => c.id === `opening:${opening.id}:${variation.id}`);

  return (
    <div>
      <Link href="/openings/" className="t-small mb-3 inline-flex items-center gap-1.5 font-medium text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All openings
      </Link>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="t-page">{opening.name}</h1>
          <p className="t-small mt-1 text-muted">
            {opening.eco} · you play {opening.side === "w" ? "White" : "Black"} · {opening.level}
          </p>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-end gap-3">
          <div className="w-64 min-w-0 max-w-full">
            <Select label="Line" value={variation.id} onChange={changeVariation} options={opening.variations.map((v) => ({ value: v.id, label: v.name }))} />
          </div>
          <Segmented
            label="Mode"
            value={mode}
            onChange={changeMode}
            options={[
              { value: "study", label: <span className="inline-flex items-center gap-1.5"><BookOpen className="h-4 w-4" aria-hidden />Study</span> },
              { value: "recall", label: <span className="inline-flex items-center gap-1.5"><Brain className="h-4 w-4" aria-hidden />Recall</span> },
            ]}
          />
        </div>
      </div>
      {mode === "study" ? (
        <StudyMode key={variation.id} opening={opening} variation={variation} onRecall={() => changeMode("recall")} />
      ) : (
        <RecallMode key={variation.id} opening={opening} variation={variation} />
      )}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <InfoCard title="Typical structure" items={[opening.structure]} />
        <InfoCard title="Plans" items={opening.plans} />
        <InfoCard title="Tactical motifs" items={opening.motifs} />
        <InfoCard title="Common mistakes" items={opening.mistakes} />
      </div>
      <p className="t-small mt-4 text-subtle">
        {p ? `Recall attempts: ${p.recallAttempts}, flawless: ${p.successfulRecalls}.` : "You haven't practised this line from memory yet."}
        {card ? ` Next review: ${describeDue(card, now).toLowerCase()}.` : ""}
      </p>
    </div>
  );
}

function InfoCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <h2 className="t-card">{title}</h2>
      <ul className="mt-2 space-y-1.5">
        {items.map((t, i) => (
          <li key={i} className="t-small flex gap-2 text-muted">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function positions(variation: OpeningVariation) {
  const c = new Chess();
  const out = [{ fen: c.fen(), last: null as null | { from: Square; to: Square } }];
  for (const mv of variation.moves) {
    const m = c.move(mv.san);
    out.push({ fen: c.fen(), last: { from: m.from, to: m.to } });
  }
  return out;
}

function StudyMode({ opening, variation, onRecall }: { opening: Opening; variation: OpeningVariation; onRecall: () => void }) {
  const pos = useMemo(() => positions(variation), [variation]);
  const [i, setI] = useState(0);
  const [orientation, setOrientation] = useState(opening.side);
  const next = variation.moves[i];
  const nextArrow: BoardArrow[] = useMemo(() => {
    if (!next) return [];
    const m = new Chess(pos[i].fen).move(next.san);
    return [{ from: m.from, to: m.to, kind: "alt" }];
  }, [i, next, pos]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "SELECT" || t.getAttribute("role") === "application") return;
      if (e.key === "ArrowRight") setI((x) => Math.min(variation.moves.length, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variation]);
  const played = i > 0 ? variation.moves[i - 1] : null;
  const moveLabel = (k: number) => `${Math.floor(k / 2) + 1}${k % 2 === 0 ? "." : "..."} ${variation.moves[k].san}`;
  return (
    <TrainerLayout
      board={
        <>
          <Chessboard fen={pos[i].fen} orientation={orientation} movable="none" lastMove={pos[i].last} arrows={nextArrow} label="Opening study board" />
          <div className="mt-2 flex justify-end">
            <IconButton label="Flip board" size="sm" onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}>
              <FlipVertical2 className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
        </>
      }
      panel={
        <PanelCard>
          <p className="t-label text-muted">{variation.name}</p>
          <ProgressBar className="mt-2" value={i} max={variation.moves.length} label="Position in the line" />
          <div className="mt-4 min-h-[7rem]" aria-live="polite">
            {played ? (
              <>
                <p className="t-notation font-semibold text-fg">{moveLabel(i - 1)}</p>
                <p className="t-body mt-1 text-fg/90">{played.note}</p>
              </>
            ) : (
              <p className="t-body text-muted">Step through the line. Each move comes with the idea behind it. The blue arrow shows the next move.</p>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} icon={<ChevronLeft className="h-4 w-4" aria-hidden />}>
              Back
            </Button>
            <Button size="sm" onClick={() => setI((x) => Math.min(variation.moves.length, x + 1))} disabled={i >= variation.moves.length} icon={<ChevronRight className="h-4 w-4" aria-hidden />}>
              Next move
            </Button>
            <span className="t-small ml-auto text-muted tabular">
              {i}/{variation.moves.length}
            </span>
          </div>
          <ol className="t-notation mt-4 flex flex-wrap gap-x-1 gap-y-1 text-[0.8125rem]">
            {variation.moves.map((mv, k) => (
              <li key={k}>
                <button type="button" onClick={() => setI(k + 1)} className={`rounded px-1 py-0.5 hover:bg-surface-3 ${i === k + 1 ? "bg-accent-soft font-semibold text-accent-soft-fg" : "text-muted"}`}>
                  {k % 2 === 0 ? `${k / 2 + 1}.` : ""}
                  {mv.san}
                </button>
              </li>
            ))}
          </ol>
          {i >= variation.moves.length && (
            <Callout tone="success" className="mt-4" title="End of the line">
              Now test yourself: play {opening.side === "w" ? "White's" : "Black's"} moves from memory.
              <Button size="sm" className="mt-2" onClick={onRecall} icon={<Brain className="h-4 w-4" aria-hidden />}>
                Practise from memory
              </Button>
            </Callout>
          )}
        </PanelCard>
      }
    />
  );
}

function RecallMode({ opening, variation }: { opening: Opening; variation: OpeningVariation }) {
  const pos = useMemo(() => positions(variation), [variation]);
  const [i, setI] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [wrongHere, setWrongHere] = useState(0);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const done = i >= variation.moves.length && i > 0;
  const recorded = useRef(false);
  const [orientation, setOrientation] = useState(opening.side);
  const [round, setRound] = useState(0);
  const started = useRef(0);
  useEffect(() => {
    started.current = Date.now();
  }, []);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const userTurn = (k: number) => (k % 2 === 0 ? "w" : "b") === opening.side;
  // Opponent moves are played automatically.
  useEffect(() => {
    if (done || i >= variation.moves.length || userTurn(i)) return;
    const t = setTimeout(() => {
      playMoveSound(variation.moves[i].san);
      setI((x) => x + 1);
    }, 500);
    timers.current.push(t);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, done, round]);

  useEffect(() => {
    if (done && !recorded.current) {
      recorded.current = true;
      const success = !revealed;
      playSound(success && mistakes === 0 ? "success" : "end");
      void recordOpeningRecall(opening.id, variation.id, success, mistakes);
      void recordAttempt({
        kind: "opening",
        refId: `${opening.id}:${variation.id}`,
        skills: ["opening-principles"],
        solved: success,
        mistakes,
        hintsUsed: revealed ? 1 : 0,
        revealed,
        skipped: false,
        durationMs: Date.now() - started.current,
        review: {
          kind: "opening",
          always: true,
          reasonIfStruggled: `You had ${mistakes} slip${mistakes === 1 ? "" : "s"} recalling the ${opening.name}: ${variation.name}.`,
          reasonIfClean: `Keep the ${opening.name}: ${variation.name} fresh.`,
        },
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  const expected = variation.moves[i];
  const onMove = (mv: BoardMove) => {
    if (done || !expected || !userTurn(i)) return;
    const c = new Chess(pos[i].fen);
    let m;
    try {
      m = c.move(mv);
    } catch {
      return;
    }
    if (m.san === new Chess(pos[i].fen).move(expected.san).san) {
      playMoveSound(m.san);
      setFeedback({ ok: true, text: expected.note });
      setWrongHere(0);
      setI(i + 1);
    } else {
      playSound("error");
      setMistakes((x) => x + 1);
      setWrongHere((x) => x + 1);
      setFeedback({ ok: false, text: `${m.san} is not the move in this line. Think about the idea: ${wrongHere >= 1 ? expected.note : "what is this move trying to achieve?"}` });
    }
  };

  const reveal = () => {
    if (!expected) return;
    setRevealed(true);
    setFeedback({ ok: true, text: `The move was ${expected.san}: ${expected.note}` });
    playMoveSound(expected.san);
    setWrongHere(0);
    setI(i + 1);
  };

  const restart = () => {
    timers.current.forEach(clearTimeout);
    setI(0);
    setMistakes(0);
    setWrongHere(0);
    setFeedback(null);
    recorded.current = false;
    setRevealed(false);
    started.current = Date.now();
    setRound((r) => r + 1);
  };

  const hintArrow: BoardArrow[] = [];
  if (wrongHere >= 2 && expected && userTurn(i)) {
    const m = new Chess(pos[i].fen).move(expected.san);
    hintArrow.push({ from: m.from, to: m.to, kind: "alt" });
  }

  return (
    <TrainerLayout
      board={
        <>
          <Chessboard fen={pos[i].fen} orientation={orientation} movable={!done && userTurn(i) ? opening.side : "none"} onMove={onMove} lastMove={pos[i].last} arrows={hintArrow} label="Opening recall board" testId="opening-board" />
          <div className="mt-2 flex justify-end">
            <IconButton label="Flip board" size="sm" onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}>
              <FlipVertical2 className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
        </>
      }
      panel={
        <PanelCard>
          <p className="t-label text-muted">Recall: {variation.name}</p>
          <p className="t-body mt-2 font-medium">
            {done ? "Line complete" : userTurn(i) ? `Play ${opening.side === "w" ? "White's" : "Black's"} move ${Math.floor(i / 2) + 1} from memory` : "Your opponent is moving…"}
          </p>
          <ProgressBar className="mt-3" value={i} max={variation.moves.length} label="Progress through the line" />
          {feedback && !done && (
            <div aria-live="polite" className="mt-3">
              <Callout tone={feedback.ok ? "success" : "danger"} icon={feedback.ok ? <CheckCircle2 className="h-5 w-5 text-success" aria-hidden /> : <XCircle className="h-5 w-5 text-danger" aria-hidden />}>
                {feedback.text}
              </Callout>
            </div>
          )}
          {wrongHere >= 2 && !done && <p className="t-small mt-2 text-muted">The blue arrow shows the move.</p>}
          {done ? (
            <div className="mt-3 space-y-3" data-testid="recall-done">
              <Callout tone={!revealed && mistakes === 0 ? "success" : "info"} title={!revealed && mistakes === 0 ? "Perfect recall!" : "Line finished"}>
                {!revealed && mistakes === 0
                  ? "This line will come back for review after a longer interval."
                  : `${mistakes} slip${mistakes === 1 ? "" : "s"}${revealed ? " and a revealed move" : ""}. The line will come back soon so it sticks.`}
              </Callout>
              <Button onClick={restart} icon={<RotateCcw className="h-4 w-4" aria-hidden />}>
                Practise again
              </Button>
            </div>
          ) : (
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" size="sm" disabled={!userTurn(i)} onClick={reveal} icon={<Eye className="h-4 w-4" aria-hidden />}>
                Show move
              </Button>
              <Button variant="ghost" size="sm" onClick={restart} icon={<RotateCcw className="h-4 w-4" aria-hidden />}>
                Restart
              </Button>
            </div>
          )}
          {mistakes > 0 && !done && <Badge tone="warning" className="mt-3">{mistakes} slip{mistakes === 1 ? "" : "s"}</Badge>}
        </PanelCard>
      }
    />
  );
}
