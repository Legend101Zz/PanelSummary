"use client";

/**
 * V2LaneReader — the ADR-009 compiled-geometry reader (Session 6).
 *
 * Renders the v2-architecture lane's composed pages (deterministically
 * lettered raster) and CONSUMES the compiled layout geometry: panel-by-
 * panel focus stepping in compiled read-rank order (RTL Z-path), with the
 * active panel outlined via its authored polygon. Flag-gated by the page
 * route; the legacy MangaPageRenderer path is untouched.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  panelsInReadingOrder,
  polygonPoints,
  v2MediaUrl,
  type V2ReaderPage,
} from "@/lib/manga-v2-lane";

interface V2LaneReaderProps {
  pages: V2ReaderPage[];
}

export function V2LaneReader({ pages }: V2LaneReaderProps) {
  const [pageIndex, setPageIndex] = useState(0);
  // -1 = whole page; 0..n-1 = focused panel in reading order.
  const [panelStep, setPanelStep] = useState(-1);

  const page = pages[pageIndex] ?? null;
  const orderedPanels = useMemo(
    () => panelsInReadingOrder(page?.compiled_layout ?? null),
    [page],
  );
  const activePanel = panelStep >= 0 ? orderedPanels[panelStep] ?? null : null;

  const stepForward = useCallback(() => {
    if (panelStep < orderedPanels.length - 1) {
      setPanelStep(panelStep + 1);
    } else if (pageIndex < pages.length - 1) {
      setPageIndex(pageIndex + 1);
      setPanelStep(-1);
    }
  }, [panelStep, orderedPanels.length, pageIndex, pages.length]);

  const stepBack = useCallback(() => {
    if (panelStep >= 0) {
      setPanelStep(panelStep - 1);
    } else if (pageIndex > 0) {
      setPageIndex(pageIndex - 1);
      setPanelStep(-1);
    }
  }, [panelStep, pageIndex]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // RTL manga convention: LEFT arrow advances the story.
      if (event.key === "ArrowLeft") stepForward();
      if (event.key === "ArrowRight") stepBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepForward, stepBack]);

  if (!page) {
    return (
      <div className="rounded-lg border border-zinc-700 p-8 text-center text-zinc-400">
        No v2-lane composed pages for this project yet.
      </div>
    );
  }

  const imageUrl = v2MediaUrl(page.composed.image_url);
  const content = page.composed.content;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex w-full max-w-2xl items-center justify-between text-sm text-zinc-400">
        <span>
          Page {page.page_index + 1} / {pages.length}
          {activePanel
            ? ` — panel ${activePanel.read_rank + 1}/${orderedPanels.length}`
            : ""}
        </span>
        <span>
          {content.composition_version ?? "composed-page.v1"}
          {content.has_art ? " · art" : " · DSL-only"}
          {` · ${content.text_element_count} text element(s)`}
        </span>
      </div>

      <div className="relative w-full max-w-2xl overflow-hidden rounded-lg border border-zinc-700 bg-white">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- raster
          // artifact served by the control plane; next/image needs remote
          // pattern config that belongs to a deploy change, not this seam.
          <img
            src={imageUrl}
            alt={`Composed manga page ${page.page_index + 1}`}
            className="block w-full"
          />
        ) : (
          <div className="flex aspect-[2/3] items-center justify-center text-zinc-500">
            composed image unavailable
          </div>
        )}
        {page.compiled_layout ? (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            {orderedPanels.map((panel) => (
              <polygon
                key={panel.panel_id}
                points={polygonPoints(panel)}
                fill={
                  activePanel && panel.panel_id === activePanel.panel_id
                    ? "rgba(59,130,246,0.12)"
                    : "transparent"
                }
                stroke={
                  activePanel && panel.panel_id === activePanel.panel_id
                    ? "#3b82f6"
                    : "transparent"
                }
                strokeWidth={0.6}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {/* RTL: the "next" control sits on the LEFT. */}
        <button
          type="button"
          onClick={stepForward}
          className="rounded-md border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
        >
          ◀ Next
        </button>
        <button
          type="button"
          onClick={() => setPanelStep(-1)}
          className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-800"
        >
          Whole page
        </button>
        <button
          type="button"
          onClick={stepBack}
          className="rounded-md border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
        >
          Back ▶
        </button>
      </div>
    </div>
  );
}
