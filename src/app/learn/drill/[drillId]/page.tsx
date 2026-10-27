import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DRILLS, getDrill } from "@/content/drills";
import { DrillPlayer } from "@/components/learn/DrillPlayer";

export const dynamicParams = false;

export function generateStaticParams() {
  return DRILLS.map((d) => ({ drillId: d.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ drillId: string }> }): Promise<Metadata> {
  const { drillId } = await params;
  return { title: getDrill(drillId)?.title ?? "Drill" };
}

export default async function DrillPage({ params }: { params: Promise<{ drillId: string }> }) {
  const { drillId } = await params;
  const drill = getDrill(drillId);
  if (!drill) notFound();
  return <DrillPlayer drillId={drill.id} />;
}
