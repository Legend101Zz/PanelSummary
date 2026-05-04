/**
 * V4 page composition utilities (Phase C1 / C2 frontend).
 *
 * Pulled out of ``V4PageRenderer.tsx`` so the renderer stays focused on
 * JSX and the composition rules can be unit-tested in isolation.
 *
 * Two layout paths are supported:
 *
 * 1. ``gutter_grid`` present \u2192 build a CSS Grid with integer-percentage
 *    track sizes. The page container gets ``direction: rtl`` so cell\u00a00
 *    of each row \u2014 the right-most cell in the data \u2014 renders on the
 *    right. Reading order matches manga.
 *
 * 2. No ``gutter_grid`` \u2192 fall back to the legacy panel-count layout
 *    table that the V4 renderer has always used. Existing pages keep
 *    rendering identically.
 */

import type { CSSProperties } from "react";
import type { V4Page, V4PageLayout, V4Panel } from "./types";

export interface CellPlacement {
  panel: V4Panel;
  /**
   * The CSS Grid styles to apply to the cell wrapper. Includes
   * ``gridRow`` / ``gridColumn`` for the legacy layouts and a default
   * (no-op) object for the composition path \u2014 the parent grid handles
   * placement implicitly via DOM order.
   */
  style?: CSSProperties;
  /** True when this cell is the page-turn anchor (highlighted in QA). */
  isPageTurn: boolean;
}

export interface PageLayout {
  /** Style applied to the page container. */
  containerStyle: CSSProperties;
  /** Cells to render, in DOM order (which is also visual order RTL). */
  cells: CellPlacement[];
  /** True when this page used the composition path. */
  usingComposition: boolean;
}

/* --- Legacy layouts (kept verbatim from the original renderer) --------- */

const LEGACY_LAYOUT_STYLES: Record<V4PageLayout, CSSProperties> = {
  full: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  vertical: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 6,
  },
  "grid-2": {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  "grid-3": {
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    gridTemplateRows: "1fr 1fr",
    gap: 6,
    alignContent: "center",
  },
  "grid-4": {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gridTemplateRows: "1fr 1fr",
    gap: 6,
    alignContent: "center",
  },
  asymmetric: {
    display: "grid",
    gridTemplateColumns: "3fr 2fr",
    gridTemplateRows: "1fr 1fr",
    gap: 6,
    alignContent: "center",
  },
  // ``custom`` is composition-only. If we ever land here we treat it as
  // the safest fallback; the composition path catches it first in
  // ``layoutForPage`` so this is defensive only.
  custom: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 6,
  },
};

function legacyPlacement(
  layout: V4PageLayout,
  panelIndex: number,
): CSSProperties | undefined {
  if (layout === "grid-3" && panelIndex === 0) {
    return { gridRow: "1 / 3", gridColumn: "1" };
  }
  if (layout === "asymmetric" && panelIndex === 0) {
    return { gridRow: "1 / 3", gridColumn: "1" };
  }
  return undefined;
}

/* --- Composition path -------------------------------------------------- */

/**
 * Convert a row of integer percentages (e.g. ``[60, 40]``) into a
 * ``grid-template-columns`` track list (``"60% 40%"``).
 */
function rowToTracks(row: number[]): string {
  return row.map((pct) => `${pct}%`).join(" ");
}

/**
 * Build a CSS Grid container that uses one row per gutter-grid row.
 * Cells render in DOM order which, with ``direction: rtl`` on the
 * container, matches manga right-to-left flow.
 *
 * Note on rows: we declare ``grid-template-rows`` as equal fractions of
 * the page so a 2-row page splits 50/50 vertically. Real manga varies
 * row heights too; that's a Phase C+ enhancement (the LLM would author
 * row heights as a parallel array). For now, even rows keep the page
 * legible without bloating the schema.
 */
function compositionLayout(page: V4Page): PageLayout | null {
  const grid = page.gutter_grid;
  if (!grid || grid.length === 0) {
    return null;
  }
  // Defensive sanity: every row must be non-empty and sum to 100. If
  // the backend somehow produced bad data we fall back to legacy rather
  // than rendering a broken grid.
  for (const row of grid) {
    if (row.length === 0) return null;
    const sum = row.reduce((a, b) => a + b, 0);
    if (sum !== 100) return null;
  }
  const totalCells = grid.reduce((acc, row) => acc + row.length, 0);
  if (totalCells !== page.panels.length) {
    return null;
  }

  const containerStyle: CSSProperties = {
    display: "grid",
    // We can't share a single `grid-template-columns` across rows of
    // different cell counts \u2014 instead we render each row as its own
    // sub-grid via a wrapper. To keep the JSX simple we declare the
    // outer grid as one column, one row per gutter-grid row, and let
    // each row's wrapper own its column tracks.
    gridTemplateColumns: "100%",
    gridTemplateRows: grid.map(() => "1fr").join(" "),
    gap: 6,
    direction: "rtl",
  };

  let panelIndex = 0;
  const cells: CellPlacement[] = [];
  grid.forEach((row, rowIndex) => {
    row.forEach((_, colInRow) => {
      const panel = page.panels[panelIndex];
      panelIndex += 1;
      cells.push({
        panel,
        style: {
          // Each cell carries its row + col placement so the parent
          // grid wrapper can compute the per-row track list.
          gridRow: `${rowIndex + 1} / ${rowIndex + 2}`,
        },
        isPageTurn:
          !!page.page_turn_panel_id &&
          panel.panel_id === page.page_turn_panel_id,
      });
      void colInRow; // make linters happy
    });
  });

  return { containerStyle, cells, usingComposition: true };
}

/* --- Public API -------------------------------------------------------- */

/**
 * Resolve the final layout for a V4 page.
 *
 * Composition wins when authored; otherwise we hand back the legacy
 * layout the renderer has always shipped. Either way the caller gets
 * a uniform ``PageLayout`` shape and the JSX stays one branch.
 */
export function layoutForPage(page: V4Page): PageLayout {
  const composition = compositionLayout(page);
  if (composition) return composition;

  const layout = (page.layout || "vertical") as V4PageLayout;
  const containerStyle = LEGACY_LAYOUT_STYLES[layout] || LEGACY_LAYOUT_STYLES.vertical;
  const cells: CellPlacement[] = page.panels.map((panel, idx) => ({
    panel,
    style: legacyPlacement(layout, idx),
    isPageTurn:
      !!page.page_turn_panel_id && panel.panel_id === page.page_turn_panel_id,
  }));
  return { containerStyle, cells, usingComposition: false };
}

/**
 * Group composition cells by row so the renderer can wrap each row in
 * its own sub-grid with the right column track list.
 */
export function rowsForComposition(
  page: V4Page,
): { tracks: string; cells: CellPlacement[] }[] | null {
  const grid = page.gutter_grid;
  if (!grid || grid.length === 0) return null;
  const layout = layoutForPage(page);
  if (!layout.usingComposition) return null;

  const rows: { tracks: string; cells: CellPlacement[] }[] = [];
  let cellIndex = 0;
  for (const row of grid) {
    const cells = layout.cells.slice(cellIndex, cellIndex + row.length);
    rows.push({ tracks: rowToTracks(row), cells });
    cellIndex += row.length;
  }
  return rows;
}
