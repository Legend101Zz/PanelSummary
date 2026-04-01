/**
 * manga/page.tsx — Manga Reader Page
 * =====================================
 * Defaults to Living Manga reader.
 * Toggle to switch between Living (animated) and Classic (static) modes.
 */

"use client";

import { useEffect, useState, use } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, AlertCircle, Sparkles, BookOpen } from "lucide-react";
import { getSummary, getAllLivingPanels } from "@/lib/api";
import type { Summary } from "@/lib/types";
import { MangaReader } from "@/components/MangaReader";
import { LivingPanelEngine, LivingPanelStyles } from "@/components/LivingPanel";
import type { LivingPanelDSL } from "@/lib/living-panel-types";
import { SAMPLE_LIVING_PANELS } from "@/lib/sample-living-book";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback } from "react";

type ReaderMode = "living" | "classic";

export default function MangaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const summaryId = searchParams.get("summary");
  const router = useRouter();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ReaderMode>("living");

  // Living panel state
  const [livingPanels, setLivingPanels] = useState<LivingPanelDSL[]>([]);
  const [livingLoaded, setLivingLoaded] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [panelIdx, setPanelIdx] = useState(0);
  const [actInfo, setActInfo] = useState({ current: 0, total: 1 });

  // Load summary
  useEffect(() => {
    if (!summaryId) {
      setError("No summary ID provided");
      setLoading(false);
      return;
    }

    getSummary(summaryId)
      .then((data) => {
        if (data.status !== "complete") {
          setError("Summary not yet complete");
        } else {
          setSummary(data);
        }
      })
      .catch(() => setError("Failed to load summary"))
      .finally(() => setLoading(false));
  }, [summaryId]);

  // Load living panels when we have a summary
  useEffect(() => {
    if (!summaryId || livingLoaded) return;

    getAllLivingPanels(summaryId)
      .then((lpData) => {
        if (lpData.living_panels && lpData.living_panels.length > 0) {
          setLivingPanels(lpData.living_panels as LivingPanelDSL[]);
          setDemoMode(lpData.source === "fallback");
        } else {
          setLivingPanels(SAMPLE_LIVING_PANELS);
          setDemoMode(true);
        }
      })
      .catch(() => {
        setLivingPanels(SAMPLE_LIVING_PANELS);
        setDemoMode(true);
      })
      .finally(() => setLivingLoaded(true));
  }, [summaryId, livingLoaded]);

  // Navigation
  const totalPanels = livingPanels.length;
  const goNext = useCallback(() => {
    if (panelIdx < totalPanels - 1) setPanelIdx(p => p + 1);
  }, [panelIdx, totalPanels]);
  const goPrev = useCallback(() => {
    if (panelIdx > 0) setPanelIdx(p => p - 1);
  }, [panelIdx]);

  useEffect(() => {
    if (mode !== "living") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, mode]);

  const onActChange = useCallback((current: number, total: number) => {
    setActInfo({ current: current + 1, total });
  }, []);

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0F0E17" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#F5A623" }} />
      </div>
    );
  }

  // Error
  if (error || !summary) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4" style={{ background: "#0F0E17" }}>
        <div>
          <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: "#E8191A" }} />
          <h1 style={{ color: "#F0EEE8", fontSize: "1.2rem" }}>{error}</h1>
        </div>
      </div>
    );
  }

  // Classic mode (backward compat for old summaries with static manga pages)
  if (mode === "classic") {
    const hasStaticPages = summary.manga_chapters && summary.manga_chapters.length > 0;
    if (!hasStaticPages) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: "#0F0E17" }}>
          <p style={{ color: "#A8A6C0", fontSize: 14 }}>No static manga pages available for this summary.</p>
          <button
            onClick={() => setMode("living")}
            className="px-4 py-2 rounded"
            style={{ background: "#F5A623", color: "#0F0E17", fontWeight: 600, fontSize: 13 }}
          >
            Switch to Living Manga
          </button>
        </div>
      );
    }
    return (
      <div className="relative">
        <ModeToggle mode={mode} onToggle={setMode} />
        <MangaReader summary={summary} />
      </div>
    );
  }

  // Living mode
  const currentDSL = livingPanels[panelIdx];
  const isFirst = panelIdx === 0;
  const isLast = panelIdx >= totalPanels - 1;

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: "#0F0E17" }}>
      <LivingPanelStyles />

      {/* Header */}
      <header
        className="flex items-center justify-between px-4 z-30"
        style={{
          background: "#17161F",
          borderBottom: "1px solid #2E2C3F",
          height: 40, minHeight: 40, flexShrink: 0,
        }}
      >
        <div className="flex items-center gap-3" style={{ minWidth: 140 }}>
          <span style={{
            fontFamily: "var(--font-display)", fontSize: 13,
            color: "#F5A623", letterSpacing: "0.08em",
          }}>
            Living Manga
          </span>
          {demoMode && (
            <span style={{
              fontSize: 8, color: "#A8A6C060", background: "#1F1E28",
              padding: "1px 5px", borderRadius: 2, border: "1px solid #2E2C3F",
              letterSpacing: "0.1em",
            }}>DEMO</span>
          )}
        </div>

        <span style={{
          fontSize: 11, color: "#A8A6C060", flex: 1, textAlign: "center",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          padding: "0 12px",
        }}>
          {currentDSL?.meta?.narrative_beat || ""}
        </span>

        <div className="flex items-center gap-3" style={{ minWidth: 160, justifyContent: "flex-end" }}>
          <ModeToggle mode={mode} onToggle={setMode} compact />
          <span style={{ color: "#5E5C78", fontSize: 11 }}>
            {panelIdx + 1}<span style={{ color: "#5E5C7840" }}> / {totalPanels}</span>
          </span>
          {actInfo.total > 1 && (
            <span style={{
              color: "#A8A6C060", fontSize: 9,
              border: "1px solid #2E2C3F", padding: "2px 6px", borderRadius: 2,
            }}>
              ACT {actInfo.current}/{actInfo.total}
            </span>
          )}
        </div>
      </header>

      {/* Main panel area */}
      <div className="flex-1 flex items-stretch min-h-0">
        <button
          onClick={goPrev} disabled={isFirst}
          className="flex items-center justify-center transition-opacity"
          style={{ width: 48, color: "#5E5C78", opacity: isFirst ? 0.15 : 0.5, cursor: isFirst ? "default" : "pointer" }}
          aria-label="Previous page"
        >
          <ChevronLeft size={24} />
        </button>

        <div className="flex-1 min-w-0 flex items-center justify-center p-2 sm:p-4">
          {currentDSL ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={panelIdx}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="w-full h-full max-w-4xl"
              >
                <LivingPanelEngine dsl={currentDSL} debug={false} onActChange={onActChange} />
              </motion.div>
            </AnimatePresence>
          ) : (
            <p style={{ color: "#5E5C78", fontSize: 12 }}>No panels available</p>
          )}
        </div>

        <button
          onClick={goNext} disabled={isLast}
          className="flex items-center justify-center transition-opacity"
          style={{ width: 48, color: "#5E5C78", opacity: isLast ? 0.15 : 0.5, cursor: isLast ? "default" : "pointer" }}
          aria-label="Next page"
        >
          <ChevronRight size={24} />
        </button>
      </div>

      {/* Page dots */}
      <div className="flex items-center justify-center gap-1 py-2">
        {livingPanels.map((_, i) => (
          <button
            key={i} onClick={() => setPanelIdx(i)}
            className="rounded-full transition-all"
            style={{
              width: i === panelIdx ? 16 : 4, height: 3,
              background: i === panelIdx ? "#F5A623" : "#2E2C3F",
            }}
            aria-label={`Page ${i + 1}`}
          />
        ))}
      </div>

      {/* Footer */}
      <footer
        className="flex items-center justify-center px-4"
        style={{ borderTop: "1px solid #2E2C3F", background: "#17161F", height: 24, minHeight: 24, flexShrink: 0 }}
      >
        <span style={{ color: "#5E5C7830", fontSize: 8, letterSpacing: "0.15em" }}>
          TAP PANEL → NEXT ACT &nbsp;·&nbsp; ← → → NAVIGATE PAGES
        </span>
      </footer>
    </div>
  );
}

/** Compact toggle between Living and Classic mode */
function ModeToggle({
  mode, onToggle, compact = false,
}: {
  mode: ReaderMode;
  onToggle: (m: ReaderMode) => void;
  compact?: boolean;
}) {
  const isLiving = mode === "living";
  return (
    <button
      onClick={() => onToggle(isLiving ? "classic" : "living")}
      className="flex items-center gap-1.5 transition-all"
      style={{
        padding: compact ? "2px 8px" : "4px 12px",
        borderRadius: 4,
        border: `1px solid ${isLiving ? "#F5A62340" : "#2E2C3F"}`,
        background: isLiving ? "#F5A62310" : "#17161F",
        color: isLiving ? "#F5A623" : "#5E5C78",
        fontSize: compact ? 10 : 12,
        cursor: "pointer",
      }}
      aria-label={`Switch to ${isLiving ? "classic" : "living"} mode`}
    >
      {isLiving ? <Sparkles size={compact ? 10 : 14} /> : <BookOpen size={compact ? 10 : 14} />}
      {!compact && (isLiving ? "Living" : "Classic")}
    </button>
  );
}
