"use client";

/**
 * SplashPanel — Full-page dramatic reveal
 * =========================================
 * Big title, centered character, speed lines.
 * The "movie poster" of manga.
 */

import { motion } from "motion/react";
import type { V4CharacterAsset, V4Panel } from "../types";
import { DEFAULT_PALETTE } from "../types";

interface SplashPanelProps {
  panel: V4Panel;
  palette: typeof DEFAULT_PALETTE;
  asset?: V4CharacterAsset | null;
}

export function SplashPanel({ panel, palette, asset }: SplashPanelProps) {
  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col items-center justify-center">
      {/* Speed lines effect */}
      {panel.effects?.includes("speed_lines") && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.3 }}
          transition={{ duration: 0.5 }}
          style={{
            background: `repeating-conic-gradient(
              ${palette.accent}08 0deg 2deg,
              transparent 2deg 10deg
            )`,
          }}
        />
      )}

      {/* Character silhouette (if present) */}
      {panel.character && (
        <motion.div
          className="relative z-10 mb-4"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        >
          <div
            className="w-28 h-36 rounded-lg flex items-center justify-center overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${palette.accent}40, ${palette.accent}10)`,
              border: `2px solid ${palette.accent}60`,
            }}
          >
            {asset?.image_url ? (
              <img
                src={asset.image_url}
                alt={`${panel.character} character asset`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <span
                className="text-xs font-bold tracking-wider uppercase"
                style={{ color: palette.accent, fontFamily: "var(--font-label, monospace)" }}
              >
                {panel.character}
              </span>
            )}
          </div>
        </motion.div>
      )}

      {/* Title */}
      {panel.title && (
        <motion.h2
          className="relative z-10 text-center px-6 font-bold leading-tight"
          style={{
            color: palette.text,
            fontFamily: "var(--font-display, serif)",
            fontSize: "clamp(1.5rem, 4vw, 2.5rem)",
            textShadow: `0 2px 20px ${palette.bg}`,
            maxWidth: "90%",
          }}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          {panel.title}
        </motion.h2>
      )}

      {/* Narration caption */}
      {panel.narration && (
        <motion.p
          className="relative z-10 mt-3 text-center px-8"
          style={{
            color: `${palette.text}90`,
            fontFamily: "var(--font-body, sans-serif)",
            fontSize: "clamp(0.75rem, 1.5vw, 0.95rem)",
            maxWidth: "80%",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          {panel.narration}
        </motion.p>
      )}

      {/* Impact burst effect */}
      {panel.effects?.includes("impact_burst") && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.2 }}
          style={{
            background: `radial-gradient(circle at center, ${palette.accent}30, transparent 70%)`,
          }}
        />
      )}
    </div>
  );
}
