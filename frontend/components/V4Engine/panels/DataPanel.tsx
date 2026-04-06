"use client";

/**
 * DataPanel — Stats and evidence display
 * ========================================
 * Data items with optional character reaction.
 * The "proof" panels of manga.
 */

import { motion } from "motion/react";
import type { V4Panel } from "../types";
import { DEFAULT_PALETTE } from "../types";

interface DataPanelProps {
  panel: V4Panel;
  palette: typeof DEFAULT_PALETTE;
}

export function DataPanel({ panel, palette }: DataPanelProps) {
  const items = panel.data_items || [];

  return (
    <div className="w-full h-full flex flex-col justify-center px-4 py-3 overflow-hidden">
      {/* Title / context */}
      {panel.title && (
        <motion.h3
          className="text-center mb-3 font-bold"
          style={{
            color: palette.text,
            fontFamily: "var(--font-display, serif)",
            fontSize: "clamp(0.8rem, 1.5vw, 1rem)",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {panel.title}
        </motion.h3>
      )}

      {/* Data items */}
      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <motion.div
            key={`data-${i}`}
            className="flex items-center gap-3 px-3 py-2 rounded"
            style={{
              background: `${palette.accent}08`,
              border: `1px solid ${palette.accent}20`,
            }}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.15, duration: 0.3 }}
          >
            {/* Index badge */}
            <div
              className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
              style={{
                background: palette.accent,
                color: "#fff",
                fontSize: "0.6rem",
                fontWeight: 700,
                fontFamily: "var(--font-label, monospace)",
              }}
            >
              {i + 1}
            </div>

            {/* Label + value */}
            <div className="flex-1 min-w-0">
              <span
                style={{
                  color: palette.text,
                  fontFamily: "var(--font-body, sans-serif)",
                  fontSize: "clamp(0.65rem, 1.2vw, 0.8rem)",
                }}
              >
                {item.label}
              </span>
              {item.value && (
                <span
                  className="ml-2 font-bold"
                  style={{
                    color: palette.accent,
                    fontFamily: "var(--font-label, monospace)",
                    fontSize: "clamp(0.7rem, 1.3vw, 0.85rem)",
                  }}
                >
                  {item.value}
                </span>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Character reaction */}
      {panel.character && (
        <motion.div
          className="mt-3 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: items.length * 0.15 + 0.3 }}
        >
          <span
            className="text-xs tracking-wider uppercase"
            style={{
              color: palette.accent,
              fontFamily: "var(--font-label, monospace)",
              fontSize: "0.55rem",
            }}
          >
            {panel.character}
            {panel.expression && panel.expression !== "neutral" && (
              <> — {panel.expression}</>
            )}
          </span>
        </motion.div>
      )}

      {/* Narration */}
      {panel.narration && (
        <motion.p
          className="mt-2 text-center"
          style={{
            color: `${palette.text}70`,
            fontFamily: "var(--font-body, sans-serif)",
            fontSize: "0.7rem",
            fontStyle: "italic",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: items.length * 0.15 + 0.5 }}
        >
          {panel.narration}
        </motion.p>
      )}
    </div>
  );
}
