/** Confirms each drill's goal is achievable with best play, according to Stockfish. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEngine } from "../../scripts/lib/engine-node.mjs";
import { DRILLS } from "@/content/drills";
import { ALL_LESSONS } from "@/content/lessons";
import type { GoalStep } from "@/content/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let engine: any;
beforeAll(async () => {
  engine = createEngine();
  await engine.init();
});
afterAll(() => engine?.quit());

const goals: { id: string; step: GoalStep }[] = [
  ...DRILLS.map((d) => ({ id: `drill:${d.id}`, step: d.step })),
  ...ALL_LESSONS.flatMap((l) => l.steps.filter((s): s is GoalStep => s.kind === "goal").map((s) => ({ id: `${l.id}/${s.id}`, step: s }))),
];

describe("goal positions are achievable", () => {
  for (const g of goals) {
    it(g.id, async () => {
      const r = await engine.analyse(g.step.fen, { depth: 22, multipv: 1 });
      const s = r[0].score as { cp?: number; mate?: number };
      // Scores are from the side to move, which is always the learner.
      if (g.step.goal === "hold-draw") {
        expect(s.mate === undefined ? s.cp! >= -100 : s.mate > 0, `${g.id}: ${JSON.stringify(s)}`).toBe(true);
      } else {
        expect(s.mate !== undefined ? s.mate > 0 : s.cp! >= 400, `${g.id}: ${JSON.stringify(s)}`).toBe(true);
        if (g.step.goal === "checkmate" && s.mate !== undefined) expect(s.mate).toBeLessThanOrEqual(g.step.maxMoves);
      }
    });
  }
});
