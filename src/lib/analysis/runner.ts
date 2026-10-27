import type { ChessGameRecord, GameAnalysis } from "@/lib/db/types";
import { buildLine } from "@/lib/chess/line";
import type { EngineClient } from "@/lib/engine/client";
import { ENGINE_NAME } from "@/lib/engine/client";
import { classifyMove, DEFAULT_THRESHOLDS, sideAccuracy, terminalEval, type PositionEval, type Thresholds } from "./classify";
import { buildReport } from "./report";
import { identifyOpening, loadOpeningIndex } from "./openingIndex";

/** Mistakes and blunders are only reported after confirmation at this depth (or deeper). */
export const VERIFY_MIN_DEPTH = 18;

export interface RunOptions {
  game: ChessGameRecord;
  engine: EngineClient;
  depth: number;
  existing?: GameAnalysis | null;
  thresholds?: Thresholds;
  onProgress?: (done: number, total: number, partial: GameAnalysis) => void;
  save: (a: GameAnalysis) => Promise<void>;
  isCancelled: () => boolean;
}

/**
 * Analyse every position of a game with Stockfish. Results are saved after each position so an
 * interrupted analysis resumes where it stopped. Resolves with the complete analysis, or the
 * partial one if cancelled.
 */
export async function runAnalysis(o: RunOptions): Promise<GameAnalysis> {
  const { line } = buildLine(o.game.startingFen, o.game.moves);
  const fens = [line.startFen, ...line.plies.map((p) => p.fenAfter)];
  const thresholds = o.thresholds ?? DEFAULT_THRESHOLDS;
  const reuse = o.existing && o.existing.analysisSettings.depth === o.depth ? (o.existing.positionEvals ?? []) : [];
  const evals: PositionEval[] = reuse.filter((e, i) => e.fen === fens[i]).map((e) => ({ ...e }));
  const index = await loadOpeningIndex().catch(() => null);
  const opening = index ? identifyOpening(index, fens.slice(1)) : undefined;

  const assemble = (complete: boolean): GameAnalysis => {
    const moveEvaluations = [];
    for (let i = 0; i + 1 < evals.length && i < line.plies.length; i++) {
      const p = line.plies[i];
      moveEvaluations.push(
        classifyMove({
          ply: i + 1,
          san: p.san,
          uci: p.uci,
          color: p.color,
          fenBefore: p.fenBefore,
          fenAfter: p.fenAfter,
          before: evals[i],
          after: evals[i + 1],
          isBook: Boolean(opening && i + 1 <= opening.bookPlies),
          thresholds,
        }),
      );
    }
    const userColor = o.game.computer?.userColor ?? o.game.userColor ?? null;
    const report = buildReport({ evals: moveEvaluations, result: o.game.result, userColor, opening: opening ? { eco: opening.eco, name: opening.name, ply: opening.ply } : undefined });
    return {
      gameId: o.game.id,
      engineVersion: ENGINE_NAME,
      analysisSettings: { depth: o.depth, thresholds },
      moveEvaluations,
      identifiedMistakes: report.identifiedMistakes,
      recommendations: report.recommendations,
      summary: report.summary,
      opening: opening ? { eco: opening.eco, name: opening.name, ply: opening.ply } : undefined,
      accuracy: complete ? { w: sideAccuracy(moveEvaluations, "w") ?? 0, b: sideAccuracy(moveEvaluations, "b") ?? 0 } : undefined,
      complete,
      positionEvals: evals,
      createdAt: Date.now(),
    };
  };

  for (let i = evals.length; i < fens.length; i++) {
    if (o.isCancelled()) break;
    const fen = fens[i];
    const term = terminalEval(fen);
    if (term) evals.push(term);
    else {
      const r = await o.engine.analyse({ fen, depth: o.depth, multipv: 1 });
      if (o.isCancelled()) break;
      const best = r.lines[0];
      evals.push({ fen, score: best?.score ?? { cp: 0 }, bestMove: r.bestMove, pv: best?.pv ?? [], depth: r.depth });
    }
    // Not "complete" until the verification pass below has run.
    const partial = assemble(false);
    o.onProgress?.(evals.length, fens.length, partial);
    // Save every few positions (and at the end) to limit database writes.
    if (evals.length === fens.length || evals.length % 4 === 0) await o.save(partial);
  }
  // Verification pass: shallow searches can misjudge sharp tactics (e.g. sacrifices that mate
  // a few moves later). Before labelling any move a mistake or blunder, re-check both of its
  // positions at a greater depth and reclassify.
  if (evals.length === fens.length && !o.isCancelled()) {
    const verifyDepth = Math.max(o.depth + 4, VERIFY_MIN_DEPTH);
    for (let round = 0; round < 2 && !o.isCancelled(); round++) {
      const flagged = assemble(true).moveEvaluations.filter((m) => m.classification === "mistake" || m.classification === "blunder");
      const toCheck = new Set<number>();
      for (const m of flagged) {
        if (evals[m.ply - 1].depth && evals[m.ply - 1].depth < verifyDepth) toCheck.add(m.ply - 1);
        if (evals[m.ply].depth && evals[m.ply].depth < verifyDepth) toCheck.add(m.ply);
      }
      if (!toCheck.size) break;
      for (const i of [...toCheck].sort((a, b) => a - b)) {
        if (o.isCancelled()) break;
        // Fresh hash table so earlier shallow searches cannot bias the verification.
        o.engine.newGame();
        const r = await o.engine.analyse({ fen: fens[i], depth: verifyDepth, multipv: 1 });
        if (o.isCancelled()) break;
        evals[i] = { fen: fens[i], score: r.lines[0]?.score ?? evals[i].score, bestMove: r.bestMove, pv: r.lines[0]?.pv ?? [], depth: r.depth };
      }
    }
  }
  const result = assemble(evals.length === fens.length && !o.isCancelled());
  await o.save(result);
  return result;
}
