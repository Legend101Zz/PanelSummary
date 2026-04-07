/**
 * DSLCard.tsx — Single DSL-Rendered Reel Card
 * ==============================================
 * When no MP4 is available, renders the reel directly
 * from its Video DSL using the browser-side DSL engine.
 *
 * Replaces the <video> element with <DSLReelEngine>.
 * Same tap/gesture interactions as VideoCard.
 */

"use client";

import React, { useState, useCallback, useRef } from "react";
import { motion } from "motion/react";
import { Play, Pause } from "lucide-react";
import type { VideoReel } from "@/lib/types";
import { DSLReelEngine } from "./dsl-engine";
import type { VideoDSL } from "./dsl-engine";

interface Props {
  reel: VideoReel;
  dsl: VideoDSL;
  isActive: boolean;
}

export const DSLCard: React.FC<Props> = ({ reel, dsl, isActive }) => {
  const [playing, setPlaying] = useState(isActive);
  const [showPlayIcon, setShowPlayIcon] = useState(false);
  const iconTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapRef = useRef<{ time: number; x: number }>({
    time: 0,
    x: 0,
  });

  // Sync with isActive
  React.useEffect(() => {
    setPlaying(isActive);
  }, [isActive]);

  const handleTap = useCallback((e: React.MouseEvent) => {
    const now = Date.now();

    // Double-tap detection (300ms window)
    if (now - lastTapRef.current.time < 300) {
      lastTapRef.current = { time: 0, x: 0 };
      return;
    }
    lastTapRef.current = { time: now, x: e.clientX };

    // Single tap after delay → toggle play/pause
    setTimeout(() => {
      if (Date.now() - now >= 280) {
        setPlaying((p) => !p);
        setShowPlayIcon(true);
        if (iconTimerRef.current) clearTimeout(iconTimerRef.current);
        iconTimerRef.current = setTimeout(
          () => setShowPlayIcon(false),
          600,
        );
      }
    }, 300);
  }, []);

  // Duration in seconds for display
  const durationSec = Math.round(
    (dsl.meta?.total_duration_ms || reel.duration_ms || 30000) / 1000,
  );

  return (
    <div
      data-dsl-card
      onClick={handleTap}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        cursor: "pointer",
        overflow: "hidden",
        background: dsl.canvas?.background || "#0F0E17",
      }}
    >
      {/* DSL Engine — THE ACTUAL REEL */}
      <DSLReelEngine dsl={dsl} autoplay isActive={playing} />

      {/* Top gradient for text readability */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 140,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)",
          pointerEvents: "none",
          zIndex: 10,
        }}
      />

      {/* Bottom gradient */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 200,
          background:
            "linear-gradient(to top, rgba(0,0,0,0.7), transparent)",
          pointerEvents: "none",
          zIndex: 10,
        }}
      />

      {/* Book info (top) */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          right: 60,
          pointerEvents: "none",
          zIndex: 20,
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-label, 'DotGothic16')",
            fontSize: 10,
            color: dsl.palette?.accent || "#F5A623",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            marginBottom: 4,
          }}
        >
          REEL {(reel.reel_index ?? 0) + 1}
          {reel.total_reels_in_book
            ? ` / ${reel.total_reels_in_book}`
            : ""}
          <span style={{ opacity: 0.4 }}> · {durationSec}s</span>
        </p>
        <p
          style={{
            fontFamily:
              "var(--font-display, 'Dela Gothic One')",
            fontSize: "clamp(0.85rem, 3vw, 1.1rem)",
            color: "#F0EEE8",
            lineHeight: 1.2,
          }}
        >
          {reel.book?.title || "Unknown Book"}
        </p>
        {reel.book?.author && (
          <p
            style={{
              fontFamily: "var(--font-body, 'Outfit')",
              fontSize: "0.75rem",
              color: "#A8A6C0",
              marginTop: 2,
            }}
          >
            {reel.book.author}
          </p>
        )}
      </div>

      {/* Reel title (bottom) */}
      <div
        style={{
          position: "absolute",
          bottom: 44,
          left: 16,
          right: 60,
          pointerEvents: "none",
          zIndex: 20,
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-body, 'Outfit')",
            fontSize: "clamp(0.8rem, 2.5vw, 1rem)",
            color: "#F0EEE8",
            lineHeight: 1.3,
          }}
        >
          {reel.title || dsl.meta?.title || "Untitled"}
        </p>
        {reel.mood && (
          <p
            style={{
              fontFamily: "var(--font-label, 'DotGothic16')",
              fontSize: 9,
              color: "#5E5C78",
              marginTop: 4,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            {reel.mood}
          </p>
        )}
      </div>

      {/* Play/Pause flash */}
      {showPlayIcon && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "rgba(15,14,23,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 30,
            pointerEvents: "none",
          }}
        >
          {playing ? (
            <Pause size={28} color="#F0EEE8" />
          ) : (
            <Play size={28} color="#F0EEE8" />
          )}
        </motion.div>
      )}
    </div>
  );
};
