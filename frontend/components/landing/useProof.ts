"use client";

import { useEffect, useState } from "react";
import { loadPage, type EditionPage, type SampleInfo } from "@/lib/api";

export interface Proof {
  page: EditionPage;
  /** The panel that is shown (the second panel of page 1). */
  panel: EditionPage["panels"][number];
  /** The PDF pages that the panel comes from, from the page API. */
  pdfPages: number[];
}

/** The proof of the landing, read from the installed sample: one panel of a real page and the PDF pages it comes from. */
export function useProof(info: SampleInfo | null | undefined) {
  const [proof, setProof] = useState<Proof | null>(null);
  const [thumbs, setThumbs] = useState<{ page: number; svg: string }[]>([]);
  useEffect(() => {
    if (!info?.installed || !info.edition_id) return;
    const edition = info.edition_id;
    let alive = true;
    loadPage(edition, 1)
      .then((page) => {
        if (!alive || page.status !== "accepted") return;
        const panel = [...page.panels].sort((a, b) => a.order - b.order)[1] ?? page.panels[0];
        if (!panel) return;
        const src = page.sources.find((s) => s.panel === panel.id)?.source ?? [];
        setProof({ page, panel, pdfPages: Array.from(new Set(src.map((s) => s.page))).sort((a, b) => a - b) });
      })
      .catch(() => undefined);
    // pages 13, 17 and 18 pass the strict quality bar (design section 2)
    Promise.all([13, 17, 18].map((n) => loadPage(edition, n).then((p) => (p.status === "accepted" && p.svg ? { page: n, svg: p.svg } : null)).catch(() => null))).then((list) => {
      if (alive) setThumbs(list.filter((x): x is { page: number; svg: string } => !!x));
    });
    return () => {
      alive = false;
    };
  }, [info]);
  return { proof, thumbs };
}
