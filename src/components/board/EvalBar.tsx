import type { Score } from "@/lib/engine/uci";
import { formatScore, winProbability } from "@/lib/engine/uci";
import { MATE_CP } from "@/lib/analysis/classify";

/** Vertical evaluation bar (White at the bottom when orientation is White). Scores are White POV. */
export function EvalBar({ score, orientation = "w", pending }: { score?: Score; orientation?: "w" | "b"; pending?: boolean }) {
  const isTerminal = score?.cp !== undefined && Math.abs(score.cp) >= MATE_CP;
  const p = score ? (isTerminal ? (score.cp! > 0 ? 1 : 0) : winProbability(score)) : 0.5;
  const whitePct = Math.round(p * 100);
  const label = !score ? "No evaluation" : isTerminal ? (score.cp! > 0 ? "White has won" : "Black has won") : `Evaluation ${formatScore(score)}`;
  return (
    <div
      className="relative h-full w-3 overflow-hidden rounded-full border border-border bg-neutral-800 sm:w-4"
      role="img"
      aria-label={`${label}${pending ? " (preliminary)" : ""}`}
      title={`${label}. Positive favours White, negative favours Black.`}
    >
      <div
        className="absolute inset-x-0 bg-neutral-100 transition-[height] duration-300"
        style={orientation === "w" ? { bottom: 0, height: `${whitePct}%` } : { top: 0, height: `${whitePct}%` }}
      />
    </div>
  );
}

export function displayScore(score?: Score): string {
  if (!score) return "–";
  if (score.cp !== undefined && Math.abs(score.cp) >= MATE_CP) return score.cp > 0 ? "1-0" : "0-1";
  return formatScore(score);
}
