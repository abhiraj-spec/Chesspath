"use client";

import { useEffect, useRef } from "react";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
import type { Line } from "@/lib/chess/line";
import { moveRows } from "@/lib/chess/line";
import { IconButton } from "@/components/ui/Button";
import { cn } from "@/lib/util";
import type { MoveClass } from "@/lib/db/types";
import { PIECE_SVG } from "./pieces";
import { capturedPieces, materialBalance } from "@/lib/chess/status";

/**
 * How each move type is shown. `symbol` is the standard annotation shown in move lists;
 * `glyph` and `bg` are for the round badge (white text on `bg`, contrast-checked).
 */
export const CLASS_STYLE: Record<MoveClass, { label: string; symbol: string; className: string; glyph: string; bg: string }> = {
  brilliant: { label: "Brilliant", symbol: "!!", className: "text-[#0f7a76] dark:text-[#3fd0c9]", glyph: "!!", bg: "#0f7a76" },
  great: { label: "Great", symbol: "!", className: "text-[#2f629a] dark:text-[#8ab8ea]", glyph: "!", bg: "#2f629a" },
  best: { label: "Best", symbol: "", className: "", glyph: "★", bg: "#3f7a1c" },
  excellent: { label: "Excellent", symbol: "", className: "", glyph: "✓", bg: "#527a30" },
  good: { label: "Good", symbol: "", className: "", glyph: "✓", bg: "#5f6e52" },
  book: { label: "Book", symbol: "", className: "text-muted", glyph: "📖", bg: "#7d5f3c" },
  inaccuracy: { label: "Inaccuracy", symbol: "?!", className: "text-warning", glyph: "?!", bg: "#9a6a00" },
  mistake: { label: "Mistake", symbol: "?", className: "text-[#c2410c] dark:text-[#fb923c]", glyph: "?", bg: "#b4470f" },
  blunder: { label: "Blunder", symbol: "??", className: "text-danger", glyph: "??", bg: "#b42318" },
};

/** Order used for counts tables, best first. */
export const CLASS_ORDER: MoveClass[] = ["brilliant", "great", "best", "excellent", "good", "book", "inaccuracy", "mistake", "blunder"];

/** Round badge with the move type's glyph. Always pair it with the label in text. */
export function ClassIcon({ cls, size = 20, className }: { cls: MoveClass; size?: number; className?: string }) {
  const st = CLASS_STYLE[cls];
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-bold leading-none text-white", className)}
      style={{ background: st.bg, width: size, height: size, fontSize: cls === "book" ? size * 0.55 : st.glyph.length > 1 ? size * 0.5 : size * 0.62 }}
    >
      {st.glyph}
    </span>
  );
}

/**
 * Move list with keyboard-friendly navigation. `cursor` is the number of plies shown on the board.
 */
export function MoveList({
  line,
  cursor,
  onSelect,
  classes,
  className,
  emptyText = "No moves yet.",
  navClassName,
}: {
  line: Line;
  cursor: number;
  onSelect: (ply: number) => void;
  classes?: Map<number, MoveClass>;
  className?: string;
  emptyText?: string;
  /** Extra classes for the navigation buttons (e.g. to hide them where another copy is shown). */
  navClassName?: string;
}) {
  const rows = moveRows(line);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-ply="${cursor}"]`);
    if (el && listRef.current) {
      const parent = listRef.current;
      const top = el.offsetTop - parent.offsetTop;
      if (top < parent.scrollTop || top > parent.scrollTop + parent.clientHeight - 32) parent.scrollTop = top - parent.clientHeight / 2;
    }
  }, [cursor]);

  const cell = (m?: { ply: number; san: string }) => {
    if (!m) return <span className="px-2 py-1 text-subtle">…</span>;
    const cls = classes?.get(m.ply);
    const style = cls ? CLASS_STYLE[cls] : undefined;
    return (
      <button
        type="button"
        data-ply={m.ply}
        onClick={() => onSelect(m.ply)}
        aria-current={cursor === m.ply ? "step" : undefined}
        aria-label={`${m.san}${style && cls && cls !== "book" ? `, ${style.label}` : ""}`}
        className={cn("t-notation w-full rounded-[var(--radius-sm)] px-2 py-1 text-left hover:bg-surface-3", cursor === m.ply && "bg-accent-soft font-semibold text-accent-soft-fg", style?.className)}
      >
        <span className="inline-flex items-center gap-1">
          {cls && cls !== "book" && cls !== "good" && cls !== "excellent" && cls !== "best" && <ClassIcon cls={cls} size={15} />}
          {m.san}
          {style?.symbol && <span className="font-bold">{style.symbol}</span>}
        </span>
      </button>
    );
  };

  return (
    <div className={className}>
      <div ref={listRef} className="max-h-64 overflow-y-auto rounded-[var(--radius-md)] border border-border bg-surface-2 p-1 lg:max-h-80" aria-label="Moves" role="list">
        {rows.length === 0 ? (
          <p className="t-small px-2 py-3 text-muted">{emptyText}</p>
        ) : (
          rows.map((r) => (
            <div key={`${r.number}-${r.white?.ply ?? r.black?.ply}`} role="listitem" className="grid grid-cols-[2.5rem_1fr_1fr] items-center">
              <span className="t-notation pl-2 text-subtle">{r.number}.</span>
              {cell(r.white)}
              {cell(r.black)}
            </div>
          ))
        )}
      </div>
      <div className={cn("mt-2 flex items-center justify-center gap-1", navClassName)} role="toolbar" aria-label="Move navigation">
        <IconButton label="First position" size="sm" onClick={() => onSelect(0)} disabled={cursor === 0}>
          <ChevronFirst className="h-4 w-4" aria-hidden />
        </IconButton>
        <IconButton label="Previous move" size="sm" onClick={() => onSelect(Math.max(0, cursor - 1))} disabled={cursor === 0}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </IconButton>
        <IconButton label="Next move" size="sm" onClick={() => onSelect(Math.min(line.plies.length, cursor + 1))} disabled={cursor >= line.plies.length}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </IconButton>
        <IconButton label="Last position" size="sm" onClick={() => onSelect(line.plies.length)} disabled={cursor >= line.plies.length}>
          <ChevronLast className="h-4 w-4" aria-hidden />
        </IconButton>
      </div>
    </div>
  );
}

/** Keyboard shortcuts for stepping through moves: ← → Home End (ignored while typing). */
export function useMoveKeys(enabled: boolean, cursor: number, max: number, onSelect: (p: number) => void) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.getAttribute("role") === "application")) return;
      if (e.key === "ArrowLeft") onSelect(Math.max(0, cursor - 1));
      else if (e.key === "ArrowRight") onSelect(Math.min(max, cursor + 1));
      else if (e.key === "Home") onSelect(0);
      else if (e.key === "End") onSelect(max);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, cursor, max, onSelect]);
}

export function CapturedRow({ fen, color }: { fen: string; color: "w" | "b" }) {
  const caps = capturedPieces(fen)[color];
  const bal = materialBalance(fen) * (color === "w" ? 1 : -1);
  const captured = color === "w" ? "b" : "w";
  return (
    <div className="flex min-h-6 items-center gap-0.5" aria-label={`Pieces captured by ${color === "w" ? "White" : "Black"}: ${caps.length ? caps.join(", ") : "none"}`}>
      {caps.map((p, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={PIECE_SVG[`${captured}${p.toUpperCase()}`]} alt="" className="-mr-1.5 h-5 w-5" />
      ))}
      {bal > 0 && <span className="t-small ml-2 font-semibold text-muted tabular">+{bal}</span>}
    </div>
  );
}
