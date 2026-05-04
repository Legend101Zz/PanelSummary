"use client";

/**
 * V4PageRenderer \u2014 Renders a full manga page
 * =============================================
 * Takes a V4Page (layout + panels) and arranges panels using either
 *  - Phase C1 ``gutter_grid`` (one CSS Grid row per gutter row, each
 *    row a sub-grid with custom percentage tracks; container flips
 *    to RTL so reading order matches manga), or
 *  - the legacy panel-count layout for pages without a composition.
 *
 * Layout maths lives in ``page_layout.ts`` so this file stays focused
 * on JSX and accessibility.
 */

import type { CSSProperties } from "react";
import type { V4CharacterAsset, V4Page } from "./types";
import { V4PanelRenderer } from "./V4PanelRenderer";
import { layoutForPage, rowsForComposition } from "./page_layout";

interface V4PageRendererProps {
  page: V4Page;
  className?: string;
  characterAssets?: V4CharacterAsset[];
  /**
   * Phase C1: when true, the page-turn cell is highlighted with a
   * thin accent border so editors reviewing the layout can see the
   * cliffhanger anchor at a glance. Defaults to false (reader UI).
   */
  showPageTurnAnchor?: boolean;
}

/**
 * Highlight applied to the page-turn cell when ``showPageTurnAnchor``
 * is on. Uses Walmart spark.100 (#ffc220) at low opacity so the cell
 * is unmistakable in QA without screaming at the reader.
 */
const PAGE_TURN_HIGHLIGHT: CSSProperties = {
  boxShadow: "inset 0 0 0 2px rgba(255, 194, 32, 0.85)",
  borderRadius: 4,
};

export function V4PageRenderer({
  page,
  className = "",
  characterAssets = [],
  showPageTurnAnchor = false,
}: V4PageRendererProps) {
  if (!page.panels?.length) {
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

  const layout = layoutForPage(page);
  const compositionRows = rowsForComposition(page);

  // Composition path: render row-by-row so each row owns its column
  // track list. The outer grid handles row stacking + RTL.
  if (compositionRows) {
    return (
      <div
        className={`w-full h-full ${className}`}
        style={{ ...layout.containerStyle, padding: 6 }}
        role="group"
        aria-label={`Manga page ${page.page_index + 1}`}
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
                ...(showPageTurnAnchor && cell.isPageTurn
                  ? PAGE_TURN_HIGHLIGHT
                  : {}),
                // Inside the cell, restore LTR so child UI reads
                // normally; only the cell *order* needs to be RTL.
                direction: "ltr",
              };
              return (
                <div
                  key={cell.panel.panel_id || `cell-${rowIndex}-${i}`}
                  style={wrapperStyle}
                >
                  <V4PanelRenderer
                    panel={cell.panel}
                    index={i}
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

  // Legacy path: one container, panels placed via gridRow/gridColumn.
  return (
    <div
      className={`w-full h-full ${className}`}
      style={{ ...layout.containerStyle, padding: 6 }}
      role="group"
      aria-label={`Manga page ${page.page_index + 1}`}
    >
      {layout.cells.map((cell, i) => {
        const wrapperStyle: CSSProperties = {
          ...(cell.style ?? {}),
          ...(showPageTurnAnchor && cell.isPageTurn
            ? PAGE_TURN_HIGHLIGHT
            : {}),
        };
        return (
          <div
            key={cell.panel.panel_id || `panel-${i}`}
            style={wrapperStyle}
          >
            <V4PanelRenderer
              panel={cell.panel}
              index={i}
              staggerDelay={i * 0.12}
              characterAssets={characterAssets}
            />
          </div>
        );
      })}
    </div>
  );
}
