import { cn } from "@/lib/util";

/** The ChessPath mark: a gold knight on navy (knight artwork from the cburnett piece set, GPLv2+). */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden className="shrink-0">
      <rect width="512" height="512" rx="112" fill="#1b2a41" />
      <g transform="translate(51.30 36.60) scale(9.2)"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21 M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" fill="#e3b448" stroke="#e3b448" strokeWidth="1.6" strokeLinejoin="round"/><path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0m5.433-9.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5" fill="#1b2a41" stroke="#1b2a41" strokeWidth="1"/></g>
    </svg>
  );
}

/** Mark + wordmark. `onBrand` is for the navy app bars. */
export function Logo({ compact, onBrand }: { compact?: boolean; onBrand?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={compact ? 30 : 34} />
      <span className={cn("font-serif text-[1.25rem] font-semibold tracking-tight", onBrand ? "text-on-brand" : "text-fg")}>ChessPath</span>
    </span>
  );
}
