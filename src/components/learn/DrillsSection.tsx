"use client";

import Link from "next/link";
import { Target, CheckCircle2 } from "lucide-react";
import { DRILLS } from "@/content/drills";
import { useAttempts } from "@/hooks/data";
import { DifficultyBadge } from "@/components/ui/primitives";

export function DrillsSection() {
  const attempts = useAttempts();
  return (
    <section id="drills" aria-labelledby="drills-title" className="scroll-mt-20">
      <div className="mb-3">
        <p className="t-label text-accent">Practice</p>
        <h2 id="drills-title" className="t-section">
          Endgame drills against Stockfish
        </h2>
        <p className="t-small mt-0.5 max-w-2xl text-muted">Play key endgame positions out against the engine. A drill only counts when the goal is actually reached on the board.</p>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {DRILLS.map((d) => {
          const wins = (attempts ?? []).filter((a) => a.kind === "drill" && a.refId === d.id && a.solved).length;
          return (
            <li key={d.id}>
              <Link href={`/learn/drill/${d.id}/`} className="group flex h-full flex-col rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-card)] hover:border-accent/50">
                <div className="flex items-start gap-3">
                  {wins > 0 ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden /> : <Target className="mt-0.5 h-5 w-5 shrink-0 text-subtle" aria-hidden />}
                  <div>
                    <h3 className="t-card group-hover:text-accent">{d.title}</h3>
                    <p className="t-small mt-0.5 text-muted">{d.description}</p>
                  </div>
                </div>
                <div className="mt-auto flex items-center gap-3 pt-3">
                  <DifficultyBadge level={d.difficulty} />
                  {wins > 0 && <span className="t-small text-success">Achieved {wins}×</span>}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
