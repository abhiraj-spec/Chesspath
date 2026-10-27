import type { Metadata } from "next";
import { Suspense } from "react";
import { PuzzleTrainer } from "@/components/puzzles/PuzzleTrainer";
import { PageSkeleton } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Puzzles" };

export default function PuzzlesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PuzzleTrainer />
    </Suspense>
  );
}
