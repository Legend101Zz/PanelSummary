"use client";

/**
 * TransitionPanel — Chapter/section transitions
 * ================================================
 * Minimal, atmospheric. Chapter titles, time skips.
 */

import { motion } from "motion/react";
import type { V4Panel } from "../types";
import { DEFAULT_PALETTE } from "../types";

interface TransitionPanelProps {
  panel: V4Panel;
  palette: typeof DEFAULT_PALETTE;
}

export function TransitionPanel({ panel, palette }: TransitionPanelProps) {
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden">
      {/* Ink wash background */}
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

      {/* Horizontal rule */}
      <motion.div
        className="w-16 h-px mb-4"
        style={{ background: `${palette.text}30` }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.8 }}
      />

      {/* Title */}
      {panel.title && (
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
          {panel.title}
        </motion.h2>
      )}

      {/* Narration */}
      {panel.narration && (
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
          {panel.narration}
        </motion.p>
      )}

      {/* Horizontal rule */}
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
