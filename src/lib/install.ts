/**
 * "Install as an app" support.
 * - Chrome, Edge and Android browsers fire `beforeinstallprompt`; we keep that event so a button
 *   can open the browser's install dialog later.
 * - iPhone/iPad have no such event: installing is done from Safari's Share menu, so we show steps.
 * The event can fire before React starts, so INSTALL_BOOTSTRAP (inlined in <head>) catches it early.
 */
import { useSyncExternalStore } from "react";
export { INSTALL_BOOTSTRAP } from "./install-bootstrap";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
type W = Window & { __cpInstall?: InstallPromptEvent | null; __cpInstalled?: boolean };


export type InstallPlatform = "ios" | "android" | "desktop";
export interface InstallState {
  /** Running as an installed app (home screen / desktop app window). */
  installed: boolean;
  /** The browser's own install dialog can be opened with a button. */
  canPrompt: boolean;
  platform: InstallPlatform;
}

function platformOf(): InstallPlatform {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

let cached: InstallState | null = null;
let cachedKey = "";
function snapshot(): InstallState {
  const w = window as W;
  const installed = Boolean(w.__cpInstalled) || matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const canPrompt = !installed && Boolean(w.__cpInstall);
  const platform = platformOf();
  const key = `${installed}|${canPrompt}|${platform}`;
  if (!cached || key !== cachedKey) {
    cached = { installed, canPrompt, platform };
    cachedKey = key;
  }
  return cached;
}
const SERVER: InstallState = { installed: false, canPrompt: false, platform: "desktop" };

function subscribe(cb: () => void) {
  window.addEventListener("cp-install-change", cb);
  const mq = matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", cb);
  return () => {
    window.removeEventListener("cp-install-change", cb);
    mq.removeEventListener("change", cb);
  };
}

export function useInstall(): InstallState {
  return useSyncExternalStore(subscribe, snapshot, () => SERVER);
}

/** Opens the browser's install dialog. Resolves to true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const w = window as W;
  const e = w.__cpInstall;
  if (!e) return false;
  await e.prompt();
  const choice = await e.userChoice;
  // The event can only be used once.
  w.__cpInstall = null;
  window.dispatchEvent(new Event("cp-install-change"));
  return choice.outcome === "accepted";
}
