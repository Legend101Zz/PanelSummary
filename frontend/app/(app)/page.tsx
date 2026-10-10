import type { Metadata } from "next";
import { ShelfScreen } from "@/components/shelf/ShelfScreen";

export const metadata: Metadata = { title: "Your shelf" };

export default function Page() {
  return <ShelfScreen />;
}
