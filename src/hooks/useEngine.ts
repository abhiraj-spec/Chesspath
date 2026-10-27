"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getEngine, type EngineClient, type EngineStatus } from "@/lib/engine/client";

/** Access the shared Stockfish client and re-render on status changes. */
export function useEngine(autoInit = true): { engine: EngineClient; status: EngineStatus; error: string | null; restart: () => Promise<void> } {
  const engine = getEngine();
  const status = useSyncExternalStore(
    (cb) => engine.onStatus(cb),
    () => engine.status,
    () => "idle" as EngineStatus,
  );
  useEffect(() => {
    if (autoInit && engine.status === "idle") engine.init().catch(() => {});
  }, [engine, autoInit]);
  return {
    engine,
    status,
    error: engine.lastError,
    restart: async () => {
      try {
        await engine.restart();
      } catch {
        /* status reflects the failure */
      }
    },
  };
}
