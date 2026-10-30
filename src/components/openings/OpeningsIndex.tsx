"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Repeat } from "lucide-react";
import { OPENINGS } from "@/content/openings/library";
import { useOpeningProgress, useReviews } from "@/hooks/data";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { isDue } from "@/lib/learning/srs";
import { MiniBoard } from "@/components/board/MiniBoard";
import { Chess } from "chess.js";
import { useNow } from "@/hooks/useNow";

export function OpeningsIndex() {
  const progress = useOpeningProgress();
  const reviews = useReviews();
  const now = useNow();
  const due = useMemo(() => (reviews ?? []).filter((c) => c.kind === "opening" && isDue(c, now)), [reviews, now]);
  return (
    <div>
      <PageHeader
        eyebrow="Openings"
        title="Opening explorer"
        description="Understand the ideas behind each move, then practise the lines from memory. Learned lines come back for review at growing intervals."
      />
      {due.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-info/30 bg-info-soft px-4 py-3">
          <Repeat className="h-5 w-5 text-info" aria-hidden />
          <p className="t-small flex-1 text-fg">
            {due.length} opening line{due.length === 1 ? " is" : "s are"} due for recall:{" "}
            {due.slice(0, 3).map((c, i) => {
              const [oid, vid] = c.refId.split(":");
              const o = OPENINGS.find((x) => x.id === oid);
              const v = o?.variations.find((x) => x.id === vid);
              return (
                <span key={c.id}>
                  {i > 0 && ", "}
                  <Link className="font-medium underline" href={`/openings/${oid}/?v=${vid}&mode=recall`}>
                    {o?.name}: {v?.name}
                  </Link>
                </span>
              );
            })}
          </p>
        </div>
      )}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {OPENINGS.map((o) => {
          const learned = o.variations.filter((v) => (progress?.get(`${o.id}:${v.id}`)?.successfulRecalls ?? 0) > 0).length;
          const c = new Chess();
          for (const mv of o.variations[0].moves.slice(0, o.side === "w" ? 5 : 6)) c.move(mv.san);
          return (
            <li key={o.id}>
              <Link href={`/openings/${o.id}/`} className="group flex h-full gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-card)] hover:border-accent/50">
                <div className="w-24 shrink-0" aria-hidden>
                  <MiniBoard fen={c.fen()} orientation={o.side} />
                </div>
                <div className="min-w-0">
                  <h2 className="t-card group-hover:text-accent">{o.name}</h2>
                  <p className="t-small text-muted">
                    {o.eco} · play as {o.side === "w" ? "White" : "Black"}
                  </p>
                  <p className="t-small mt-1.5 line-clamp-3 text-muted">{o.summary}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge>{o.level}</Badge>
                    <Badge tone={learned ? "success" : "neutral"}>
                      {learned}/{o.variations.length} lines recalled
                    </Badge>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="t-small mt-6 text-subtle">Opening names and ECO codes are cross-checked against the Lichess chess-openings database (public domain).</p>
    </div>
  );
}
