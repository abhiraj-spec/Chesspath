"use client";

import { useSyncExternalStore } from "react";

/**
 * Lightweight preferences live in localStorage (synchronous, available before paint).
 * Learning data lives in IndexedDB (see src/lib/db).
 */
export type ThemePref = "system" | "light" | "dark";
export type BoardTheme = "green" | "brown" | "blue";
export type OrientationPref = "auto" | "white";
export type MotionPref = "system" | "reduce" | "full";

export interface Settings {
  theme: ThemePref;
  sound: boolean;
  orientation: OrientationPref;
  coordinates: boolean;
  showLegalMoves: boolean;
  showLastMove: boolean;
  dragToMove: boolean;
  moveTextInput: boolean;
  defaultDifficulty: 1 | 2 | 3 | 4 | 5;
  motion: MotionPref;
  boardTheme: BoardTheme;
  /** True once the learner picks board colours themselves (an untouched default can change between versions). */
  boardThemeChosen: boolean;
  showEvalBar: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  sound: true,
  orientation: "auto",
  coordinates: true,
  showLegalMoves: true,
  showLastMove: true,
  dragToMove: true,
  moveTextInput: false,
  defaultDifficulty: 2,
  motion: "system",
  boardTheme: "blue",
  boardThemeChosen: false,
  showEvalBar: true,
};

export const SETTINGS_KEY = "chesspath.settings.v1";

let cache: Settings | null = null;
const listeners = new Set<() => void>();

function read(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return sanitize(parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Drop unknown or wrongly-typed values so a corrupted entry never breaks the app. */
export function sanitize(input: Partial<Settings>): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const v = input[key];
    if (v === undefined) continue;
    if (typeof v !== typeof DEFAULT_SETTINGS[key]) continue;
    (out as unknown as Record<string, unknown>)[key] = v;
  }
  const enums: Partial<Record<keyof Settings, readonly unknown[]>> = {
    theme: ["system", "light", "dark"],
    orientation: ["auto", "white"],
    motion: ["system", "reduce", "full"],
    boardTheme: ["green", "brown", "blue"],
    defaultDifficulty: [1, 2, 3, 4, 5],
  };
  for (const [k, allowed] of Object.entries(enums)) {
    const key = k as keyof Settings;
    if (!allowed!.includes(out[key])) (out as unknown as Record<string, unknown>)[key] = DEFAULT_SETTINGS[key];
  }
  // Before version 2 of the look, every saved settings object stored the old default board ("green")
  // even if the learner never chose it. Unless they chose colours themselves, use the current default.
  if (!out.boardThemeChosen && out.boardTheme === "green") out.boardTheme = DEFAULT_SETTINGS.boardTheme;
  return out;
}

export function getSettings(): Settings {
  if (!cache) cache = read();
  return cache;
}

export function updateSettings(patch: Partial<Settings>) {
  cache = sanitize({ ...getSettings(), ...patch });
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(cache));
  } catch {
    /* storage full or blocked: keep in memory */
  }
  applyDocumentSettings(cache);
  listeners.forEach((l) => l());
}

export function resetSettings() {
  try {
    window.localStorage.removeItem(SETTINGS_KEY);
  } catch {}
  cache = DEFAULT_SETTINGS;
  applyDocumentSettings(cache);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === SETTINGS_KEY) {
      cache = read();
      applyDocumentSettings(cache);
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, () => DEFAULT_SETTINGS);
}

export function resolvedTheme(pref: ThemePref): "light" | "dark" {
  if (pref !== "system") return pref;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function prefersReducedMotion(s: Settings = getSettings()): boolean {
  if (s.motion === "reduce") return true;
  if (s.motion === "full") return false;
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function applyDocumentSettings(s: Settings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme(s.theme);
  root.dataset.reducedMotion = String(s.motion === "reduce");
  root.dataset.board = s.boardTheme;
}

/**
 * Inline script run before first paint to avoid a flash of the wrong theme.
 * Kept tiny and dependency-free.
 */
/**
 * Runs in <head> before the app starts.
 * 1. Hosts such as Netlify's free plan insert an HTML comment (and line breaks) into <head>. React
 *    treats those as a mismatch and logs a hydration error, then re-renders the whole page. The
 *    app's own <head> never contains comments or whitespace-only text, so removing them is safe.
 * 2. Applies the theme, motion and board settings before first paint.
 */
export const THEME_BOOTSTRAP = `(function(){try{var h=document.head;for(var n=h.firstChild;n;){var x=n.nextSibling;if(n.nodeType===8||(n.nodeType===3&&!n.textContent.trim()))h.removeChild(n);n=x}}catch(e){}})();(function(){try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(
  SETTINGS_KEY,
)})||"{}");var t=s.theme||"system";if(t==="system"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}var r=document.documentElement;r.dataset.theme=t;r.dataset.reducedMotion=String(s.motion==="reduce");var b=s.boardTheme;if(!s.boardThemeChosen&&(!b||b==="green"))b="blue";r.dataset.board=b;}catch(e){document.documentElement.dataset.theme="light"}})();`;
