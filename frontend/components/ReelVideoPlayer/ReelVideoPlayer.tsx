/**
 * ReelVideoPlayer.tsx — Dual-Swipe Video Reel Player
 * =====================================================
 * Production-grade reel player with:
 *
 * ↕ VERTICAL scroll-snap — CSS native, 60fps — different books
 * ↔ HORIZONTAL swipe — motion drag — same book, next reel
 *
 * Architecture:
 * - Reels grouped by book_id for horizontal navigation
 * - IntersectionObserver tracks which card is in view
 * - Auto-play on snap, pause when off-screen
 * - Horizontal dots indicator for same-book reels
 *
 * DESIGN: Matches PanelSummary's "Ink & Paper" manga aesthetic.
 * Deep ink bg, amber/red accents, DotGothic16 labels,
 * Dela Gothic One headers.
 */

"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion, PanInfo, AnimatePresence } from "motion/react";
import { ChevronLeft, Film } from "lucide-react";
import Link from "next/link";
import type { VideoReel } from "@/lib/types";
import { VideoCard } from "./VideoCard";
import { ReelActions } from "./ReelActions";

interface Props {
  reels: VideoReel[];
  /** If set, shows back button to this path */
  backPath?: string;
}

/** Group reels by book for horizontal swiping */
function groupByBook(
  reels: VideoReel[],
): Map<string, VideoReel[]> {
  const map = new Map<string, VideoReel[]>();
  for (const reel of reels) {
    const bookId = reel.book?.id || "unknown";
    if (!map.has(bookId)) map.set(bookId, []);
    map.get(bookId)!.push(reel);
  }
  return map;
}

export const ReelVideoPlayer: React.FC<Props> = ({ reels, backPath }) => {
  // Group reels by book for horizontal navigation
  const bookGroups = useMemo(() => {
    const grouped = groupByBook(reels);
    return Array.from(grouped.entries()).map(([bookId, bookReels]) => ({
      bookId,
      reels: bookReels,
    }));
  }, [reels]);

  // Track which vertical slot is active
  const [activeVertical, setActiveVertical] = useState(0);
  // Track horizontal index per book group
  const [horizontalIndices, setHorizontalIndices] = useState<
    Record<string, number>
  >({});

  const containerRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver for vertical scroll-snap detection
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number(
              (entry.target as HTMLElement).dataset.verticalIdx,
            );
            if (!isNaN(idx)) {
              setActiveVertical(idx);
            }
          }
        }
      },
      {
        root: container,
        threshold: 0.6,
      },
    );

    const slots = container.querySelectorAll("[data-vertical-idx]");
    slots.forEach((slot) => observer.observe(slot));

    return () => observer.disconnect();
  }, [bookGroups.length]);

  const getHIdx = (bookId: string) => horizontalIndices[bookId] || 0;

  const setHIdx = (bookId: string, idx: number) => {
    setHorizontalIndices((prev) => ({ ...prev, [bookId]: idx }));
  };

  if (!bookGroups.length) {
    return (
      <div
        style={{
          height: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg, #0F0E17)",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <Film size={40} color="var(--text-3, #5E5C78)" />
        <p
          style={{
            fontFamily: "var(--font-label, 'DotGothic16')",
            color: "var(--text-3, #5E5C78)",
            fontSize: 12,
          }}
        >
          NO VIDEO REELS YET
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        zIndex: 50,
      }}
    >
      {/* Back button */}
      {backPath && (
        <Link
          href={backPath}
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            zIndex: 60,
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "rgba(15,14,23,0.5)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(240,238,232,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#F0EEE8",
            textDecoration: "none",
          }}
        >
          <ChevronLeft size={18} />
        </Link>
      )}

      {/* Vertical scroll container */}
      <div
        ref={containerRef}
        style={{
          height: "100dvh",
          overflowY: "scroll",
          scrollSnapType: "y mandatory",
          scrollBehavior: "smooth",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {bookGroups.map((group, vi) => {
          const isActive = vi === activeVertical;
          const hIdx = getHIdx(group.bookId);
          const currentReel = group.reels[hIdx];

          if (!currentReel) return null;

          return (
            <div
              key={group.bookId}
              data-vertical-idx={vi}
              style={{
                height: "100dvh",
                scrollSnapAlign: "start",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Horizontal swipe wrapper */}
              <HorizontalSwiper
                reels={group.reels}
                activeIndex={hIdx}
                onIndexChange={(idx) => setHIdx(group.bookId, idx)}
                isVerticalActive={isActive}
              />

              {/* Action buttons */}
              <ReelActions reel={currentReel} />

              {/* Horizontal dots (same-book navigation) */}
              {group.reels.length > 1 && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 24,
                    left: "50%",
                    transform: "translateX(-50%)",
                    display: "flex",
                    gap: 6,
                    zIndex: 15,
                  }}
                >
                  {group.reels.map((_, di) => (
                    <div
                      key={di}
                      style={{
                        width: di === hIdx ? 20 : 6,
                        height: 6,
                        borderRadius: 3,
                        background:
                          di === hIdx
                            ? "var(--amber, #F5A623)"
                            : "rgba(240,238,232,0.25)",
                        transition: "all 0.3s ease",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Horizontal swipe for same-book reel navigation */
function HorizontalSwiper({
  reels,
  activeIndex,
  onIndexChange,
  isVerticalActive,
}: {
  reels: VideoReel[];
  activeIndex: number;
  onIndexChange: (idx: number) => void;
  isVerticalActive: boolean;
}) {
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnd = useCallback(
    (_: any, info: PanInfo) => {
      setIsDragging(false);
      const threshold = 60;

      if (info.offset.x < -threshold && activeIndex < reels.length - 1) {
        onIndexChange(activeIndex + 1);
      } else if (info.offset.x > threshold && activeIndex > 0) {
        onIndexChange(activeIndex - 1);
      }
      setDragX(0);
    },
    [activeIndex, reels.length, onIndexChange],
  );

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.2}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={handleDragEnd}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
      }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={`${reels[activeIndex]?.id}-${activeIndex}`}
          initial={{ x: 300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -300, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          style={{
            width: "100%",
            height: "100%",
            position: "absolute",
            inset: 0,
          }}
        >
          <VideoCard
            reel={reels[activeIndex]}
            isActive={isVerticalActive && !isDragging}
          />
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
