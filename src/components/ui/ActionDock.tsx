"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/util";

const noop = () => () => {};
/** true in the browser, false while pre-rendering (so the portal never causes a hydration mismatch). */
function useIsClient() {
  return useSyncExternalStore(noop, () => true, () => false);
}

const MOBILE = "(max-width: 1023px)";

/**
 * The "what next" buttons of an exercise.
 * - Large screens: shown inline, inside the panel next to the board.
 * - Phones and tablets: shown in a bar fixed above the bottom navigation, so they never need
 *   scrolling. When the dock first appears after the learner solves something, the panel is
 *   scrolled into view so the explanation is visible right above the button.
 */
export function ActionDock({ children, note, revealPanel = true, className, dockOnly }: { children: ReactNode; note?: ReactNode; revealPanel?: boolean; className?: string; /** The caller shows its own version on large screens. */ dockOnly?: boolean }) {
  const isClient = useIsClient();
  const anchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!revealPanel || !window.matchMedia(MOBILE).matches) return;
    const panel = anchor.current?.closest("[data-panel]");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.reducedMotion === "true";
    panel?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [revealPanel]);
  return (
    <>
      <div ref={anchor} className={cn("mt-4 hidden flex-wrap gap-2", !dockOnly && "lg:flex", className)}>
        {!dockOnly && children}
      </div>
      {isClient &&
        createPortal(
          <div
            className="animate-fade-in fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-surface/95 px-4 pb-3 pt-2.5 shadow-[var(--shadow-overlay)] backdrop-blur lg:hidden"
            data-testid="action-dock"
            data-action-dock
          >
            <div className="mx-auto max-w-xl">
              {note && <div className="t-small mb-2 font-medium text-fg">{note}</div>}
              <div className="flex gap-2 [&>*:first-child]:flex-1">{children}</div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Focuses whichever copy of a button is visible (inline on large screens, docked on phones). */
export function focusVisible(selector: string) {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    if (el.offsetParent !== null) {
      el.focus({ preventScroll: true });
      return;
    }
  }
}
