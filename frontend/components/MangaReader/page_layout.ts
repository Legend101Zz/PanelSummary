/**
 * MangaReader/page_layout.ts — composition-aware page layout
 * ============================================================
 *
 * The legacy ``V4Engine/page_layout.ts`` consumed a ``V4Page`` (the
 * lossy projection). This module consumes ``RenderedPage`` directly —
 * the storyboard panels and the page composition — so the renderer
 * never re-derives layout from second-hand metadata.
 *
 * Two paths, same as the V4 module they replace:
 *
 * 1. Composition path: ``RenderedPage.composition`` is non-null and
 *    has a ``gutter_grid``. The container becomes a CSS Grid; each
 *    row owns its own column track list (custom percentages); reading
 *    direction flips to RTL so cell 0 lands on the right.
 * 2. Legacy path: no composition. We fall back to the panel-count
 *    layout the V4 reader has always shipped, so legacy pages render
 *    identically.
 *
 * Layout maths is here, not in the JSX, so the renderer file stays
 * focused on accessibility + animation and these rules can be
 * exercised by ``tsc`` against the ``RenderedPage`` shape alone.
 */

import type { CSSProperties } from "react";
import type {
  RenderedPage,
  StoryboardPanel,
  PageComposition,
} from "@/lib/types";

export type LegacyLayout =
  | "vertical"
  | "grid-2"
  | "grid-3"
  | "grid-4"
  | "asymmetric"
  | "full";

export interface CellPlacement {
  panel: StoryboardPanel;
  /** Per-cell wrapper styles (legacy gridRow/gridColumn or composition row pin). */
  style?: CSSProperties;
  /** True when this cell anchors the page-turn beat (highlighted in QA). */
  isPageTurn: boolean;
}

export interface PageLayout {
  containerStyle: CSSProperties;
  cells: CellPlacement[];
  usingComposition: boolean;
}

// ── Legacy panel-count layout ───────────────────────────────────────

const LEGACY_LAYOUT_STYLES: Record<LegacyLayout, CSSProperties> = {
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
};

/**
 * Mirror of the backend's ``_layout_for_panel_count``. The match is
 * 1:1 — same panel counts pick the same layouts as the legacy
 * ``storyboard_mapper`` so a slice with no composition renders
 * identically through the new reader.
 */
function layoutForPanelCount(count: number): LegacyLayout {
  if (count <= 1) return "full";
  if (count === 2) return "vertical";
  if (count === 3) return "asymmetric";
  return "grid-4";
}

function legacyPlacement(
  layout: LegacyLayout,
  panelIndex: number,
): CSSProperties | undefined {
  // The first panel gets the tall left column in the two grid layouts
  // that put a hero panel beside two small ones. Same rule the V4
  // reader uses; preserved verbatim for the cutover.
  if (layout === "grid-3" && panelIndex === 0) {
    return { gridRow: "1 / 3", gridColumn: "1" };
  }
  if (layout === "asymmetric" && panelIndex === 0) {
    return { gridRow: "1 / 3", gridColumn: "1" };
  }
  return undefined;
}

// ── Composition path ─────────────────────────────────────────────────

function rowToTracks(row: number[]): string {
  return row.map((pct) => `${pct}%`).join(" ");
}

/**
 * Reorder storyboard panels to match ``composition.panel_order``.
 * Panels not mentioned land at the end so a partial composition does
 * not silently drop a beat — the same defensive ordering the backend
 * mapper uses.
 */
function orderedPanels(
  panels: StoryboardPanel[],
  composition: PageComposition,
): StoryboardPanel[] {
  const byId = new Map(panels.map((p) => [p.panel_id, p]));
  const ordered: StoryboardPanel[] = [];
  for (const id of composition.panel_order) {
    const panel = byId.get(id);
    if (panel) ordered.push(panel);
  }
  const seen = new Set(ordered.map((p) => p.panel_id));
  for (const panel of panels) {
    if (!seen.has(panel.panel_id)) ordered.push(panel);
  }
  return ordered;
}

/**
 * Defensive validation: every row sums to 100 and the cell count
 * matches the panel count. The backend validator already enforces this
 * but ``RenderedPage`` is constructed from over-the-wire JSON which
 * may have been hand-edited or mocked in dev. Falling back to the
 * legacy layout on bad data beats rendering a torn grid.
 */
function compositionIsRenderable(
  composition: PageComposition,
  panelCount: number,
): boolean {
  if (!composition.gutter_grid?.length) return false;
  let totalCells = 0;
  for (const row of composition.gutter_grid) {
    if (!row.cell_widths_pct?.length) return false;
    const sum = row.cell_widths_pct.reduce((a, b) => a + b, 0);
    if (sum !== 100) return false;
    totalCells += row.cell_widths_pct.length;
  }
  return totalCells === panelCount;
}

/**
 * Build the outer-grid container style + cell list for a composition
 * page. Each cell carries its row pin via ``gridRow`` so the parent
 * can render row-by-row with per-row column tracks (see
 * ``rowsForComposition`` below).
 */
function compositionLayout(rendered: RenderedPage): PageLayout | null {
  const composition = rendered.composition;
  if (!composition || !composition.gutter_grid?.length) return null;
  const panels = rendered.storyboard_page.panels;
  if (!compositionIsRenderable(composition, panels.length)) return null;

  const ordered = orderedPanels(panels, composition);

  const containerStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "100%",
    gridTemplateRows: composition.gutter_grid.map(() => "1fr").join(" "),
    gap: 6,
    direction: "rtl",
  };

  let panelIndex = 0;
  const cells: CellPlacement[] = [];
  composition.gutter_grid.forEach((row, rowIndex) => {
    row.cell_widths_pct.forEach(() => {
      const panel = ordered[panelIndex];
      panelIndex += 1;
      cells.push({
        panel,
        style: { gridRow: `${rowIndex + 1} / ${rowIndex + 2}` },
        isPageTurn:
          !!composition.page_turn_panel_id &&
          panel.panel_id === composition.page_turn_panel_id,
      });
    });
  });

  return { containerStyle, cells, usingComposition: true };
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Resolve the final layout for a rendered page. Composition wins when
 * authored; otherwise the caller gets the legacy panel-count layout.
 * Either way the return shape is uniform so the JSX stays one branch.
 */
export function layoutForRenderedPage(rendered: RenderedPage): PageLayout {
  const composition = compositionLayout(rendered);
  if (composition) return composition;

  const panels = rendered.storyboard_page.panels;
  const layout = layoutForPanelCount(panels.length);
  const containerStyle = LEGACY_LAYOUT_STYLES[layout];
  const pageTurnId = rendered.composition?.page_turn_panel_id;
  const cells: CellPlacement[] = panels.map((panel, idx) => ({
    panel,
    style: legacyPlacement(layout, idx),
    isPageTurn: !!pageTurnId && panel.panel_id === pageTurnId,
  }));
  return { containerStyle, cells, usingComposition: false };
}

/**
 * Group composition cells by row so the renderer can wrap each row in
 * a sub-grid with the right column track list. Returns null on the
 * legacy path so the caller knows to render the cells directly.
 */
export function rowsForRenderedPage(
  rendered: RenderedPage,
): { tracks: string; cells: CellPlacement[] }[] | null {
  const composition = rendered.composition;
  if (!composition?.gutter_grid?.length) return null;
  const layout = layoutForRenderedPage(rendered);
  if (!layout.usingComposition) return null;

  const rows: { tracks: string; cells: CellPlacement[] }[] = [];
  let cellIndex = 0;
  for (const row of composition.gutter_grid) {
    const cells = layout.cells.slice(
      cellIndex,
      cellIndex + row.cell_widths_pct.length,
    );
    rows.push({
      tracks: rowToTracks(row.cell_widths_pct),
      cells,
    });
    cellIndex += row.cell_widths_pct.length;
  }
  return rows;
}
