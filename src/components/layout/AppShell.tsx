"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  Home,
  LibraryBig,
  Menu,
  Microscope,
  Puzzle,
  Settings,
  Swords,
  X,
  BookA,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/util";
import { Logo } from "./Logo";
import { applyDocumentSettings, getSettings } from "@/lib/settings";

export const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/learn/", label: "Learn", icon: BookOpen },
  { href: "/puzzles/", label: "Puzzles", icon: Puzzle },
  { href: "/play/", label: "Play", icon: Swords },
  { href: "/openings/", label: "Openings", icon: LibraryBig },
  { href: "/analysis/", label: "Analysis", icon: Microscope },
  { href: "/progress/", label: "Progress", icon: BarChart3 },
] as const;

const SECONDARY = [
  { href: "/glossary/", label: "Glossary", icon: BookA },
  { href: "/settings/", label: "Settings", icon: Settings },
] as const;

/** Mobile bottom bar shows the four most used sections; the rest are in "More". */
const MOBILE_PRIMARY = ["/", "/learn/", "/puzzles/", "/play/"];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href) || pathname === href.replace(/\/$/, "");
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [moreOpen, setMoreOpen] = useState(false);
  const [offline, setOffline] = useState(false);
  const focusMode = pathname.startsWith("/onboarding");

  useEffect(() => {
    applyDocumentSettings(getSettings());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyDocumentSettings(getSettings());
    mq.addEventListener("change", onChange);
    const updateOnline = () => setOffline(!navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setMoreOpen(false);
  }

  if (focusMode) {
    return (
      <div className="min-h-dvh">
        <main id="main" className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface px-3 py-5 lg:flex" aria-label="Primary">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-2" aria-label="ChessPath home">
          <Logo />
        </Link>
        <nav aria-label="Main sections">
          <ul className="space-y-0.5">
            {NAV.map((item) => (
              <li key={item.href}>
                <NavLink {...item} active={isActive(pathname, item.href)} />
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-auto space-y-0.5 border-t border-border pt-3">
          {SECONDARY.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} />
          ))}
          {offline && (
            <p className="t-small mt-2 flex items-center gap-2 px-3 text-muted">
              <WifiOff className="h-4 w-4" aria-hidden /> Offline: saved content still works
            </p>
          )}
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur lg:hidden">
        <Link href="/" aria-label="ChessPath home" className="flex items-center gap-2">
          <Logo compact />
        </Link>
        <div className="flex items-center gap-1">
          {offline && <WifiOff className="h-4 w-4 text-muted" aria-label="Offline" />}
          <Link href="/settings/" className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] text-muted hover:bg-surface-2" aria-label="Settings">
            <Settings className="h-5 w-5" aria-hidden />
          </Link>
        </div>
      </header>

      <main id="main" className="min-w-0 flex-1 pb-24 lg:pb-10">
        <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>

      {/* Mobile bottom navigation */}
      <nav aria-label="Main sections" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="grid grid-cols-5">
          {NAV.filter((n) => MOBILE_PRIMARY.includes(n.href)).map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[0.7rem] font-medium", active ? "text-accent" : "text-muted")}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={cn(
                "flex h-16 w-full flex-col items-center justify-center gap-1 text-[0.7rem] font-medium",
                [...NAV, ...SECONDARY].some((n) => !MOBILE_PRIMARY.includes(n.href) && isActive(pathname, n.href)) ? "text-accent" : "text-muted",
              )}
            >
              <Menu className="h-5 w-5" aria-hidden />
              More
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen && <MoreSheet pathname={pathname} onClose={() => setMoreOpen(false)} />}
    </div>
  );
}

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-[0.9rem] font-medium transition-colors",
        active ? "bg-accent-soft text-accent-soft-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
      {label}
    </Link>
  );
}

function MoreSheet({ pathname, onClose }: { pathname: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const items = [...NAV.filter((n) => !MOBILE_PRIMARY.includes(n.href)), ...SECONDARY];
  return (
    <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="More sections">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={onClose} />
      <div className="animate-fade-in absolute inset-x-0 bottom-0 rounded-t-[var(--radius-xl)] border-t border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[var(--shadow-overlay)]">
        <div className="mb-2 flex items-center justify-between">
          <p className="t-card">More</p>
          <button type="button" onClick={onClose} className="rounded p-2 text-muted hover:bg-surface-2" aria-label="Close menu" autoFocus>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <ul className="grid grid-cols-2 gap-2">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-[var(--radius-md)] border px-3 py-3 font-medium",
                    active ? "border-accent/30 bg-accent-soft text-accent-soft-fg" : "border-border text-fg hover:bg-surface-2",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
