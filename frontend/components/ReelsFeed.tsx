"use client";

/**
 * ReelsFeed.tsx — MANGA SPLASH PAGE REELS
 * ==========================================
 * Each reel = a full-bleed manga panel / splash page.
 *
 * DESIGN LANGUAGE:
 * - Panel corners (manga-style cut corners visible at edges)
 * - Chapter number top-left (like manga page numbering)
 * - Book title as panel header strip
 * - Speed lines radiate based on content energy
 * - Horizontal swipe feels like flipping within the same manga chapter
 * - Key points animate in like dialogue bubbles
 *
 * INTERACTION:
 * - Vertical CSS scroll-snap = frame-perfect 60fps
 * - Horizontal Motion.dev drag = same-book lesson cycling
 * - Heart button = saves to local storage (future feature)
 * - IntersectionObserver tracks which card is active
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence, PanInfo } from "motion/react";
import { Heart, Share2, BookOpen, ArrowLeft, X } from "lucide-react";
import Link from "next/link";
import { getReels, getImageUrl } from "@/lib/api";
import type { ReelLesson } from "@/lib/types";

// ─── SPEED LINES (directional) ──────────────────────────────
function ReelSpeedLines({ color = "#F5A623" }: { color?: string }) {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 400 700" preserveAspectRatio="xMidYMid slice">
      {Array.from({ length: 36 }, (_, i) => {
        const angle = (i / 36) * 360;
        const rad = (angle * Math.PI) / 180;
        const len = 600;
        const cx = 200, cy = 580;
        return (
          <line key={i} x1={cx} y1={cy}
            x2={cx + Math.cos(rad) * len} y2={cy + Math.sin(rad) * len}
            stroke={color} strokeWidth={0.4 + (i % 4) * 0.3} opacity={0.04 + (i % 3) * 0.01} />
        );
      })}
    </svg>
  );
}

// ─── PANEL CORNER MARKS ─────────────────────────────────────
function PanelCorners({ color = "rgba(255,255,255,0.15)" }: { color?: string }) {
  const s = 16; // corner size
  return (
    <>
      {[["top-0 left-0", "border-t-2 border-l-2"], ["top-0 right-0", "border-t-2 border-r-2"],
        ["bottom-0 left-0", "border-b-2 border-l-2"], ["bottom-0 right-0", "border-b-2 border-r-2"]]
        .map(([pos, border], i) => (
          <div key={i} className={`absolute ${pos} w-4 h-4 ${border}`} style={{ borderColor: color }} />
        ))}
    </>
  );
}

// ─── ANIMATED KEY POINT ─────────────────────────────────────
function KeyPoint({ text, index, accent, active }: { text: string; index: number; accent: string; active: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -24 }}
      animate={active ? { opacity: 1, x: 0 } : { opacity: 0, x: -24 }}
      transition={{ delay: 0.3 + index * 0.12, type: "spring", stiffness: 260, damping: 24 }}
      className="flex items-start gap-3"
    >
      <motion.span
        initial={{ scale: 0 }}
        animate={active ? { scale: 1 } : { scale: 0 }}
        transition={{ delay: 0.35 + index * 0.12, type: "spring", stiffness: 400 }}
        className="shrink-0 w-5 h-5 flex items-center justify-center text-xs mt-0.5"
        style={{
          background: `${accent}20`,
          border: `1px solid ${accent}50`,
          color: accent,
          fontFamily: "var(--font-label)",
          fontSize: "9px",
        }}
      >
        {index + 1}
      </motion.span>
      <p style={{ fontFamily: "var(--font-body)", color: "rgba(255,255,255,0.88)", fontSize: "0.9rem", lineHeight: 1.55 }}>
        {text}
      </p>
    </motion.div>
  );
}

// ─── BOOK LABEL STRIP ───────────────────────────────────────
function BookStrip({ title, author, coverUrl }: { title: string; author?: string | null; coverUrl?: string | null }) {
  return (
    <div className="flex items-center gap-2.5">
      {coverUrl
        ? <img src={coverUrl} alt={title} className="w-7 h-9 object-cover border border-white/10" />
        : <div className="w-7 h-9 border border-white/10 flex items-center justify-center" style={{ background: "rgba(255,255,255,0.05)" }}>
            <BookOpen size={12} style={{ color: "rgba(255,255,255,0.4)" }} />
          </div>
      }
      <div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "0.78rem", color: "rgba(255,255,255,0.9)", fontWeight: 600, lineHeight: 1.2 }}>
          {title}
        </p>
        {author && <p style={{ fontFamily: "var(--font-label)", fontSize: "9px", color: "rgba(255,255,255,0.4)", letterSpacing: "0.12em" }}>{author.toUpperCase()}</p>}
      </div>
    </div>
  );
}

// ─── SINGLE REEL CARD ───────────────────────────────────────
// Picks the background from the visual_theme string
function getCardBg(theme: string, style: string): string {
  const map: Record<string, string> = {
    manga:      "linear-gradient(160deg, #0F0E17 0%, #1A0A0A 60%, #0F0E17 100%)",
    noir:       "linear-gradient(160deg, #080808 0%, #141418 100%)",
    minimalist: "linear-gradient(160deg, #111115 0%, #1A1A22 100%)",
    comedy:     "linear-gradient(160deg, #0F0E17 0%, #1A1500 100%)",
    academic:   "linear-gradient(160deg, #080D18 0%, #0A1628 100%)",
  };
  return map[style] ?? map.manga;
}

function getAccent(style: string): string {
  const map: Record<string, string> = {
    manga: "#F5A623", noir: "#C8A96E", minimalist: "#FFFFFF",
    comedy: "#F5C518", academic: "#60A5FA",
  };
  return map[style] ?? "#F5A623";
}

function ReelCard({
  reel,
  bookReels,
  isActive,
}: {
  reel: ReelLesson;
  bookReels: ReelLesson[];
  isActive: boolean;
}) {
  const [localIdx, setLocalIdx] = useState(bookReels.findIndex((r) => r.reel_index === reel.reel_index) || 0);
  const [liked, setLiked] = useState(false);

  const current = bookReels[localIdx] ?? reel;
  const accent = getAccent(current.style);
  const bg = getCardBg(current.visual_theme, current.style);
  const coverUrl = reel.book?.cover_image_id ? getImageUrl(reel.book.cover_image_id) : null;

  const nextLocal = () => setLocalIdx((i) => Math.min(i + 1, bookReels.length - 1));
  const prevLocal = () => setLocalIdx((i) => Math.max(i - 1, 0));

  const onHorizDrag = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 70) {
      if (info.offset.x < 0) nextLocal();
      else prevLocal();
    }
  };

  return (
    <div className="reel-slide" style={{ background: bg }}>
      {/* Speed lines */}
      <ReelSpeedLines color={accent} />
      {/* Panel corners */}
      <PanelCorners color={`${accent}30`} />
      {/* Halftone */}
      <div className="halftone absolute inset-0 opacity-30" />

      {/* Draggable content */}
      <motion.div
        className="absolute inset-0 flex flex-col"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.07}
        onDragEnd={onHorizDrag}
      >
        {/* TOP BAR */}
        <div className="flex items-center justify-between px-5 pt-6 pb-3">
          {reel.book && (
            <Link href={`/books/${reel.book.id}`}>
              <BookStrip title={reel.book.title} author={reel.book.author} coverUrl={coverUrl} />
            </Link>
          )}
          {/* Horizontal position dots */}
          {bookReels.length > 1 && (
            <div className="flex items-center gap-1.5">
              {bookReels.map((_, i) => (
                <motion.div key={i}
                  animate={{ width: i === localIdx ? 18 : 5, opacity: i === localIdx ? 1 : 0.3 }}
                  className="h-1 rounded-full"
                  style={{ background: accent }}
                />
              ))}
            </div>
          )}
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-1 flex flex-col justify-center px-5 py-4 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${localIdx}`}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Lesson tag */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: isActive ? 1 : 0 }}
                transition={{ delay: 0.05 }}
                className="inline-flex items-center gap-1.5 mb-4 px-2 py-0.5 text-label"
                style={{ background: `${accent}18`, border: `1px solid ${accent}35`, color: accent, fontSize: "9px" }}
              >
                ⚡ LESSON {localIdx + 1}/{bookReels.length}
              </motion.div>

              {/* Title */}
              <motion.h2
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 12 }}
                transition={{ delay: 0.08 }}
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(1.6rem, 5vw, 2.4rem)",
                  color: "#fff",
                  lineHeight: 1.1,
                  marginBottom: "0.75rem",
                }}
              >
                {current.lesson_title}
              </motion.h2>

              {/* Hook */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: isActive ? 1 : 0 }}
                transition={{ delay: 0.15 }}
                style={{ fontFamily: "var(--font-body)", color: accent, fontSize: "1rem", lineHeight: 1.5, marginBottom: "1.5rem", fontWeight: 500 }}
              >
                {current.hook}
              </motion.p>

              {/* Divider */}
              <div className="mb-4 h-px" style={{ background: `linear-gradient(90deg, ${accent}60, transparent)` }} />

              {/* Key points */}
              <div className="flex flex-col gap-3">
                {current.key_points.slice(0, 4).map((pt, i) => (
                  <KeyPoint key={i} text={pt} index={i} accent={accent} active={isActive} />
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* BOTTOM BAR */}
        <div className="px-5 pb-8">
          {/* Horizontal swipe hint */}
          {bookReels.length > 1 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: isActive ? 0.45 : 0 }}
              transition={{ delay: 0.8 }}
              className="text-label text-center mb-3"
              style={{ fontSize: "9px" }}
            >
              ← SWIPE FOR MORE FROM THIS BOOK →
            </motion.p>
          )}

          {/* Action row */}
          <div className="flex items-center justify-between">
            <p className="text-label" style={{ fontSize: "9px", color: "rgba(255,255,255,0.2)" }}>
              ↕ SCROLL
            </p>
            <div className="flex gap-4">
              <motion.button
                whileTap={{ scale: 0.8 }}
                onClick={() => setLiked((l) => !l)}
                className="flex flex-col items-center gap-0.5"
              >
                <motion.div animate={liked ? { scale: [1, 1.5, 1] } : {}} transition={{ type: "spring", stiffness: 400 }}>
                  <Heart size={20} style={{ fill: liked ? "#E8191A" : "transparent", color: liked ? "#E8191A" : "rgba(255,255,255,0.5)" }} />
                </motion.div>
                <span className="text-label" style={{ fontSize: "8px", color: "rgba(255,255,255,0.3)" }}>SAVE</span>
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.8 }}
                className="flex flex-col items-center gap-0.5"
                onClick={() => navigator.share?.({ title: current.lesson_title, text: current.hook })}
              >
                <Share2 size={20} style={{ color: "rgba(255,255,255,0.5)" }} />
                <span className="text-label" style={{ fontSize: "8px", color: "rgba(255,255,255,0.3)" }}>SHARE</span>
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── REELS FEED CONTAINER ────────────────────────────────────
export function ReelsFeed({ reels: initial }: { reels: ReelLesson[] }) {
  const [reels, setReels] = useState(initial);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Group reels by summary for horizontal swipe
  const bookReels = useCallback((summaryId?: string) => {
    if (!summaryId) return reels.slice(activeIdx, activeIdx + 1);
    return reels.filter((r) => r.summary_id === summaryId);
  }, [reels, activeIdx]);

  // Track active via IntersectionObserver
  useEffect(() => {
    const slides = containerRef.current?.querySelectorAll(".reel-slide");
    if (!slides) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const i = Array.from(slides).indexOf(e.target as HTMLElement);
          if (i >= 0) setActiveIdx(i);
        }
      });
    }, { threshold: 0.65 });
    slides.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [reels]);

  // Infinite load
  useEffect(() => {
    if (activeIdx >= reels.length - 3 && !loadingMore) {
      setLoadingMore(true);
      getReels(reels.length, 20)
        .then((d) => { if (d.reels.length > 0) setReels((p) => [...p, ...d.reels]); })
        .catch(() => {})
        .finally(() => setLoadingMore(false));
    }
  }, [activeIdx, reels.length, loadingMore]);

  return (
    <div className="relative">
      {/* Top nav overlay for reels */}
      <div
        className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-12"
        style={{ background: "rgba(15,14,23,0.85)", backdropFilter: "blur(10px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <Link href="/">
          <button className="flex items-center gap-2" style={{ color: "rgba(255,255,255,0.5)" }}>
            <ArrowLeft size={16} />
            <span className="text-label" style={{ fontSize: "9px" }}>BACK</span>
          </button>
        </Link>
        <span className="text-label" style={{ color: "var(--amber)", fontSize: "9px" }}>
          ⚡ LESSON {activeIdx + 1} / {reels.length}
        </span>
        <div className="w-12" />
      </div>

      <div ref={containerRef} className="reel-feed" style={{ paddingTop: "3rem" }}>
        {reels.map((reel, i) => (
          <ReelCard
            key={`${reel.reel_index}-${reel.summary_id ?? i}`}
            reel={reel}
            bookReels={bookReels(reel.summary_id)}
            isActive={i === activeIdx}
          />
        ))}

        {loadingMore && (
          <div className="reel-slide flex items-center justify-center" style={{ background: "var(--bg)" }}>
            <div className="text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                className="w-8 h-8 border-2 rounded-full mx-auto mb-3"
                style={{ borderColor: "var(--border-2)", borderTopColor: "var(--amber)" }}
              />
              <p className="text-label" style={{ color: "var(--text-3)" }}>LOADING MORE LESSONS</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
