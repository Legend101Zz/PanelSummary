"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, getSamplePreview, installSample, type SamplePreview } from "@/lib/api";
import { OFFLINE_SENTENCE, type SampleRunFacts } from "@/lib/words";
import { ANDERSEN_FACTS, ANDERSEN_SAMPLE_ID, ANDERSEN_TITLE } from "./sampleFacts";

/** The numbers of the screens, from the read-only preview. The same values the installed edition gives. */
export function factsFromPreview(p: SamplePreview): SampleRunFacts {
  return {
    pages: p.pages_accepted || p.page_total,
    firstPageSeconds: p.timings.first_page_seconds,
    firstIsPage1: p.timings.first_is_page_1,
    totalSeconds: p.timings.total_seconds,
    costUsd: p.cost_usd,
    estimate: { pages: p.estimate.estimated_manga_pages, firstPageMin: p.estimate.estimated_minutes.first_page, totalMin: p.estimate.estimated_minutes.total, costUsd: p.estimate.estimated_cost_usd },
  };
}

/**
 * The built-in sample. It reads GET /samples/{id}/preview: nothing is installed when a screen opens, so the first run
 * still replaces the empty shelf. `open` installs the sample (safe to repeat, no model call) ONLY when a person clicks,
 * then opens the reader at page 1 (or the PDF viewer, when `source` is given).
 */
export function useSample() {
  const router = useRouter();
  // undefined: loading, null: could not be read
  const [preview, setPreview] = useState<SamplePreview | null | undefined>(undefined);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getSamplePreview(ANDERSEN_SAMPLE_ID)
      .then((p) => alive && setPreview(p))
      .catch(() => alive && setPreview(null));
    return () => {
      alive = false;
    };
  }, []);

  const open = useCallback(
    async (opts: { page?: number; source?: number } = {}) => {
      setOpening(true);
      setError(null);
      try {
        const r = await installSample(ANDERSEN_SAMPLE_ID);
        const reader = `/books/${r.book_id}/read?edition=${r.edition_id}&page=${opts.page ?? 1}`;
        router.push(opts.source ? `/books/${r.book_id}/source?page=${opts.source}&from=${encodeURIComponent(reader)}` : reader);
      } catch (e) {
        setOpening(false);
        setError(e instanceof ApiError && e.status === 0 ? OFFLINE_SENTENCE : e instanceof ApiError ? `The sample could not be opened. ${e.message}` : "The sample could not be opened.");
      }
    },
    [router],
  );

  return {
    preview,
    title: preview?.title ?? ANDERSEN_TITLE,
    facts: preview ? factsFromPreview(preview) : ANDERSEN_FACTS,
    book: { pdfPages: preview?.pdf_pages ?? 22, sections: preview?.sections ?? 4 },
    live: !!preview,
    svg: preview?.cover_svg ?? null,
    opening,
    error,
    open,
  };
}
