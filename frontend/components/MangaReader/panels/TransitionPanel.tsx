"use client";

/**
 * MangaReader/panels/TransitionPanel.tsx — chapter / time-skip beat
 * ===================================================================
 * Routed to for ``transition`` and ``to_be_continued`` purposes. Same
 * minimal-rule + ink-wash treatment the V4 version shipped. The
 * "To be continued..." headline is the only behaviour-specific bit:
 * it is surfaced when the storyboard purpose is ``to_be_continued`` so
 * the slice's last beat lands cleanly even when the storyboarder did
 * not author a narration.
 */

import { motion } from "motion/react";
import type { StoryboardPanel } from "@/lib/types";
import type { MangaPalette } from "../types";

interface TransitionPanelProps {
  panel: StoryboardPanel;
  palette: MangaPalette;
}

export function TransitionPanel({ panel, palette }: TransitionPanelProps) {
  const headline =
    panel.purpose === "to_be_continued" ? "To be continued..." : "";
  const subtitle = panel.narration?.trim() || panel.action?.trim() || "";

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden">
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.2 }}
        transition={{ duration: 1.5 }}
        style={{
          background: `linear-gradient(180deg,
            transparent 0%,
            ${palette.accent}10 30%,
            ${palette.accent}08 70%,
            transparent 100%
          )`,
        }}
      />

      <motion.div
        className="w-16 h-px mb-4"
        style={{ background: `${palette.text}30` }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.8 }}
      />

      {headline && (
        <motion.h2
          className="relative z-10 text-center px-6"
          style={{
            color: palette.text,
            fontFamily: "var(--font-display, serif)",
            fontSize: "clamp(1rem, 2.5vw, 1.5rem)",
            letterSpacing: "0.05em",
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          {headline}
        </motion.h2>
      )}

      {subtitle && (
        <motion.p
          className="relative z-10 mt-2 text-center px-8"
          style={{
            color: `${palette.text}60`,
            fontFamily: "var(--font-body, sans-serif)",
            fontSize: "0.75rem",
            fontStyle: "italic",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          {subtitle}
        </motion.p>
      )}

      <motion.div
        className="w-16 h-px mt-4"
        style={{ background: `${palette.text}30` }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.8, delay: 0.8 }}
      />
    </div>
  );
}
