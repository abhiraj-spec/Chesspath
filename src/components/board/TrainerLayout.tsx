import type { ReactNode } from "react";
import { cn } from "@/lib/util";

/**
 * Shared layout for every board screen: the board stays dominant.
 * Desktop: board left, panel right. Mobile: board on top, panel below.
 * The board is capped by viewport height so it never forces scrolling on laptops.
 */
export function TrainerLayout({ board, panel, above, className }: { board: ReactNode; panel: ReactNode; above?: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(17rem,20rem)] md:items-start lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]", className)}>
      <div className="min-w-0">
        {above}
        <div className="mx-auto w-full max-w-[min(100%,calc(100dvh-10rem))] md:max-w-[min(100%,calc(100dvh-8rem))] lg:max-w-[min(100%,calc(100dvh-7rem))]">{board}</div>
      </div>
      <aside className="min-w-0 md:sticky md:top-20 lg:top-6">{panel}</aside>
    </div>
  );
}

export function PanelCard({ children, className }: { children: ReactNode; className?: string }) {
  // data-panel + scroll margin: on phones the panel is scrolled into view (below the sticky header) after solving.
  return <div data-panel className={cn("scroll-mt-20 rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5", className)}>{children}</div>;
}
