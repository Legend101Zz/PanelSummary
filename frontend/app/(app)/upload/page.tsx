import type { Metadata } from "next";
import { AddBookScreen } from "@/components/shelf/AddBookScreen";

export const metadata: Metadata = { title: "Add a book" };

export default function Page() {
  return <AddBookScreen />;
}
