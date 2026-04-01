"use client";

/**
 * living/page.tsx — Living Manga Reader v2.1
 * ============================================
 * Full-screen manga reading experience.
 * Paper background. Ink borders. User-controlled pacing.
 * Navigate between pages (panels) with arrows.
 * Tap inside a panel to advance its acts.
 *
 * URL: /books/{id}/manga/living?summary={summaryId}
 */

import { useEffect, useState, use, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { getSummary, getAllLivingPanels } from "@/lib/api";
import { LivingPanelEngine, LivingPanelStyles } from "@/components/LivingPanel";
import type { Summary } from "@/lib/types";
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
  const [actInfo, setActInfo] = useState({ current: 0, total: 1 });

  // Living panels
  const [livingPanels, setLivingPanels] = useState<LivingPanelDSL[]>([]);
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
          // Try to load orchestrator-generated living panels
          return getAllLivingPanels(summaryId)
            .then((lpData) => {
              if (lpData.living_panels && lpData.living_panels.length > 0) {
                setLivingPanels(lpData.living_panels as LivingPanelDSL[]);
                if (lpData.source === "fallback") {
                  setDemoMode(false); // fallback but still real data
                }
              } else {
                setDemoMode(true);
                setLivingPanels(SAMPLE_LIVING_PANELS);
              }
            })
            .catch(() => {
              setDemoMode(true);
              setLivingPanels(SAMPLE_LIVING_PANELS);
            });
        }
      })
      .catch(() => {
        setDemoMode(true);
        setLivingPanels(SAMPLE_LIVING_PANELS);
      })
      .finally(() => setLoading(false));
  }, [summaryId]);

  // ============================================================
  // NAVIGATION (between pages/panels)
  // ============================================================

  const totalPanels = livingPanels.length;

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

  const onActChange = useCallback((current: number, total: number) => {
    setActInfo({ current: current + 1, total });
  }, []);

  // ============================================================
  // LOADING / ERROR
  // ============================================================

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0F0E17" }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#F5A623" }} />
      </div>
    );
  }

  if (error && !demoMode) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#0F0E17" }}>
        <div className="text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: "#E8191A" }} />
          <h1 style={{ color: "#F0EEE8", fontSize: "1.2rem", fontFamily: "var(--font-display)" }}>{error}</h1>
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
    <div className="fixed inset-0 flex flex-col" style={{ background: "#0F0E17" }}>
      <LivingPanelStyles />

      {/* ─── HEADER ─── */}
      <header
        className="flex items-center justify-between px-4 z-30"
        style={{
          background: "#17161F",
          borderBottom: "1px solid #2E2C3F",
          height: 40,
          minHeight: 40,
          flexShrink: 0,
        }}
      >
        {/* Left: branding */}
        <div className="flex items-center gap-3" style={{ minWidth: 120 }}>
          <span style={{
            fontFamily: "var(--font-display)",
            fontSize: 13,
            color: "#F5A623",
            letterSpacing: "0.08em",
          }}>
            Living Manga
          </span>
          {demoMode && (
            <span style={{
              fontSize: 8,
              fontFamily: "var(--font-label)",
              color: "#A8A6C060",
              background: "#1F1E28",
              padding: "1px 5px",
              borderRadius: 2,
              border: "1px solid #2E2C3F",
              letterSpacing: "0.1em",
            }}>
              DEMO
            </span>
          )}
        </div>

        {/* Center: narrative beat */}
        <span style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          color: "#A8A6C060",
          flex: 1,
          textAlign: "center" as const,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap" as const,
          padding: "0 12px",
        }}>
          {currentDSL?.meta?.narrative_beat || ""}
        </span>

        {/* Right: page / act counters */}
        <div className="flex items-center gap-3" style={{ minWidth: 120, justifyContent: "flex-end" }}>
          <span style={{ color: "#5E5C78", fontSize: 11, fontFamily: "var(--font-label)" }}>
            {panelIdx + 1}<span style={{ color: "#5E5C7840" }}> / {totalPanels}</span>
          </span>
          {actInfo.total > 1 && (
            <span style={{
              color: "#A8A6C060",
              fontSize: 9,
              fontFamily: "var(--font-label)",
              border: "1px solid #2E2C3F",
              padding: "2px 6px",
              borderRadius: 2,
            }}>
              ACT {actInfo.current}/{actInfo.total}
            </span>
          )}
        </div>
      </header>

      {/* Main area: panel + navigation edges */}
      <div className="flex-1 flex items-stretch min-h-0">

        {/* Left nav edge */}
        <button
          onClick={goPrev}
          disabled={isFirst}
          className="flex items-center justify-center transition-opacity"
          style={{
            width: 48,
            color: "#5E5C78",
            opacity: isFirst ? 0.15 : 0.5,
            cursor: isFirst ? "default" : "pointer",
          }}
          aria-label="Previous page"
        >
          <ChevronLeft size={24} />
        </button>

        {/* Panel canvas */}
        <div className="flex-1 min-w-0 flex items-center justify-center p-2 sm:p-4">
          {currentDSL ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={panelIdx}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="w-full h-full max-w-4xl"
              >
                <LivingPanelEngine
                  dsl={currentDSL}
                  debug={false}
                  onActChange={onActChange}
                />
              </motion.div>
            </AnimatePresence>
          ) : (
            <p style={{ color: "#5E5C78", fontSize: 12, fontFamily: "var(--font-body)" }}>
              No panels available
            </p>
          )}
        </div>

        {/* Right nav edge */}
        <button
          onClick={goNext}
          disabled={isLast}
          className="flex items-center justify-center transition-opacity"
          style={{
            width: 48,
            color: "#5E5C78",
            opacity: isLast ? 0.15 : 0.5,
            cursor: isLast ? "default" : "pointer",
          }}
          aria-label="Next page"
        >
          <ChevronRight size={24} />
        </button>
      </div>

      {/* Page dots */}
      <div className="flex items-center justify-center gap-1 py-2">
        {livingPanels.map((_, i) => (
          <button
            key={i}
            onClick={() => setPanelIdx(i)}
            className="rounded-full transition-all"
            style={{
              width: i === panelIdx ? 16 : 4,
              height: 3,
              background: i === panelIdx ? "#F5A623" : "#2E2C3F",
            }}
            aria-label={`Page ${i + 1}`}
          />
        ))}
      </div>

      {/* Footer */}
      <footer
        className="flex items-center justify-center px-4"
        style={{
          borderTop: "1px solid #2E2C3F",
          background: "#17161F",
          height: 24,
          minHeight: 24,
          flexShrink: 0,
        }}
      >
        <span style={{
          color: "#5E5C7830",
          fontSize: 8,
          fontFamily: "var(--font-label)",
          letterSpacing: "0.15em",
        }}>
          TAP PANEL → NEXT ACT &nbsp;·&nbsp; ← → → NAVIGATE PAGES
        </span>
      </footer>
    </div>
  );
}
