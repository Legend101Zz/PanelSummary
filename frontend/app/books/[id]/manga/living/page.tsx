"use client";

/**
 * living/page.tsx — Living Manga Panel Demo & Viewer
 * =====================================================
 * Shows a manga page with Living Panel DSL-driven animations.
 * Falls back to auto-generated DSLs from the static panel data.
 *
 * URL: /books/{id}/manga/living?summary={summaryId}
 */

import { useEffect, useState, use, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, AlertCircle, ChevronLeft, ChevronRight, Sparkles, Zap } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { getSummary, getLivingPanels } from "@/lib/api";
import { getStyleAccent } from "@/lib/utils";
import { LivingPanelEngine, LivingPanelStyles } from "@/components/LivingPanel";
import type { Summary, MangaPage } from "@/lib/types";
import type { LivingPanelDSL } from "@/lib/living-panel-types";
import { createSampleLivingPanel } from "@/lib/living-panel-types";

export default function LivingMangaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const summaryId = searchParams.get("summary");

  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Navigation state
  const [chIdx, setChIdx] = useState(0);
  const [pageIdx, setPageIdx] = useState(0);
  const [panelIdx, setPanelIdx] = useState(0);

  // Living panel DSLs for current page
  const [livingPanels, setLivingPanels] = useState<LivingPanelDSL[]>([]);
  const [loadingPanels, setLoadingPanels] = useState(false);

  // Demo mode (no summary)
  const [demoMode, setDemoMode] = useState(!summaryId);

  // ============================================================
  // LOAD SUMMARY
  // ============================================================

  useEffect(() => {
    if (!summaryId) {
      setDemoMode(true);
      setLivingPanels([createSampleLivingPanel()]);
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

  // ============================================================
  // LOAD LIVING PANELS FOR CURRENT PAGE
  // ============================================================

  useEffect(() => {
    if (!summary || !summaryId || demoMode) return;

    setLoadingPanels(true);
    getLivingPanels(summaryId, chIdx, pageIdx)
      .then((data) => {
        setLivingPanels(data.living_panels as LivingPanelDSL[]);
        setPanelIdx(0);
      })
      .catch((err) => {
        console.error("Failed to load living panels:", err);
        setLivingPanels([createSampleLivingPanel()]);
      })
      .finally(() => setLoadingPanels(false));
  }, [summary, summaryId, chIdx, pageIdx, demoMode]);

  // ============================================================
  // NAVIGATION
  // ============================================================

  const chapters = summary?.manga_chapters || [];
  const chapter = chapters[chIdx];
  const pages: MangaPage[] = chapter?.pages || [];
  const currentPage = pages[pageIdx];
  const totalPanels = livingPanels.length;
  const accent = summary ? getStyleAccent(summary.style) : "#00f5ff";

  const goNextPanel = useCallback(() => {
    if (panelIdx < totalPanels - 1) {
      setPanelIdx(p => p + 1);
      return;
    }
    // Next page
    if (pageIdx < pages.length - 1) {
      setPageIdx(p => p + 1);
      setPanelIdx(0);
      return;
    }
    // Next chapter
    if (chIdx < chapters.length - 1) {
      setChIdx(c => c + 1);
      setPageIdx(0);
      setPanelIdx(0);
    }
  }, [panelIdx, totalPanels, pageIdx, pages.length, chIdx, chapters.length]);

  const goPrevPanel = useCallback(() => {
    if (panelIdx > 0) {
      setPanelIdx(p => p - 1);
      return;
    }
    if (pageIdx > 0) {
      setPageIdx(p => p - 1);
      setPanelIdx(0);
      return;
    }
    if (chIdx > 0) {
      setChIdx(c => c - 1);
      setPageIdx(0);
      setPanelIdx(0);
    }
  }, [panelIdx, pageIdx, chIdx]);

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") goNextPanel();
      if (e.key === "ArrowLeft") goPrevPanel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNextPanel, goPrevPanel]);

  // ============================================================
  // LOADING / ERROR STATES
  // ============================================================

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a1a" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: accent }} />
      </div>
    );
  }

  if (error && !demoMode) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4" style={{ background: "#0a0a1a" }}>
        <div>
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl text-white mb-2" style={{ fontFamily: "var(--font-display)" }}>{error}</h1>
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER
  // ============================================================

  const currentDSL = livingPanels[panelIdx];

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: "#0a0a1a" }}>
      <LivingPanelStyles />

      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b z-30"
        style={{
          background: "rgba(10,10,26,0.95)",
          backdropFilter: "blur(10px)",
          borderColor: `${accent}20`,
        }}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={16} style={{ color: accent }} />
          <span
            style={{
              color: accent,
              fontSize: "10px",
              letterSpacing: "0.2em",
              fontFamily: "var(--font-label, monospace)",
              textTransform: "uppercase",
            }}
          >
            Living Panels
          </span>
          {demoMode && (
            <span
              className="px-2 py-0.5 rounded"
              style={{
                background: `${accent}20`,
                color: accent,
                fontSize: "9px",
                fontFamily: "monospace",
              }}
            >
              DEMO
            </span>
          )}
        </div>

        <div className="text-center">
          {chapter && (
            <>
              <p
                className="truncate"
                style={{
                  color: "white",
                  fontSize: "11px",
                  maxWidth: "250px",
                  fontFamily: "var(--font-body, sans-serif)",
                }}
              >
                {chapter.chapter_title}
              </p>
              <p
                style={{
                  color: "rgba(255,255,255,0.4)",
                  fontSize: "9px",
                  fontFamily: "var(--font-label, monospace)",
                }}
              >
                CH.{chIdx + 1}/{chapters.length} · PAGE {pageIdx + 1}/{pages.length} ·
                PANEL {panelIdx + 1}/{totalPanels}
              </p>
            </>
          )}
          {demoMode && (
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px" }}>
              Sample Living Panel — Animated Manga Canvas
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Zap size={14} style={{ color: accent }} />
          <span
            style={{
              color: "rgba(255,255,255,0.5)",
              fontSize: "9px",
              fontFamily: "monospace",
            }}
          >
            DSL v1.0
          </span>
        </div>
      </div>

      {/* Main panel area + navigation */}
      <div className="flex-1 flex items-stretch min-h-0">
        {/* Prev button */}
        <button
          onClick={goPrevPanel}
          disabled={demoMode && panelIdx === 0}
          className="flex items-center px-2 sm:px-4 transition-opacity"
          style={{
            color: "rgba(255,255,255,0.4)",
            opacity: (demoMode && panelIdx === 0) ? 0.2 : 1,
          }}
        >
          <ChevronLeft size={28} />
        </button>

        {/* Panel canvas */}
        <div
          className="flex-1 min-w-0 relative overflow-hidden"
          style={{
            margin: "12px 0",
            border: `1px solid ${accent}20`,
            borderRadius: 8,
          }}
        >
          {loadingPanels ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: accent }} />
            </div>
          ) : currentDSL ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${chIdx}-${pageIdx}-${panelIdx}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0"
              >
                <LivingPanelEngine
                  dsl={currentDSL}
                  autoplay={true}
                  debug={false}
                />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "14px" }}>No panels available</p>
            </div>
          )}
        </div>

        {/* Next button */}
        <button
          onClick={goNextPanel}
          disabled={demoMode && panelIdx >= totalPanels - 1}
          className="flex items-center px-2 sm:px-4 transition-opacity"
          style={{
            color: "rgba(255,255,255,0.4)",
            opacity: (demoMode && panelIdx >= totalPanels - 1) ? 0.2 : 1,
          }}
        >
          <ChevronRight size={28} />
        </button>
      </div>

      {/* Panel dots */}
      <div className="flex items-center justify-center gap-1.5 py-3">
        {livingPanels.map((_, i) => (
          <motion.div
            key={i}
            animate={{ width: i === panelIdx ? 18 : 5, opacity: i === panelIdx ? 1 : 0.3 }}
            className="h-1 rounded-full cursor-pointer"
            style={{ background: accent }}
            onClick={() => setPanelIdx(i)}
          />
        ))}
      </div>

      {/* Bottom info bar */}
      <div
        className="flex items-center justify-between px-4 py-2 border-t"
        style={{
          borderColor: `${accent}15`,
          background: "rgba(10,10,26,0.95)",
        }}
      >
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", fontFamily: "monospace" }}>
          {currentDSL ? `${currentDSL.layers?.length || 0} layers · ${currentDSL.timeline?.length || 0} animations` : ""}
        </span>
        <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "8px", fontFamily: "monospace" }}>
          LIVING MANGA PANELS · DSL ENGINE v1.0
        </span>
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", fontFamily: "monospace" }}>
          {currentDSL?.meta?.content_type || ""}
        </span>
      </div>
    </div>
  );
}
