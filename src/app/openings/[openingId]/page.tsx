import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OPENINGS, getOpening } from "@/content/openings/library";
import { OpeningTrainer } from "@/components/openings/OpeningTrainer";

export const dynamicParams = false;

export function generateStaticParams() {
  return OPENINGS.map((o) => ({ openingId: o.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ openingId: string }> }): Promise<Metadata> {
  const { openingId } = await params;
  return { title: getOpening(openingId)?.name ?? "Opening" };
}

export default async function OpeningPage({ params }: { params: Promise<{ openingId: string }> }) {
  const { openingId } = await params;
  const opening = getOpening(openingId);
  if (!opening) notFound();
  return <OpeningTrainer openingId={opening.id} />;
}
