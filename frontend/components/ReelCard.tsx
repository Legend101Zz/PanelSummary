/**
 * ReelCard.tsx — Single reel list item
 * =======================================
 * Compact card for the video-reels list page.
 * Shows title, mood, status badge, and a hover-reveal delete button.
 */

"use client";

import React from "react";
import { motion } from "motion/react";
import { Film, Clapperboard, Video, Trash2 } from "lucide-react";
import type { VideoReel } from "@/lib/types";

interface Props {
  reel: VideoReel;
  index: number;
  onWatch: () => void;
  onDelete: () => void;
}

export const ReelCard: React.FC<Props> = ({ reel, index, onWatch, onDelete }) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="panel flex items-center gap-4 px-4 py-3 group transition-colors"
      style={{ borderColor: "var(--border)" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--amber)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {/* Thumbnail — click to watch */}
      <div
        className="w-12 h-16 flex-shrink-0 flex items-center justify-center cursor-pointer"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        onClick={onWatch}
      >
        {reel.render_status === "complete" ? (
          <Film size={16} style={{ color: "var(--amber)" }} />
        ) : reel.dsl ? (
          <Clapperboard size={16} style={{ color: "var(--blue, #0053e2)" }} />
        ) : (
          <Video size={16} style={{ color: "var(--text-3)" }} />
        )}
      </div>

      <div className="flex-1 min-w-0 cursor-pointer" onClick={onWatch}>
        <p className="font-label" style={{ color: "var(--text-1)", fontSize: "11px" }}>
          {reel.title || `Reel ${(reel.reel_index ?? 0) + 1}`}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-label" style={{ fontSize: "9px" }}>
            {reel.duration_ms > 0 ? `${Math.round(reel.duration_ms / 1000)}s` : ""}
            {reel.mood ? ` · ${reel.mood}` : ""}
          </span>
          <span
            className="text-label px-1.5 py-0.5"
            style={{
              fontSize: "7px",
              background: reel.render_status === "complete"
                ? "rgba(42,135,3,0.1)"
                : reel.dsl ? "rgba(0,83,226,0.1)" : "rgba(245,166,35,0.1)",
              color: reel.render_status === "complete"
                ? "var(--green, #2a8703)"
                : reel.dsl ? "var(--blue, #0053e2)" : "var(--amber)",
            }}
          >
            {reel.render_status === "complete" ? "MP4" : reel.dsl ? "DSL LIVE" : "PENDING"}
          </span>
        </div>
      </div>

      <span
        className="font-label flex-shrink-0 mr-2"
        style={{ color: "var(--text-3)", fontSize: "9px" }}
      >
        {String((reel.reel_index ?? 0) + 1).padStart(2, "0")}
      </span>

      {/* Delete button — visible on hover */}
      <motion.button
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.9 }}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        style={{
          width: 28,
          height: 28,
          borderRadius: 4,
          border: "1px solid rgba(234,17,0,0.2)",
          background: "rgba(234,17,0,0.06)",
          color: "var(--red, #ea1100)",
          flexShrink: 0,
        }}
        aria-label={`Delete ${reel.title || "reel"}`}
      >
        <Trash2 size={13} />
      </motion.button>
    </motion.div>
  );
};
