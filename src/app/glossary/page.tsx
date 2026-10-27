import type { Metadata } from "next";
import { GlossaryView } from "@/components/glossary/GlossaryView";

export const metadata: Metadata = { title: "Glossary" };

export default function GlossaryPage() {
  return <GlossaryView />;
}
