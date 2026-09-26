"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";
import { Reader } from "@/components/reader/Reader";

export default function ReadPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={null}>
      <Reader bookId={id} />
    </Suspense>
  );
}
