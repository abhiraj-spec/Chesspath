"use client";

import { useEffect, useState } from "react";

/**
 * The current time, captured at mount and (optionally) refreshed every `refreshMs`,
 * so render output stays pure while due dates still update on long-open pages.
 */
export function useNow(refreshMs?: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!refreshMs) return;
    const t = setInterval(() => setNow(Date.now()), refreshMs);
    return () => clearInterval(t);
  }, [refreshMs]);
  return now;
}
