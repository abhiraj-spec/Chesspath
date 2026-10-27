"use client";

import { useSearchParams } from "next/navigation";
import { GameAnalysisView } from "./GameAnalysisView";
import { LibraryView } from "./LibraryView";

export function AnalysisRouter() {
  const id = useSearchParams().get("game");
  return id ? <GameAnalysisView key={id} gameId={id} /> : <LibraryView />;
}
