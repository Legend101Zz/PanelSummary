/**
 * manga/page.tsx — Manga Reader Page
 * =====================================
 * Horizontal swipe reader for manga panels.
 * Powered by the MangaReader component.
 */

"use client";

import { useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { getSummary } from "@/lib/api";
import type { Summary } from "@/lib/types";
import { MangaReader } from "@/components/MangaReader";

export default function MangaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const summaryId = searchParams.get("summary");

  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!summaryId) {
      setError("No summary ID provided");
      setLoading(false);
      return;
    }

    getSummary(summaryId)
      .then((data) => {
        if (data.status !== "complete") {
          setError("Summary not yet complete");
        } else {
          setSummary(data);
        }
      })
      .catch(() => setError("Failed to load summary"))
      .finally(() => setLoading(false));
  }, [summaryId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-plasma animate-spin" />
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4">
        <div>
          <AlertCircle className="w-12 h-12 text-sakura mx-auto mb-4" />
          <h1 className="font-display font-bold text-2xl text-text-primary mb-2">{error}</h1>
        </div>
      </div>
    );
  }

  return <MangaReader summary={summary} />;
}
