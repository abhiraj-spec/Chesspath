/**
 * Engine validation of curated lesson exercises (runs real Stockfish via Node).
 *
 * For every interactive "play" step that is not marked rulesOnly/passTurn:
 *  - every accepted move must be close to the engine's best move
 *    (within 80 centipawns, or a forced mate when the best move mates);
 *  - every move given "wrong" feedback must be clearly worse than the best move (>= 100 cp)
 *    or must fail to mate when the best move mates.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { createEngine } from "../../scripts/lib/engine-node.mjs";
import { ALL_LESSONS } from "@/content/lessons";
import { matchingMoves, wrongFor } from "@/lib/lessons/engine";

type Score = { cp?: number; mate?: number };
const DEPTH = Number(process.env.VALIDATE_DEPTH ?? 14);
const value = (s: Score) => (s.mate !== undefined ? (s.mate > 0 ? 100000 - s.mate * 100 : -100000 - s.mate * 100) : (s.cp ?? 0));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let engine: any;
beforeAll(async () => {
  engine = createEngine();
  await engine.init();
});
afterAll(() => engine?.quit());

async function rootBest(fen: string, depth = DEPTH): Promise<Score> {
  const r = await engine.analyse(fen, { depth, multipv: 1 });
  return r[0].score;
}

/** Score of a move from the mover's point of view. */
async function moveScore(fen: string, san: string, depth = DEPTH): Promise<Score> {
  const c = new Chess(fen);
  c.move(san);
  if (c.isCheckmate()) return { mate: 1 };
  if (c.isDraw() || c.isStalemate()) return { cp: 0 };
  const r = await engine.analyse(c.fen(), { depth: depth - 1, multipv: 1 });
  const s: Score = r[0].score;
  return s.mate !== undefined ? { mate: -s.mate + (s.mate > 0 ? 0 : 1) } : { cp: -(s.cp ?? 0) };
}

const fmt = (s: Score) => (s.mate !== undefined ? `#${s.mate}` : `${s.cp}cp`);

describe("lesson exercises agree with Stockfish", () => {
  const report: string[] = [];
  afterAll(() => {
    if (report.length) console.log("\n" + report.join("\n"));
  });

  for (const lesson of ALL_LESSONS) {
    for (const step of lesson.steps) {
      if (step.kind !== "play" || step.passTurn || step.rulesOnly) continue;
      it(`${lesson.id}/${step.id}`, async () => {
        let fen = step.fen;
        for (const [mi, pm] of step.moves.entries()) {
          const best = await rootBest(fen);
          const accepted = matchingMoves(fen, pm.accept);
          const problems: string[] = [];
          const good = (s: Score, b: Score) =>
            b.mate !== undefined && b.mate > 0
              ? s.mate !== undefined && s.mate > 0
              : value(s) >= value(b) - 80 || (value(b) >= 300 && value(s) >= 0.6 * value(b));
          for (const m of accepted) {
            let s = await moveScore(fen, m.san);
            let b = best;
            if (!good(s, b)) {
              // Re-check disagreements more deeply before reporting them.
              b = await rootBest(fen, DEPTH + 6);
              s = await moveScore(fen, m.san, DEPTH + 6);
            }
            if (!good(s, b)) problems.push(`accepted ${m.san} = ${fmt(s)} but best = ${fmt(b)}`);
          }
          for (const w of wrongFor(step, mi)) {
            const s = await moveScore(fen, w.san);
            const clearlyWorse = best.mate !== undefined && best.mate > 0 ? !(s.mate !== undefined && s.mate > 0) : value(s) <= value(best) - 100;
            if (!clearlyWorse) problems.push(`"wrong" ${w.san} = ${fmt(s)} is not clearly worse than best ${fmt(best)}`);
          }
          report.push(`${lesson.id}/${step.id}: best ${fmt(best)}; accepted ${accepted.map((m) => m.san).join(", ")}${problems.length ? "  <-- " + problems.join("; ") : ""}`);
          expect(problems, `${lesson.id}/${step.id}`).toEqual([]);
          const c = new Chess(fen);
          c.move(accepted.find((m) => !pm.accept.san || pm.accept.san.some((s) => s.replace(/[+#]/g, "") === m.san.replace(/[+#]/g, "")))!.san);
          if (pm.reply) c.move(pm.reply);
          fen = c.fen();
        }
      });
    }
  }
});
