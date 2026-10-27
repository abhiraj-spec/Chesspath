import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalysisRouter } from "@/components/analysis/AnalysisRouter";
import { PageSkeleton } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Analysis" };

export default function AnalysisPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AnalysisRouter />
    </Suspense>
  );
}
