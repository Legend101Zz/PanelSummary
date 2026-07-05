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
import {
  clampVisibleText,
  type PanelPresentationPlan,
} from "../panel_presentation";
import type { MangaPalette } from "../types";

interface ConceptPanelProps {
  panel: StoryboardPanel;
  palette: MangaPalette;
  presentation: PanelPresentationPlan;
}

export function ConceptPanel({ panel, palette, presentation }: ConceptPanelProps) {
  const headline = panel.action?.trim() || panel.narration?.trim() || "";
  const caption = clampVisibleText(
    headline || panel.composition?.trim() || "",
    presentation.maxVisibleCaptionChars || 130,
  );
  const isTextCard = presentation.variant === "text-card";
  const captionClass =
    presentation.captionZone === "top"
      ? "absolute inset-x-3 top-3"
      : isTextCard || presentation.captionZone === "center"
        ? "absolute left-3 right-3 top-1/2 -translate-y-1/2"
        : "absolute inset-x-3 bottom-3";

  return (
    <div className="relative w-full h-full overflow-hidden px-3 py-3">
      {caption && (
        <motion.p
          className={`${captionClass} z-20 border bg-white px-3 py-2 text-center`}
          style={{
            borderColor: "#1f1f29",
            boxShadow: "0 6px 0 rgba(31,31,41,0.22)",
            color: "#1f1f29",
            fontFamily: "var(--font-body, sans-serif)",
            fontSize: isTextCard
              ? "clamp(0.58rem, 1vw, 0.82rem)"
              : "clamp(0.48rem, 0.76vw, 0.66rem)",
            fontWeight: 700,
            lineHeight: isTextCard ? 1.24 : 1.14,
            overflowWrap: "anywhere",
          }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {caption}
        </motion.p>
      )}
    </div>
  );
}
