import type { Metadata } from "next";
import { Onboarding } from "@/components/onboarding/Onboarding";

export const metadata: Metadata = { title: "Welcome" };

export default function OnboardingPage() {
  return <Onboarding />;
}
