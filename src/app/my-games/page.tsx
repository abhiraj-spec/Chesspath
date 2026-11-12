import type { Metadata } from "next";
import { MyGamesView } from "@/components/mygames/MyGamesView";

export const metadata: Metadata = { title: "My games" };

export default function MyGamesPage() {
  return <MyGamesView />;
}
