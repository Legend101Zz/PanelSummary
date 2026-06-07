"use client";

/**
 * MangaReader/panels/NarrationPanel.tsx — atmospheric caption
 * ============================================================
 * Quiet beats: panel.narration as the centred blockquote, optionally
 * preceded by the primary character's name tag for context. Mirrors
 * the V4 NarrationPanel verbatim to preserve 4.5b's no-behaviour-
 * change contract; consumes ``StoryboardPanel`` directly.
 */

import { motion } from "motion/react";
import type { StoryboardPanel } from "@/lib/types";
import type { MangaPalette } from "../types";
import { primaryCharacter } from "../derived_visuals";

interface NarrationPanelProps {
  panel: StoryboardPanel;
  palette: MangaPalette;
  /** Synthetic visual effects derived from purpose / shot. */
  effects: string[];
}

export function NarrationPanel({ panel, palette, effects }: NarrationPanelProps) {
  const character = primaryCharacter(panel);
  const text = panel.narration?.trim() || panel.action?.trim() || "";

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center px-4 py-4 overflow-hidden">
      {effects.includes("vignette") && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at center, transparent 40%, ${palette.bg}CC 100%)`,
          }}
        />
      )}

      {character && (
        <motion.div
          className="mb-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ duration: 1 }}
        >
          <span
            className="text-xs tracking-widest uppercase"
            style={{
              color: palette.accent,
              fontFamily: "var(--font-label, monospace)",
              fontSize: "0.55rem",
            }}
          >
            {character}
          </span>
        </motion.div>
      )}

      {text && (
        <motion.blockquote
          className="relative z-10 border px-4 py-3 text-center"
          style={{
            background: "rgba(255,255,255,0.94)",
            borderColor: "#1f1f29",
            boxShadow: "0 7px 0 rgba(31,31,41,0.22)",
            color: "#1f1f29",
            fontFamily: "var(--font-body, serif)",
            fontSize: "clamp(0.68rem, 1.25vw, 0.98rem)",
            fontStyle: "italic",
            fontWeight: 700,
            lineHeight: 1.34,
            maxHeight: "76%",
            maxWidth: "88%",
            overflow: "hidden",
            overflowWrap: "anywhere",
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          &ldquo;{text}&rdquo;
        </motion.blockquote>
      )}

      {effects.includes("ink_wash") && (
        <motion.div
          className="absolute bottom-0 left-0 right-0 h-1/3 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.15 }}
          transition={{ duration: 1.5 }}
          style={{
            background: `linear-gradient(to top, ${palette.text}20, transparent)`,
          }}
        />
      )}
    </div>
  );
}
