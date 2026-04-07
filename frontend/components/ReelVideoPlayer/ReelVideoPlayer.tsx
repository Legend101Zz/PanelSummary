/**
 * ReelVideoPlayer.tsx — Dual-Swipe Reel Player v2
 * ===================================================
 * Production-grade reel player with:
 *
 * ↕ VERTICAL scroll-snap — CSS native, 60fps — different books
 * ↔ HORIZONTAL swipe — motion drag — same book, next reel
 *
 * Supports TWO render modes:
 * - MP4 (server-rendered via Remotion)
 * - DSL (browser-rendered via DSLReelEngine)
 *
 * Falls back gracefully: if MP4 isn't available, uses DSL.
 * If neither exists, shows a styled placeholder.
 *
 * DESIGN: "Ink & Light" — reading-native video experience.
 * Deep ink backgrounds, parchment overlays, manga typography.
 */

"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { motion, PanInfo, AnimatePresence } from "motion/react";
import { ChevronLeft, BookOpen } from "lucide-react";
import Link from "next/link";
import type { VideoReel } from "@/lib/types";
import { VideoCard } from "./VideoCard";
import { DSLCard } from "./DSLCard";
import { ReelActions } from "./ReelActions";
import type { VideoDSL } from "./dsl-engine";

interface Props {
  reels: VideoReel[];
  backPath?: string;
}

/** Group reels by book for horizontal swiping */
function groupByBook(
  reels: VideoReel[],
): { bookId: string; reels: VideoReel[] }[] {
  const map = new Map<string, VideoReel[]>();
  for (const reel of reels) {
    const bookId = reel.book?.id || "unknown";
    if (!map.has(bookId)) map.set(bookId, []);
    map.get(bookId)!.push(reel);
  }
  return Array.from(map.entries()).map(([bookId, bookReels]) => ({
    bookId,
    reels: bookReels,
  }));
}

export const ReelVideoPlayer: React.FC<Props> = ({ reels, backPath }) => {
  const bookGroups = useMemo(() => groupByBook(reels), [reels]);
  const [activeVertical, setActiveVertical] = useState(0);
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
            if (!isNaN(idx)) setActiveVertical(idx);
          }
        }
      },
      { root: container, threshold: 0.6 },
    );

    const slots = container.querySelectorAll("[data-vertical-idx]");
    slots.forEach((slot) => observer.observe(slot));
    return () => observer.disconnect();
  }, [bookGroups.length]);

  const getHIdx = (bookId: string) => horizontalIndices[bookId] || 0;
  const setHIdx = (bookId: string, idx: number) =>
    setHorizontalIndices((prev) => ({ ...prev, [bookId]: idx }));

  if (!bookGroups.length) {
    return (
      <div
        style={{
          height: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0F0E17",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <BookOpen size={40} color="#5E5C78" />
        <p
          style={{
            fontFamily: "var(--font-label, 'DotGothic16')",
            color: "#5E5C78",
            fontSize: 12,
          }}
        >
          NO REELS YET
        </p>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 50 }}>
      {/* Back button — pill shape with blur */}
      {backPath && (
        <Link
          href={backPath}
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            zIndex: 60,
            height: 32,
            padding: "0 14px",
            borderRadius: 16,
            background: "rgba(15,14,23,0.55)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(240,238,232,0.08)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: "#F0EEE8",
            textDecoration: "none",
            fontFamily: "var(--font-label, 'DotGothic16')",
            fontSize: 9,
            letterSpacing: "0.12em",
          }}
        >
          <ChevronLeft size={14} />
          BACK
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
              <HorizontalSwiper
                reels={group.reels}
                activeIndex={hIdx}
                onIndexChange={(idx) => setHIdx(group.bookId, idx)}
                isVerticalActive={isActive}
              />

              {/* Reel actions (right sidebar) */}
              <ReelActions reel={currentReel} />

              {/* Horizontal dots — same-book navigation */}
              {group.reels.length > 1 && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 20,
                    left: "50%",
                    transform: "translateX(-50%)",
                    display: "flex",
                    gap: 5,
                    zIndex: 15,
                    padding: "4px 10px",
                    borderRadius: 12,
                    background: "rgba(15,14,23,0.4)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  {group.reels.map((_, di) => (
                    <button
                      key={di}
                      onClick={() => setHIdx(group.bookId, di)}
                      style={{
                        width: di === hIdx ? 18 : 5,
                        height: 5,
                        borderRadius: 3,
                        background:
                          di === hIdx
                            ? "#F5A623"
                            : "rgba(240,238,232,0.2)",
                        transition: "all 0.3s ease",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                      }}
                      aria-label={`Reel ${di + 1}`}
                    />
                  ))}
                </div>
              )}

              {/* Vertical position indicator (right edge) */}
              {bookGroups.length > 1 && (
                <div
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    zIndex: 15,
                  }}
                >
                  {bookGroups.map((_, bi) => (
                    <div
                      key={bi}
                      style={{
                        width: 3,
                        height: bi === vi ? 14 : 3,
                        borderRadius: 2,
                        background:
                          bi === vi
                            ? "#F5A623"
                            : "rgba(240,238,232,0.15)",
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
    },
    [activeIndex, reels.length, onIndexChange],
  );

  const currentReel = reels[activeIndex];
  if (!currentReel) return null;

  // Determine render mode: DSL or MP4
  const hasMp4 = Boolean(currentReel.video_path);
  const hasDsl = Boolean((currentReel as any).dsl);

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.2}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={handleDragEnd}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={`${currentReel.id}-${activeIndex}`}
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
          {hasDsl && !hasMp4 ? (
            <DSLCard
              reel={currentReel}
              dsl={(currentReel as any).dsl as VideoDSL}
              isActive={isVerticalActive && !isDragging}
            />
          ) : (
            <VideoCard
              reel={currentReel}
              isActive={isVerticalActive && !isDragging}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
