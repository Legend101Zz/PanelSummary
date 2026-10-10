import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Gallery } from "./Gallery";

export const metadata: Metadata = { title: "Components" };

// Every shared component in every state. Development only: a production build answers 404.
export default function ComponentsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Gallery />;
}
