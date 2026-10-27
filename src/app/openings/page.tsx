import type { Metadata } from "next";
import { OpeningsIndex } from "@/components/openings/OpeningsIndex";

export const metadata: Metadata = { title: "Openings" };

export default function OpeningsPage() {
  return <OpeningsIndex />;
}
