export function LogoMark({ size = 28 }: { size?: number }) {
  // A simple path climbing across a 2x2 board: "ChessPath".
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--accent)" />
      <rect x="6" y="6" width="10" height="10" rx="1.5" fill="var(--accent-contrast)" opacity="0.92" />
      <rect x="16" y="16" width="10" height="10" rx="1.5" fill="var(--accent-contrast)" opacity="0.92" />
      <path d="M9 23 C 13 23, 13 13, 23 9" stroke="var(--accent-contrast)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="23" cy="9" r="2.4" fill="var(--accent-contrast)" />
    </svg>
  );
}

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={compact ? 26 : 30} />
      <span className="font-serif text-[1.2rem] font-semibold tracking-tight text-fg">ChessPath</span>
    </span>
  );
}
