"use client";

import { useSearchParams } from "next/navigation";
import { GameAnalysisView } from "./GameAnalysisView";
import { LibraryView } from "./LibraryView";
import { PositionExplorer } from "./PositionExplorer";

export function AnalysisRouter() {
  const params = useSearchParams();
  const id = params.get("game");
  const fen = params.get("fen");
  if (id) {
    const ply = Number(params.get("ply"));
    return <GameAnalysisView key={id} gameId={id} initialPly={Number.isInteger(ply) && ply > 0 ? ply : undefined} />;
  }
  if (fen !== null) return <PositionExplorer fen={fen.trim()} />;
  return <LibraryView />;
}
