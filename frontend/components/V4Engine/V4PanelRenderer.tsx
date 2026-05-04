"use client";

/**
 * V4PanelRenderer — Dispatches to the right panel type renderer
 * ==============================================================
 * Each panel type has a dedicated renderer that knows its layout.
 * This component picks the right one and wraps it in the ink border.
 */

import { useMemo } from "react";
import { motion } from "motion/react";
import type { V4CharacterAsset, V4Panel, V4Emphasis } from "./types";
import { MOOD_PALETTES, DEFAULT_PALETTE, EMPHASIS_WEIGHTS } from "./types";
import { findAssetForCharacter } from "./assetLookup";

import { SplashPanel } from "./panels/SplashPanel";
import { DialoguePanel } from "./panels/DialoguePanel";
import { NarrationPanel } from "./panels/NarrationPanel";
import { DataPanel } from "./panels/DataPanel";
import { TransitionPanel } from "./panels/TransitionPanel";
import { PaintedPanelBackdrop } from "./PaintedPanelBackdrop";
import { SfxLayer } from "./SfxLayer";

interface V4PanelRendererProps {
  panel: V4Panel;
  index: number;
  /** Stagger delay for entry animation */
  staggerDelay?: number;
  characterAssets?: V4CharacterAsset[];
}

/**
 * Render a single V4 panel with mood-driven palette and ink border.
 */
export function V4PanelRenderer({ panel, index, staggerDelay = 0, characterAssets = [] }: V4PanelRendererProps) {
  const palette = useMemo(
    () => MOOD_PALETTES[panel.mood || ""] || DEFAULT_PALETTE,
    [panel.mood],
  );

  const emphasis = (panel.emphasis || "medium") as V4Emphasis;
  const weight = EMPHASIS_WEIGHTS[emphasis];
  const panelAsset = useMemo(
    () => findAssetForCharacter(panel.character, panel.expression, characterAssets),
    [panel.character, panel.expression, characterAssets],
  );

  // Phase 4: when the multimodal renderer painted this panel, use the
  // painted art as the backdrop and tell sub-renderers to skip their
  // synthetic character placeholders (which would otherwise duplicate the
  // painted character at lower fidelity).
  const hasPaintedBackdrop = Boolean(panel.image_path);

  // Choose the right sub-renderer
  const content = useMemo(() => {
    switch (panel.type) {
      case "splash":
        return <SplashPanel panel={panel} palette={palette} asset={panelAsset} hasPaintedBackdrop={hasPaintedBackdrop} />;
      case "dialogue":
        return <DialoguePanel panel={panel} palette={palette} assets={characterAssets} hasPaintedBackdrop={hasPaintedBackdrop} />;
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
  }, [panel, palette, panelAsset, characterAssets, hasPaintedBackdrop]);

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
      {/* Painted panel art (Phase 4) — sits at z-0 behind every other layer.
          When absent, the parent's mood-driven background colour shows. */}
      {hasPaintedBackdrop && panel.image_path && (
        <PaintedPanelBackdrop imagePath={panel.image_path} />
      )}

      {/* Bottom-aligned dark scrim improves text legibility when text overlays
          painted art. We only paint it when there IS painted art behind, to
          avoid darkening the synthetic palette panels for no reason. */}
      {hasPaintedBackdrop && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
          style={{
            background: `linear-gradient(to top, ${palette.bg}cc 0%, ${palette.bg}66 50%, transparent 100%)`,
            zIndex: 1,
          }}
          aria-hidden
        />
      )}

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

      {/* Phase C5: SFX overlay sits above the content layer so big
          BOOM/CRACK letters land ON the panel art, the way real manga
          letterers place sound effects. ``effects`` is the same field
          that drives screentone/sparkle below; SfxLayer just picks the
          tokens it recognises and ignores the rest. */}
      <SfxLayer effects={panel.effects} accent={palette.accent} baseDelay={staggerDelay + 0.2} />

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
