/**
 * CutLayoutEngine.tsx — Manga Panel Cut System
 * ===============================================
 * Converts hierarchical cut definitions into rendered panel regions.
 *
 * INSPIRED BY: comfyui_panels — a page starts as one panel,
 * sequential cuts divide it. Each cut targets a specific region
 * and splits it horizontally or vertically.
 *
 * The slight angle deviation on cuts gives that hand-ruled manga feel.
 * Panels get ink borders and paper texture backgrounds.
 *
 * ALGORITHM:
 * 1. Start with one region covering the full canvas
 * 2. For each CutSpec, split the target region at position
 * 3. Compute CSS clip-path polygons for each resulting region
 *    (with angle adjustment for the authentic manga tilt)
 * 4. Render each region as an absolutely positioned div
 */

import { useMemo } from "react";
import { motion } from "motion/react";
import type { CutSpec, SubPanel } from "@/lib/living-panel-types";

// ============================================================
// REGION TYPE
// ============================================================

export interface PanelRegion {
  /** Normalized bounds [0-1] */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Angle adjustments from cuts (for clip-path tilt) */
  topAngle: number;
  bottomAngle: number;
  leftAngle: number;
  rightAngle: number;
}

// ============================================================
// CUT ALGORITHM
// ============================================================

/**
 * Apply a series of cuts to produce panel regions.
 * Each cut splits a target region into two.
 */
export function computePanelRegions(cuts: CutSpec[]): PanelRegion[] {
  // Start with one full-page region
  let regions: PanelRegion[] = [
    { x: 0, y: 0, w: 1, h: 1, topAngle: 0, bottomAngle: 0, leftAngle: 0, rightAngle: 0 },
  ];

  for (const cut of cuts) {
    const targetIdx = cut.target ?? 0;
    if (targetIdx < 0 || targetIdx >= regions.length) continue;

    const target = regions[targetIdx];
    const angle = Math.max(-4, Math.min(4, cut.angle ?? 0));
    const pos = Math.max(0.15, Math.min(0.85, cut.position));

    let regionA: PanelRegion;
    let regionB: PanelRegion;

    if (cut.direction === "h") {
      // Horizontal cut — splits into top and bottom
      const splitY = target.y + target.h * pos;
      regionA = {
        x: target.x, y: target.y,
        w: target.w, h: target.h * pos,
        topAngle: target.topAngle,
        bottomAngle: angle,
        leftAngle: target.leftAngle,
        rightAngle: target.rightAngle,
      };
      regionB = {
        x: target.x, y: splitY,
        w: target.w, h: target.h * (1 - pos),
        topAngle: -angle, // opposite side of same cut
        bottomAngle: target.bottomAngle,
        leftAngle: target.leftAngle,
        rightAngle: target.rightAngle,
      };
    } else {
      // Vertical cut — splits into left and right
      const splitX = target.x + target.w * pos;
      regionA = {
        x: target.x, y: target.y,
        w: target.w * pos, h: target.h,
        topAngle: target.topAngle,
        bottomAngle: target.bottomAngle,
        leftAngle: target.leftAngle,
        rightAngle: angle,
      };
      regionB = {
        x: splitX, y: target.y,
        w: target.w * (1 - pos), h: target.h,
        topAngle: target.topAngle,
        bottomAngle: target.bottomAngle,
        leftAngle: -angle,
        rightAngle: target.rightAngle,
      };
    }

    // Replace target with two new regions
    regions = [
      ...regions.slice(0, targetIdx),
      regionA,
      regionB,
      ...regions.slice(targetIdx + 1),
    ];
  }

  return regions;
}

// ============================================================
// CLIP-PATH GENERATOR (adds angle tilt to edges)
// ============================================================

/**
 * Generate a CSS clip-path polygon for a region.
 * The angle adjustments create slight tilts on the edges
 * so panel borders don't look perfectly straight.
 */
function regionToClipPath(region: PanelRegion, gutterPx: number, containerW: number, containerH: number): string {
  // Convert angle to pixel offset
  const angleToOffset = (angle: number, length: number) => {
    return Math.tan((angle * Math.PI) / 180) * length * 0.5;
  };

  const g = gutterPx; // gutter in pixels
  const x = region.x * containerW + g;
  const y = region.y * containerH + g;
  const w = region.w * containerW - g * 2;
  const h = region.h * containerH - g * 2;

  // Angle offsets on each edge
  const topOff = angleToOffset(region.topAngle, w);
  const bottomOff = angleToOffset(region.bottomAngle, w);
  const leftOff = angleToOffset(region.leftAngle, h);
  const rightOff = angleToOffset(region.rightAngle, h);

  // Four corners with angle adjustments
  const tl = `${x - leftOff}px ${y + topOff}px`;
  const tr = `${x + w + rightOff}px ${y - topOff}px`;
  const br = `${x + w - rightOff}px ${y + h - bottomOff}px`;
  const bl = `${x + leftOff}px ${y + h + bottomOff}px`;

  return `polygon(${tl}, ${tr}, ${br}, ${bl})`;
}

// ============================================================
// CUT LAYOUT RENDERER
// ============================================================

interface CutLayoutProps {
  cuts: CutSpec[];
  cells: SubPanel[];
  gutter?: number;
  borderWidth?: number;
  staggerMs?: number;
  renderCell: (cell: SubPanel, region: PanelRegion, index: number) => React.ReactNode;
}

export function CutLayout({
  cuts,
  cells,
  gutter = 4,
  borderWidth = 2.5,
  staggerMs = 0,
  renderCell,
}: CutLayoutProps) {
  const regions = useMemo(() => computePanelRegions(cuts), [cuts]);

  return (
    <div className="absolute inset-0" style={{ padding: gutter }}>
      {/* Ink border between panels */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
        {regions.map((region, i) => {
          const x = `${region.x * 100}%`;
          const y = `${region.y * 100}%`;
          const w = `${region.w * 100}%`;
          const h = `${region.h * 100}%`;
          return (
            <rect
              key={`border-${i}`}
              x={x} y={y} width={w} height={h}
              fill="none"
              stroke="#1A1825"
              strokeWidth={borderWidth}
              rx="1"
            />
          );
        })}
      </svg>

      {/* Panel content regions */}
      {regions.map((region, i) => {
        const cell = cells[i];
        if (!cell) return null;

        return (
          <motion.div
            key={cell.id}
            className="absolute overflow-hidden"
            style={{
              left: `${region.x * 100}%`,
              top: `${region.y * 100}%`,
              width: `${region.w * 100}%`,
              height: `${region.h * 100}%`,
              padding: gutter,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              delay: (staggerMs * i) / 1000,
              duration: 0.35,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <div
              className="relative w-full h-full overflow-hidden"
              style={{
                background: cell.style?.background || "#F2E8D5",
                borderRadius: cell.style?.borderRadius || 1,
              }}
            >
              {renderCell(cell, region, i)}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

export default CutLayout;
