"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, getBook, getEdition, getPreflight, installSample, listSamples, loadPage, type SampleInfo } from "@/lib/api";
import { OFFLINE_SENTENCE, sampleRunFacts, type SampleRunFacts } from "@/lib/words";
import { ANDERSEN_FACTS, ANDERSEN_SAMPLE_ID, ANDERSEN_TITLE } from "./sampleFacts";

/**
 * The built-in sample. Reads GET /samples. When the sample is installed it reads the real edition and its estimate
 * (no model call). `open` installs the sample (safe to repeat) and opens the reader at page 1.
 */
export function useSample({ install = false }: { install?: boolean } = {}) {
  const router = useRouter();
  const [info, setInfo] = useState<SampleInfo | null | undefined>(undefined);
  const [facts, setFacts] = useState<SampleRunFacts>(ANDERSEN_FACTS);
  const [live, setLive] = useState(false);
  const [book, setBook] = useState({ pdfPages: 22, sections: 4 });
  const [svg, setSvg] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listSamples()
      .then(async (list) => {
        let first: SampleInfo | null = list[0] ?? null;
        // the landing needs the real sample on screen: install it (safe to repeat, no model call)
        if (install && first && !first.installed) {
          const r = await installSample(first.id).catch(() => null);
          if (r) first = { ...first, installed: true, book_id: r.book_id, edition_id: r.edition_id };
        }
        if (alive) setInfo(first);
      })
      .catch(() => alive && setInfo(null));
    return () => {
      alive = false;
    };
  }, [install]);

  useEffect(() => {
    if (!info?.installed || !info.edition_id || !info.book_id) return;
    let alive = true;
    Promise.all([getEdition(info.edition_id), getPreflight(info.book_id), loadPage(info.edition_id, 1), getBook(info.book_id)])
      .then(([edition, preflight, page, b]) => {
        if (!alive) return;
        setFacts(sampleRunFacts(edition, preflight));
        setBook({ pdfPages: b.page_count, sections: b.section_count });
        setLive(true);
        if (page.status === "accepted" && page.svg) setSvg(page.svg);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [info]);

  const open = useCallback(async () => {
    setOpening(true);
    setError(null);
    try {
      const r = await installSample(info?.id ?? ANDERSEN_SAMPLE_ID);
      router.push(`/books/${r.book_id}/read?edition=${r.edition_id}&page=1`);
    } catch (e) {
      setOpening(false);
      setError(e instanceof ApiError && e.status === 0 ? OFFLINE_SENTENCE : e instanceof ApiError ? `The sample could not be opened. ${e.message}` : "The sample could not be opened.");
    }
  }, [info, router]);

  return { info, title: info?.title ?? ANDERSEN_TITLE, facts, book, live, svg, opening, error, open };
}
