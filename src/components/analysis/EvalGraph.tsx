"use client";

import type { MoveEvaluation } from "@/lib/db/types";
import { winPct } from "@/lib/analysis/classify";
import { CLASS_STYLE } from "@/components/board/MoveList";

/**
 * Win-probability graph for White across the game (50% = equal). Clicking selects a ply.
 * Mistakes and blunders are marked with dots and listed in an accessible summary.
 */
export function EvalGraph({ evals, cursor, onSelect }: { evals: MoveEvaluation[]; cursor: number; onSelect: (ply: number) => void }) {
  if (evals.length === 0) return null;
  const W = 600;
  const H = 120;
  const n = evals.length;
  const x = (i: number) => (n === 0 ? 0 : (i / n) * W);
  const pts = [{ i: 0, p: winPct(evals[0].before, "w") }, ...evals.map((e, k) => ({ i: k + 1, p: winPct(e.after, "w") }))];
  const y = (p: number) => H - (p / 100) * H;
  const path = pts.map((pt, k) => `${k ? "L" : "M"}${x(pt.i).toFixed(1)},${y(pt.p).toFixed(1)}`).join(" ");
  const area = `${path} L${x(n)},${H} L0,${H} Z`;
  const marks = evals.filter((e) => e.classification === "mistake" || e.classification === "blunder");
  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-24 w-full cursor-pointer rounded-[var(--radius-md)] border border-border bg-neutral-800"
        role="img"
        aria-label={`Evaluation graph over ${n} moves. ${marks.length} mistakes or blunders marked.`}
        onClick={(e) => {
          const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
          const ply = Math.round(((e.clientX - rect.left) / rect.width) * n);
          onSelect(Math.max(0, Math.min(n, ply)));
        }}
      >
        <path d={area} fill="#eef1f6" />
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#7a7a7a" strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1={x(cursor)} x2={x(cursor)} y1="0" y2={H} stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {marks.map((m) => (
          <circle key={m.ply} cx={x(m.ply)} cy={y(winPct(m.after, "w"))} r="4" fill={m.classification === "blunder" ? "#dc2626" : "#ea580c"} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <figcaption className="t-small mt-1 flex justify-between text-muted">
        <span>White&apos;s winning chances (top = White winning)</span>
        <span className="flex gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#ea580c]" aria-hidden />
            {CLASS_STYLE.mistake.label}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#dc2626]" aria-hidden />
            {CLASS_STYLE.blunder.label}
          </span>
        </span>
      </figcaption>
    </figure>
  );
}
