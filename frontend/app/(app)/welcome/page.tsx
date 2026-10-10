import type { Metadata } from "next";
import { LandingScreen } from "@/components/landing/LandingScreen";

export const metadata: Metadata = { title: "Your book's PDF, drawn as a manga" };

export default function Page() {
  return <LandingScreen />;
}
