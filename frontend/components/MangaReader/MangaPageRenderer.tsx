"use client";

/**
 * MangaReader/MangaPageRenderer.tsx — top-level page renderer
 * =============================================================
 * Consumes a ``RenderedPage`` (the typed contract surface persisted
 * since Phase 4.5a) and lays out its panels. Direct successor to
 * ``V4PageRenderer`` — same gutter-grid + RTL flow, same legacy
 * panel-count fallback, same QA-only page-turn highlight.
 *
 * The crucial difference is shape: this renderer reads
 * ``rendered.storyboard_page.panels`` and ``rendered.composition``
 * directly. There is no V4 projection in between, so editorial intent
 * (purpose, shot_type, composition prose) reaches the renderer
 * un-flattened.
 */

import type { CSSProperties } from "react";
import type { RenderedPage } from "@/lib/types";
import { MangaPanelRenderer } from "./MangaPanelRenderer";
import {
  layoutForRenderedPage,
  rowsForRenderedPage,
} from "./page_layout";
import {
  artifactFor,
  emphasisOverrideFor,
} from "./derived_visuals";
import type { V4CharacterAsset } from "./asset_lookup";

interface MangaPageRendererProps {
  page: RenderedPage;
  className?: string;
  characterAssets?: V4CharacterAsset[];
  /**
   * QA-only: highlight the page-turn cell with a thin accent border so
   * editors can see the cliffhanger anchor at a glance. Defaults false
   * for the reader UI.
   */
  showPageTurnAnchor?: boolean;
}

/**
 * Highlight applied to the page-turn cell when ``showPageTurnAnchor``
 * is on. Walmart spark.100 (#ffc220) at low opacity — unmistakable in
 * QA, invisible to readers.
 */
const PAGE_TURN_HIGHLIGHT: CSSProperties = {
  boxShadow: "inset 0 0 0 2px rgba(255, 194, 32, 0.85)",
  borderRadius: 4,
};

export function MangaPageRenderer({
  page,
  className = "",
  characterAssets = [],
  showPageTurnAnchor = false,
}: MangaPageRendererProps) {
  const panels = page.storyboard_page.panels;
  if (!panels?.length) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: "#5E5C78" }}
      >
        <p
          style={{
            fontFamily: "var(--font-label, monospace)",
            fontSize: "0.7rem",
          }}
        >
          Empty page
        </p>
      </div>
    );
  }

  const layout = layoutForRenderedPage(page);
  const compositionRows = rowsForRenderedPage(page);
  const composition = page.composition;
  const pageIndex = page.storyboard_page.page_index;

  // Composition path: row-by-row so each row owns its column tracks.
  if (compositionRows) {
    return (
      <div
        className={`w-full h-full ${className}`}
        style={{ ...layout.containerStyle, padding: 6 }}
        role="group"
        aria-label={`Manga page ${pageIndex + 1}`}
      >
        {compositionRows.map((row, rowIndex) => (
          <div
            key={`row-${rowIndex}`}
            style={{
              display: "grid",
              gridTemplateColumns: row.tracks,
              gap: 6,
              direction: "rtl",
            }}
          >
            {row.cells.map((cell, i) => {
              const wrapperStyle: CSSProperties = {
                ...(cell.style ?? {}),
                ...(showPageTurnAnchor && cell.isPageTurn ? PAGE_TURN_HIGHLIGHT : {}),
                // Cells flip back to LTR so child UI reads normally;
                // only the cell *order* needs to be RTL.
                direction: "ltr",
              };
              return (
                <div
                  key={cell.panel.panel_id || `cell-${rowIndex}-${i}`}
                  style={wrapperStyle}
                >
                  <MangaPanelRenderer
                    panel={cell.panel}
                    artifact={artifactFor(cell.panel.panel_id, page.panel_artifacts)}
                    emphasisOverride={emphasisOverrideFor(cell.panel.panel_id, composition)}
                    staggerDelay={i * 0.12}
                    characterAssets={characterAssets}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  // Legacy path: panels placed via gridRow/gridColumn or a flex stack.
  return (
    <div
      className={`w-full h-full ${className}`}
      style={{ ...layout.containerStyle, padding: 6 }}
      role="group"
      aria-label={`Manga page ${pageIndex + 1}`}
    >
      {layout.cells.map((cell, i) => {
        const wrapperStyle: CSSProperties = {
          ...(cell.style ?? {}),
          ...(showPageTurnAnchor && cell.isPageTurn ? PAGE_TURN_HIGHLIGHT : {}),
        };
        return (
          <div
            key={cell.panel.panel_id || `panel-${i}`}
            style={wrapperStyle}
          >
            <MangaPanelRenderer
              panel={cell.panel}
              artifact={artifactFor(cell.panel.panel_id, page.panel_artifacts)}
              emphasisOverride={emphasisOverrideFor(cell.panel.panel_id, composition)}
              staggerDelay={i * 0.12}
              characterAssets={characterAssets}
            />
          </div>
        );
      })}
    </div>
  );
}
