"use client";

/**
 * MangaReader/panels/ConceptPanel.tsx — symbolic / insert reveal
 * =================================================================
 * The dispatcher routes here for ``REVEAL`` purposes with a SYMBOLIC
 * or INSERT shot, plus the catch-all "no narration, no dialogue"
 * branch — exactly the V4 NarrationPanel's "concept" cousin in the
 * legacy mapper. Visually: bigger accent treatment, the panel's
 * composition prose surfaced as a small caption below the action so
 * the editor's intent reaches the screen even when text content is
 * sparse.
 */

import { motion } from "motion/react";
import type { StoryboardPanel } from "@/lib/types";
import type { MangaPalette } from "../types";
import { primaryCharacter } from "../derived_visuals";

interface ConceptPanelProps {
  panel: StoryboardPanel;
  palette: MangaPalette;
}

export function ConceptPanel({ panel, palette }: ConceptPanelProps) {
  const character = primaryCharacter(panel);
  const headline = panel.action?.trim() || panel.narration?.trim() || "";

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center px-6 py-4 overflow-hidden">
      {character && (
        <motion.span
          className="mb-2 text-xs tracking-widest uppercase"
          style={{
            color: palette.accent,
            fontFamily: "var(--font-label, monospace)",
            fontSize: "0.6rem",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.85 }}
          transition={{ duration: 0.8 }}
        >
          {character}
        </motion.span>
      )}

      {headline && (
        <motion.p
          className="text-center"
          style={{
            color: palette.text,
            fontFamily: "var(--font-display, serif)",
            fontSize: "clamp(0.95rem, 2.2vw, 1.3rem)",
            lineHeight: 1.4,
            maxWidth: "85%",
          }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {headline}
        </motion.p>
      )}

      {/* Composition prose — the storyboarder's editorial intent. Tiny
          and dimmed so it reads as a caption, not chrome. Skipped when
          empty (legacy panels) so we don't render an empty bar. */}
      {panel.composition && (
        <motion.p
          className="mt-3 text-center"
          style={{
            color: `${palette.text}55`,
            fontFamily: "var(--font-body, sans-serif)",
            fontSize: "0.65rem",
            fontStyle: "italic",
            maxWidth: "75%",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          {panel.composition}
        </motion.p>
      )}
    </div>
  );
}
