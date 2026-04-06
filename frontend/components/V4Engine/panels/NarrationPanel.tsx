"use client";

/**
 * NarrationPanel — Atmospheric text with scene
 * ===============================================
 * Caption-driven storytelling. The quiet moments.
 */

import { motion } from "motion/react";
import type { V4Panel } from "../types";
import { DEFAULT_PALETTE } from "../types";

interface NarrationPanelProps {
  panel: V4Panel;
  palette: typeof DEFAULT_PALETTE;
}

export function NarrationPanel({ panel, palette }: NarrationPanelProps) {
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center px-6 py-4 overflow-hidden">
      {/* Vignette effect */}
      {panel.effects?.includes("vignette") && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at center, transparent 40%, ${palette.bg}CC 100%)`,
          }}
        />
      )}

      {/* Character (small, atmospheric) */}
      {panel.character && (
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
            {panel.character}
          </span>
        </motion.div>
      )}

      {/* Main narration text */}
      {panel.narration && (
        <motion.blockquote
          className="relative z-10 text-center"
          style={{
            color: palette.text,
            fontFamily: "var(--font-body, serif)",
            fontSize: "clamp(0.8rem, 1.8vw, 1.05rem)",
            lineHeight: 1.7,
            maxWidth: "85%",
            fontStyle: "italic",
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          &ldquo;{panel.narration}&rdquo;
        </motion.blockquote>
      )}

      {/* Title (if present) */}
      {panel.title && (
        <motion.h3
          className="relative z-10 text-center mt-2"
          style={{
            color: `${palette.text}80`,
            fontFamily: "var(--font-display, serif)",
            fontSize: "clamp(0.7rem, 1.5vw, 0.9rem)",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          {panel.title}
        </motion.h3>
      )}

      {/* Ink wash effect */}
      {panel.effects?.includes("ink_wash") && (
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
