"use client";

import { useState } from "react";

export interface Bar {
  key: string;
  label: string;
  value: number;
  /** Full description for tooltip and table. */
  detail: string;
}

/**
 * Single-series vertical bar chart. One hue (no legend needed: the title names the series),
 * recessive grid, 4px rounded data ends, hover/focus tooltip, and a table view for accessibility.
 */
export function BarChart({ bars, max, unit, title, height = 160, yTicks }: { bars: Bar[]; max?: number; unit: string; title: string; height?: number; yTicks?: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const top = Math.max(max ?? 0, ...bars.map((b) => b.value), 1);
  const ticks = yTicks ?? [0, Math.round(top / 2), top];
  const n = bars.length;
  return (
    <figure>
      <div className="relative" style={{ height }}>
        <div className="absolute inset-y-0 left-0 w-8">
          {ticks.map((t) => (
            <span key={t} className="t-small absolute right-1 -translate-y-1/2 text-[0.7rem] text-subtle tabular" style={{ top: `${(1 - t / top) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
        <svg className="absolute inset-y-0 left-8 right-0 h-full w-[calc(100%-2rem)] overflow-visible" viewBox={`0 0 ${n * 10} 100`} preserveAspectRatio="none" role="img" aria-label={`${title}. ${bars.map((b) => b.detail).join("; ")}`}>
          {ticks.map((t) => (
            <line key={t} x1="0" x2={n * 10} y1={100 - (t / top) * 100} y2={100 - (t / top) * 100} stroke="var(--chart-grid)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {bars.map((b, i) => {
            const h = (b.value / top) * 100;
            return (
              <g key={b.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={i * 10} y="0" width="10" height="100" fill="transparent" />
                {b.value > 0 && <rect x={i * 10 + 1.5} y={100 - h} width="7" height={h} rx="1.2" fill="var(--chart)" opacity={hover === null || hover === i ? 1 : 0.55} />}
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-[0.75rem] text-fg shadow-[var(--shadow-raised)]"
            style={{ left: `calc(2rem + (100% - 2rem) * ${(hover + 0.5) / n})`, top: `${(1 - bars[hover].value / top) * 100}%` }}
          >
            {bars[hover].detail}
          </div>
        )}
      </div>
      <div className="ml-8 mt-1 grid text-[0.7rem] text-subtle" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
        {bars.map((b, i) => (
          <span key={b.key} className="truncate text-center">
            {n > 10 && i % 2 === 1 ? "" : b.label}
          </span>
        ))}
      </div>
      <details className="mt-2">
        <summary className="t-small cursor-pointer text-muted">Show as table</summary>
        <table className="t-small mt-2 w-full">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1 font-medium">Period</th>
              <th className="py-1 text-right font-medium">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((b) => (
              <tr key={b.key} className="border-t border-border">
                <td className="py-1">{b.label}</td>
                <td className="py-1 text-right tabular">{b.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
