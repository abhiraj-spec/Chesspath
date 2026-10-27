import type { Metadata } from "next";
import { PlayView } from "@/components/play/PlayView";

export const metadata: Metadata = { title: "Play" };

export default function PlayPage() {
  return <PlayView />;
}
