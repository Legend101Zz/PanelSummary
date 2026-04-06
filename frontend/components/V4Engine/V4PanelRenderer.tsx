"use client";

/**
 * V4PanelRenderer — Dispatches to the right panel type renderer
 * ==============================================================
 * Each panel type has a dedicated renderer that knows its layout.
 * This component picks the right one and wraps it in the ink border.
 */

import { useMemo } from "react";
import { motion } from "motion/react";
import type { V4Panel, V4Emphasis } from "./types";
import { MOOD_PALETTES, DEFAULT_PALETTE, EMPHASIS_WEIGHTS } from "./types";

import { SplashPanel } from "./panels/SplashPanel";
import { DialoguePanel } from "./panels/DialoguePanel";
import { NarrationPanel } from "./panels/NarrationPanel";
import { DataPanel } from "./panels/DataPanel";
import { TransitionPanel } from "./panels/TransitionPanel";

interface V4PanelRendererProps {
  panel: V4Panel;
  index: number;
  /** Stagger delay for entry animation */
  staggerDelay?: number;
}

/**
 * Render a single V4 panel with mood-driven palette and ink border.
 */
export function V4PanelRenderer({ panel, index, staggerDelay = 0 }: V4PanelRendererProps) {
  const palette = useMemo(
    () => MOOD_PALETTES[panel.mood || ""] || DEFAULT_PALETTE,
    [panel.mood],
  );

  const emphasis = (panel.emphasis || "medium") as V4Emphasis;
  const weight = EMPHASIS_WEIGHTS[emphasis];

  // Choose the right sub-renderer
  const content = useMemo(() => {
    switch (panel.type) {
      case "splash":
        return <SplashPanel panel={panel} palette={palette} />;
      case "dialogue":
        return <DialoguePanel panel={panel} palette={palette} />;
      case "data":
        return <DataPanel panel={panel} palette={palette} />;
      case "transition":
        return <TransitionPanel panel={panel} palette={palette} />;
      case "concept":
      case "montage":
      case "narration":
      default:
        return <NarrationPanel panel={panel} palette={palette} />;
    }
  }, [panel, palette]);

  return (
    <motion.div
      className="relative overflow-hidden"
      style={{
        background: palette.bg,
        border: `2px solid ${palette.border}`,
        borderRadius: 4,
        flex: weight,
        minHeight: emphasis === "high" ? 200 : emphasis === "low" ? 80 : 120,
      }}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.4,
        delay: staggerDelay,
        ease: [0.4, 0, 0.2, 1],
      }}
      role="img"
      aria-label={_buildAriaLabel(panel)}
    >
      {/* Screentone pattern overlay */}
      {panel.effects?.includes("screentone") && (
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle, ${palette.text} 0.5px, transparent 0.5px)`,
            backgroundSize: "4px 4px",
          }}
        />
      )}

      {content}

      {/* Sparkle effect */}
      {panel.effects?.includes("sparkle") && (
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={`sparkle-${i}`}
              className="absolute w-1 h-1 rounded-full"
              style={{
                background: palette.accent,
                left: `${20 + i * 15}%`,
                top: `${15 + (i * 17) % 60}%`,
              }}
              animate={{
                opacity: [0, 1, 0],
                scale: [0, 1.5, 0],
              }}
              transition={{
                duration: 1.5,
                delay: i * 0.3,
                repeat: Infinity,
                repeatDelay: 2,
              }}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

/** Build accessible label from panel content */
function _buildAriaLabel(panel: V4Panel): string {
  const parts: string[] = [`${panel.type} panel`];
  if (panel.title) parts.push(panel.title);
  if (panel.narration) parts.push(panel.narration);
  if (panel.lines?.length) {
    parts.push(
      panel.lines.map((l) => `${l.who} says: ${l.says}`).join(". "),
    );
  }
  if (panel.data_items?.length) {
    parts.push(
      panel.data_items.map((d) => `${d.label}${d.value ? `: ${d.value}` : ""}`).join(", "),
    );
  }
  return parts.join(". ");
}
