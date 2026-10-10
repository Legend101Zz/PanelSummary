import type { Metadata } from "next";
import { SettingsScreen } from "@/components/settings/SettingsScreen";

export const metadata: Metadata = { title: "Settings and about" };

export default function Page() {
  return <SettingsScreen />;
}
