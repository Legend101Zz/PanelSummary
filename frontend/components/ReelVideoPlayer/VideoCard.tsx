/**
 * VideoCard.tsx — Single Video Reel Card
 * =========================================
 * Plays an MP4 video reel with:
 * - Auto-play on visibility (IntersectionObserver)
 * - Tap to pause/resume
 * - Double-tap right = skip 5s, left = restart
 * - Playback progress bar
 * - Subtle gradient overlays for text readability
 */

"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { motion } from "motion/react";
import { Play, Pause, RotateCcw } from "lucide-react";
import type { VideoReel } from "@/lib/types";
import { getVideoReelUrl, getImageUrl } from "@/lib/api";

interface Props {
  reel: VideoReel;
  isActive: boolean;
  onDoubleTapLeft?: () => void;
  onDoubleTapRight?: () => void;
}

export const VideoCard: React.FC<Props> = ({
  reel,
  isActive,
  onDoubleTapLeft,
  onDoubleTapRight,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showPlayIcon, setShowPlayIcon] = useState(false);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const iconTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-play/pause based on visibility
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      video.play().catch(() => {});
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  }, [isActive]);

  // Progress tracking
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => {
      if (video.duration) {
        setProgress(video.currentTime / video.duration);
      }
    };
    video.addEventListener("timeupdate", onTime);
    return () => video.removeEventListener("timeupdate", onTime);
  }, []);

  // Tap handling: single = pause/play, double-tap = skip
  const handleTap = useCallback(
    (e: React.MouseEvent) => {
      const now = Date.now();
      const rect = (e.target as HTMLElement)
        .closest("[data-video-card]")
        ?.getBoundingClientRect();
      if (!rect) return;

      const tapX = e.clientX - rect.left;
      const isLeft = tapX < rect.width * 0.35;
      const isRight = tapX > rect.width * 0.65;

      // Double-tap detection (within 300ms)
      if (now - lastTapRef.current.time < 300) {
        if (isRight) {
          // Skip 5s forward
          if (videoRef.current) {
            videoRef.current.currentTime = Math.min(
              videoRef.current.currentTime + 5,
              videoRef.current.duration,
            );
          }
          onDoubleTapRight?.();
        } else if (isLeft) {
          // Restart
          if (videoRef.current) {
            videoRef.current.currentTime = 0;
          }
          onDoubleTapLeft?.();
        }
        lastTapRef.current = { time: 0, x: 0 };
        return;
      }

      lastTapRef.current = { time: now, x: tapX };

      // Single tap after 300ms — toggle play/pause
      setTimeout(() => {
        if (Date.now() - now >= 280) {
          const video = videoRef.current;
          if (!video) return;

          if (video.paused) {
            video.play().catch(() => {});
            setPlaying(true);
          } else {
            video.pause();
            setPlaying(false);
          }

          // Flash play/pause icon
          setShowPlayIcon(true);
          if (iconTimerRef.current) clearTimeout(iconTimerRef.current);
          iconTimerRef.current = setTimeout(
            () => setShowPlayIcon(false),
            600,
          );
        }
      }, 300);
    },
    [onDoubleTapLeft, onDoubleTapRight],
  );

  const videoUrl =
    reel.book?.id && reel.id
      ? getVideoReelUrl(reel.book.id, reel.id)
      : "";

  return (
    <div
      data-video-card
      onClick={handleTap}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "#0F0E17",
        cursor: "pointer",
        overflow: "hidden",
      }}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        src={videoUrl}
        loop
        muted={false}
        playsInline
        preload="metadata"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />

      {/* Top gradient overlay */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 120,
          background:
            "linear-gradient(to bottom, rgba(15,14,23,0.7), transparent)",
          pointerEvents: "none",
        }}
      />

      {/* Bottom gradient overlay */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 180,
          background:
            "linear-gradient(to top, rgba(15,14,23,0.8), transparent)",
          pointerEvents: "none",
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
          zIndex: 10,
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-label, 'DotGothic16')",
            fontSize: 10,
            color: "var(--amber, #F5A623)",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            marginBottom: 4,
          }}
        >
          REEL {(reel.reel_index ?? 0) + 1}
          {reel.total_reels_in_book
            ? ` / ${reel.total_reels_in_book}`
            : ""}
        </p>
        <p
          style={{
            fontFamily: "var(--font-display, 'Dela Gothic One')",
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
          bottom: 40,
          left: 16,
          right: 60,
          pointerEvents: "none",
          zIndex: 10,
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
          {reel.title}
        </p>
        {reel.duration_ms > 0 && (
          <p
            style={{
              fontFamily: "var(--font-label, 'DotGothic16')",
              fontSize: 9,
              color: "#5E5C78",
              marginTop: 4,
            }}
          >
            {Math.round(reel.duration_ms / 1000)}s
            {reel.mood ? ` · ${reel.mood}` : ""}
          </p>
        )}
      </div>

      {/* Progress bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 3,
          background: "rgba(240,238,232,0.1)",
          zIndex: 20,
        }}
      >
        <motion.div
          style={{
            height: "100%",
            background:
              "linear-gradient(90deg, var(--amber, #F5A623), var(--red, #E8191A))",
            borderRadius: 2,
          }}
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>

      {/* Play/Pause icon flash */}
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
