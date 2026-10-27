"use client";

import { useEffect, useRef } from "react";
import { logActivity, getProfile } from "@/lib/db/repo";
import type { ActivityEntry } from "@/lib/db/types";

/**
 * Measures time actually spent on an activity: counts only while the tab is visible,
 * ignores idle gaps longer than 2 minutes without interaction, and records the total
 * to the training log when the component unmounts (or every 2 minutes).
 */
export function useActivityTimer(type: ActivityEntry["type"], refId?: string, active = true) {
  const acc = useRef(0);
  const lastTick = useRef<number | null>(null);
  const lastInteraction = useRef(0);

  useEffect(() => {
    if (!active) return;
    const IDLE_MS = 2 * 60 * 1000;
    lastInteraction.current = Date.now();
    lastTick.current = document.visibilityState === "visible" ? Date.now() : null;
    const tick = () => {
      const now = Date.now();
      if (lastTick.current !== null && now - lastInteraction.current < IDLE_MS) acc.current += now - lastTick.current;
      lastTick.current = document.visibilityState === "visible" ? now : null;
    };
    const flush = async () => {
      tick();
      const ms = acc.current;
      acc.current = 0;
      if (ms >= 1000) {
        const profile = await getProfile().catch(() => undefined);
        await logActivity({ type, refId, durationMs: ms }, profile?.dailyTargetMinutes).catch(() => {});
      }
    };
    const onInteract = () => {
      tick();
      lastInteraction.current = Date.now();
    };
    const onVis = () => tick();
    const interval = setInterval(() => void flush(), 2 * 60 * 1000);
    window.addEventListener("pointerdown", onInteract);
    window.addEventListener("keydown", onInteract);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(interval);
      window.removeEventListener("pointerdown", onInteract);
      window.removeEventListener("keydown", onInteract);
      document.removeEventListener("visibilitychange", onVis);
      void flush();
    };
  }, [type, refId, active]);
}
