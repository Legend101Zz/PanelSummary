"use client";

import { useEffect, useState } from "react";
import { loadPage } from "@/lib/api";
import { useNearViewport } from "@/lib/hooks";
import { SvgPage } from "./SvgPage";

/**
 * The first drawn page of an edition, used as the book's cover. Renders
 * nothing (so the caller's fallback shows) until page 1 is accepted.
 */
export function useFirstPage(editionId: string | undefined, enabled: boolean) {
  const [svg, setSvg] = useState<string | null>(null);
  const [ref, near] = useNearViewport<HTMLLIElement>();
  useEffect(() => {
    if (!editionId || !enabled || !near || svg) return;
    let live = true;
    loadPage(editionId, 1)
      .then((page) => {
        if (live && page.status === "accepted" && page.svg) setSvg(page.svg);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [editionId, enabled, near, svg]);
  return { ref, svg };
}

export function CoverSvg({ svg }: { svg: string }) {
  return <SvgPage svg={svg} decorative />;
}
