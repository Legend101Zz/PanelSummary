"use client";

/**
 * living/page.tsx — Living Manga Panel Viewer v2.0
 * ==================================================
 * Full-screen immersive viewer for act-based Living Panels.
 * Navigates between panels (pages) and lets acts auto-play.
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
import { SAMPLE_LIVING_PANELS } from "@/lib/sample-living-book";

export default function LivingMangaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const summaryId = searchParams.get("summary");

  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Navigation
  const [panelIdx, setPanelIdx] = useState(0);

  // Living panels (from API or sample)
  const [livingPanels, setLivingPanels] = useState<LivingPanelDSL[]>([]);
  const [loadingPanels, setLoadingPanels] = useState(false);
  const [demoMode, setDemoMode] = useState(!summaryId);

  // ============================================================
  // LOAD
  // ============================================================

  useEffect(() => {
    if (!summaryId) {
      setDemoMode(true);
      setLivingPanels(SAMPLE_LIVING_PANELS);
      setLoading(false);
      return;
    }

    getSummary(summaryId)
      .then((data) => {
        if (data.status !== "complete") {
          setError("Summary not yet complete");
        } else {
          setSummary(data);
          // Try loading living panels from API, fallback to sample
          return getLivingPanels(summaryId, 0, 0)
            .then((lpData) => {
              setLivingPanels(lpData.living_panels as LivingPanelDSL[]);
            })
            .catch(() => {
              console.warn("No living panels from API, using sample data");
              setDemoMode(true);
              setLivingPanels(SAMPLE_LIVING_PANELS);
            });
        }
      })
      .catch(() => {
        // Can't load summary — use demo mode
        setDemoMode(true);
        setLivingPanels(SAMPLE_LIVING_PANELS);
      })
      .finally(() => setLoading(false));
  }, [summaryId]);

  // ============================================================
  // NAVIGATION
  // ============================================================

  const totalPanels = livingPanels.length;
  const accent = summary ? getStyleAccent(summary.style) : "#00f5ff";

  const goNext = useCallback(() => {
    if (panelIdx < totalPanels - 1) setPanelIdx(p => p + 1);
  }, [panelIdx, totalPanels]);

  const goPrev = useCallback(() => {
    if (panelIdx > 0) setPanelIdx(p => p - 1);
  }, [panelIdx]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev]);

  // ============================================================
  // LOADING / ERROR
  // ============================================================

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#000" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: accent }} />
      </div>
    );
  }

  if (error && !demoMode) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4" style={{ background: "#000" }}>
        <div>
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl text-white mb-2">{error}</h1>
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER
  // ============================================================

  const currentDSL = livingPanels[panelIdx];
  const isFirst = panelIdx === 0;
  const isLast = panelIdx >= totalPanels - 1;

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: "#000" }}>
      <LivingPanelStyles />

      {/* Minimal top bar */}
      <div
        className="flex items-center justify-between px-4 py-2 z-30"
        style={{ background: "rgba(0,0,0,0.8)", borderBottom: "1px solid #ffffff08" }}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={14} style={{ color: accent }} />
          <span style={{ color: accent, fontSize: "9px", letterSpacing: "0.2em", fontFamily: "monospace", textTransform: "uppercase" as const }}>
            Living Panels
          </span>
          {demoMode && (
            <span style={{ background: `${accent}15`, color: accent, fontSize: "8px", fontFamily: "monospace", padding: "2px 6px", borderRadius: 3 }}>
              DEMO · Atomic Habits
            </span>
          )}
        </div>

        <div className="text-center">
          <p style={{ color: "#fff8", fontSize: "10px", fontFamily: "monospace" }}>
            {currentDSL?.meta?.narrative_beat || ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span style={{ color: "#fff3", fontSize: "9px", fontFamily: "monospace" }}>
            {panelIdx + 1}/{totalPanels}
          </span>
          <Zap size={12} style={{ color: accent }} />
          <span style={{ color: "#fff3", fontSize: "8px", fontFamily: "monospace" }}>v2.0</span>
        </div>
      </div>

      {/* Main panel + nav */}
      <div className="flex-1 flex items-stretch min-h-0">
        {/* Prev */}
        <button
          onClick={goPrev} disabled={isFirst}
          className="flex items-center px-3 sm:px-5 transition-opacity"
          style={{ color: "#fff4", opacity: isFirst ? 0.15 : 1 }}
        >
          <ChevronLeft size={28} />
        </button>

        {/* Canvas */}
        <div className="flex-1 min-w-0 relative overflow-hidden" style={{ margin: "8px 0" }}>
          {loadingPanels ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: accent }} />
            </div>
          ) : currentDSL ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={panelIdx}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.03 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
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
              <p style={{ color: "#fff3", fontSize: "14px" }}>No panels</p>
            </div>
          )}
        </div>

        {/* Next */}
        <button
          onClick={goNext} disabled={isLast}
          className="flex items-center px-3 sm:px-5 transition-opacity"
          style={{ color: "#fff4", opacity: isLast ? 0.15 : 1 }}
        >
          <ChevronRight size={28} />
        </button>
      </div>

      {/* Panel dots */}
      <div className="flex items-center justify-center gap-1.5 py-2">
        {livingPanels.map((p, i) => (
          <motion.div
            key={i}
            animate={{ width: i === panelIdx ? 20 : 5, opacity: i === panelIdx ? 1 : 0.25 }}
            className="h-1 rounded-full cursor-pointer"
            style={{ background: accent }}
            onClick={() => setPanelIdx(i)}
          />
        ))}
      </div>

      {/* Bottom info */}
      <div className="flex items-center justify-between px-4 py-1.5" style={{ borderTop: "1px solid #ffffff08", background: "rgba(0,0,0,0.8)" }}>
        <span style={{ color: "#fff2", fontSize: "8px", fontFamily: "monospace" }}>
          {currentDSL ? `${currentDSL.acts?.length || 0} acts · ${currentDSL.meta?.content_type || ""}` : ""}
        </span>
        <span style={{ color: "#fff15", fontSize: "7px", fontFamily: "monospace", letterSpacing: "0.15em" }}>
          LIVING MANGA · DSL ENGINE v2.0
        </span>
        <span style={{ color: "#fff2", fontSize: "8px", fontFamily: "monospace" }}>
          {currentDSL?.meta?.panel_id || ""}
        </span>
      </div>
    </div>
  );
}
