"use client";

/**
 * V4PageRenderer — Renders a full manga page
 * =============================================
 * Takes a V4Page (layout + panels) and arranges panels
 * using CSS Flexbox. The layout type determines arrangement.
 *
 * Unlike V2 which renders one panel at a time,
 * V4 renders an entire PAGE as the unit — because
 * manga pages are compositional units.
 */

import { useMemo } from "react";
import type { V4Page, V4PageLayout } from "./types";
import { V4PanelRenderer } from "./V4PanelRenderer";

interface V4PageRendererProps {
  page: V4Page;
  className?: string;
}

/**
 * CSS layout configs per page layout type.
 * Using flexbox because it handles emphasis weights naturally.
 */
const LAYOUT_STYLES: Record<V4PageLayout, React.CSSProperties> = {
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
 * For grid-3, the first panel spans both rows (tall left panel).
 */
function getGridPlacement(
  layout: V4PageLayout,
  panelIndex: number,
  totalPanels: number,
): React.CSSProperties | undefined {
  if (layout === "grid-3" && panelIndex === 0) {
    return { gridRow: "1 / 3", gridColumn: "1" };
  }
  if (layout === "asymmetric" && panelIndex === 0) {
    return { gridRow: "1 / 3", gridColumn: "1" };
  }
  return undefined;
}

export function V4PageRenderer({ page, className = "" }: V4PageRendererProps) {
  const layoutStyle = useMemo(
    () => LAYOUT_STYLES[page.layout] || LAYOUT_STYLES.vertical,
    [page.layout],
  );

  if (!page.panels?.length) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: "#5E5C78" }}>
        <p style={{ fontFamily: "var(--font-label, monospace)", fontSize: "0.7rem" }}>
          Empty page
        </p>
      </div>
    );
  }

  return (
    <div
      className={`w-full h-full ${className}`}
      style={{
        ...layoutStyle,
        padding: 6,
      }}
      role="group"
      aria-label={`Manga page ${page.page_index + 1}`}
    >
      {page.panels.map((panel, i) => (
        <div
          key={panel.panel_id || `panel-${i}`}
          style={getGridPlacement(page.layout, i, page.panels.length)}
        >
          <V4PanelRenderer
            panel={panel}
            index={i}
            staggerDelay={i * 0.12}
          />
        </div>
      ))}
    </div>
  );
}
