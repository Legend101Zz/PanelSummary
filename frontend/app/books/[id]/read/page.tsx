"use client";

/**
 * PDF Reader — Dark Mode, Lazy Loading
 * ======================================
 * Renders PDF pages one at a time via the backend's
 * /books/{id}/pdf/page/{n} endpoint (PyMuPDF → PNG).
 *
 * Pages are cached server-side after first render.
 * Only the current page + ±2 neighbours are fetched.
 *
 * Features:
 * - Dark mode (CSS invert + hue-rotate on the img)
 * - Jump to page input
 * - Share a specific page via URL ?page=N
 * - Keyboard: ← → to navigate
 */

import { use, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronLeft, ChevronRight, Moon, Sun, BookOpen,
  Share2, Loader2, AlertCircle, ArrowLeft
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface PdfInfo { title: string; total_pages: number; book_id: string }

function pageUrl(bookId: string, page: number) {
  return `${API_URL}/books/${bookId}/pdf/page/${page}`;
}

// Preload an image into browser cache
function preload(url: string) {
  const img = new window.Image();
  img.src = url;
}

import { Suspense } from "react";

function ReadPageInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();

  const [info, setInfo]       = useState<PdfInfo | null>(null);
  const [page, setPage]       = useState(parseInt(searchParams.get("page") ?? "1", 10));
  const [dark, setDark]       = useState(true);
  const [loading, setLoading] = useState(true);
  const [imgErr, setImgErr]   = useState(false);
  const [jumpVal, setJumpVal] = useState("");
  const [showJump, setShowJump] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Load PDF info once
  useEffect(() => {
    fetch(`${API_URL}/books/${id}/pdf/info`)
      .then(r => r.json())
      .then(d => { setInfo(d); })
      .catch(() => setInfo(null));
  }, [id]);

  // Update URL param without full navigation
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("page", String(page));
    window.history.replaceState({}, "", url.toString());
  }, [page]);

  // Preload neighbours
  useEffect(() => {
    if (!info) return;
    if (page + 1 <= info.total_pages) preload(pageUrl(id, page + 1));
    if (page + 2 <= info.total_pages) preload(pageUrl(id, page + 2));
    if (page - 1 >= 1) preload(pageUrl(id, page - 1));
  }, [page, id, info]);

  const goTo = useCallback((n: number) => {
    if (!info) return;
    const clamped = Math.max(1, Math.min(n, info.total_pages));
    setPage(clamped);
    setLoading(true);
    setImgErr(false);
  }, [info]);

  // Keyboard navigation
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goTo(page + 1);
      if (e.key === "ArrowLeft")  goTo(page - 1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [page, goTo]);

  const handleShare = () => {
    const url = `${window.location.origin}/books/${id}/read?page=${page}`;
    if (navigator.share) {
      navigator.share({ title: `${info?.title} — p.${page}`, url });
    } else {
      navigator.clipboard.writeText(url);
      alert("Page link copied!");
    }
  };

  if (!info) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
      <Loader2 size={24} className="animate-spin" style={{ color: "var(--amber)" }} />
    </div>
  );

  const imgSrc = pageUrl(id, page);

  return (
    <div className="fixed inset-0 flex flex-col select-none"
      style={{ background: dark ? "#0a0a0a" : "#f5f0e8" }}>

      {/* ── TOP BAR ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b z-10"
        style={{
          background: dark ? "rgba(10,10,10,0.95)" : "rgba(245,240,232,0.95)",
          borderColor: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)",
          backdropFilter: "blur(10px)",
        }}>
        {/* Left */}
        <div className="flex items-center gap-3">
          <Link href={`/books/${id}`}>
            <button className="flex items-center gap-1.5 font-label"
              style={{ color: dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)", fontSize: "10px" }}>
              <ArrowLeft size={14} /> BACK
            </button>
          </Link>
          <div className="h-4 w-px" style={{ background: dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }} />
          <p className="font-label truncate max-w-[180px]"
            style={{ color: dark ? "var(--text-2)" : "#333", fontSize: "11px" }}>
            {info.title}
          </p>
        </div>

        {/* Center — page indicator / jump */}
        <div className="flex items-center gap-2">
          {showJump ? (
            <form onSubmit={e => { e.preventDefault(); goTo(parseInt(jumpVal)||page); setShowJump(false); }}
              className="flex items-center gap-1">
              <input autoFocus value={jumpVal} onChange={e => setJumpVal(e.target.value)}
                className="w-16 px-2 py-1 text-center font-label border outline-none"
                style={{ background: dark ? "#1a1a1a" : "#fff", color: dark ? "#fff" : "#000",
                  borderColor: "var(--amber)", fontSize: "11px" }} />
              <span className="font-label" style={{ color: dark ? "var(--text-3)" : "#888", fontSize: "10px" }}>
                / {info.total_pages}
              </span>
              <button type="submit" className="font-label px-2 py-1"
                style={{ background: "var(--amber)", color: "#000", fontSize: "10px" }}>
                GO
              </button>
            </form>
          ) : (
            <button onClick={() => { setShowJump(true); setJumpVal(String(page)); }}
              className="font-label px-3 py-1 border"
              style={{ color: dark ? "var(--text-2)" : "#333", borderColor: dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.15)", fontSize: "11px" }}>
              {page} / {info.total_pages}
            </button>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-3">
          <button onClick={handleShare} style={{ color: dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)" }}>
            <Share2 size={16} />
          </button>
          <button onClick={() => setDark(d => !d)} style={{ color: dark ? "var(--amber)" : "#666" }}>
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>

      {/* ── PAGE DISPLAY ── */}
      <div className="flex-1 flex items-stretch min-h-0 relative">
        {/* Prev button */}
        <button onClick={() => goTo(page - 1)} disabled={page <= 1}
          className="flex items-center justify-center px-3 transition-opacity z-10"
          style={{ color: dark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)", opacity: page <= 1 ? 0.2 : 1 }}>
          <ChevronLeft size={32} />
        </button>

        {/* Page image */}
        <div className="flex-1 flex items-center justify-center overflow-hidden p-2 relative">
          <AnimatePresence mode="wait">
            <motion.div key={page}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="h-full flex items-center justify-center"
            >
              {!imgErr ? (
                <img
                  ref={imgRef}
                  src={imgSrc}
                  alt={`Page ${page}`}
                  onLoad={() => setLoading(false)}
                  onError={() => { setLoading(false); setImgErr(true); }}
                  className="max-h-full max-w-full object-contain shadow-2xl"
                  style={{
                    // Dark mode: invert + hue-rotate to get warm dark appearance
                    filter: dark ? "invert(1) hue-rotate(180deg) brightness(0.9) contrast(1.05)" : "none",
                    transition: "filter 0.3s ease",
                    opacity: loading ? 0 : 1,
                    borderRadius: "1px",
                  }}
                  draggable={false}
                />
              ) : (
                <div className="flex flex-col items-center gap-3" style={{ color: dark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)" }}>
                  <AlertCircle size={32} />
                  <p className="font-label" style={{ fontSize: "11px" }}>PAGE NOT AVAILABLE</p>
                </div>
              )}
              {loading && !imgErr && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 size={24} className="animate-spin" style={{ color: "var(--amber)" }} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Next button */}
        <button onClick={() => goTo(page + 1)} disabled={page >= info.total_pages}
          className="flex items-center justify-center px-3 transition-opacity z-10"
          style={{ color: dark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)", opacity: page >= info.total_pages ? 0.2 : 1 }}>
          <ChevronRight size={32} />
        </button>
      </div>

      {/* ── BOTTOM SCRUBBER ── */}
      <div className="px-6 pb-4 pt-2 flex items-center gap-3"
        style={{ borderTop: `1px solid ${dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)"}` }}>
        <span className="font-label" style={{ color: dark ? "var(--text-3)" : "#888", fontSize: "9px", width: "24px" }}>1</span>
        <input type="range" min={1} max={info.total_pages} value={page}
          onChange={e => goTo(parseInt(e.target.value))}
          className="flex-1 h-1"
          style={{ accentColor: "var(--amber)", cursor: "pointer" }} />
        <span className="font-label" style={{ color: dark ? "var(--text-3)" : "#888", fontSize: "9px", width: "28px", textAlign: "right" }}>
          {info.total_pages}
        </span>
      </div>

      {/* Keyboard hint */}
      <div className="absolute bottom-14 right-4">
        <p className="font-label" style={{ color: dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)", fontSize: "8px" }}>
          ← → arrow keys
        </p>
      </div>
    </div>
  );
}

export default function ReadPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--amber)" }} />
      </div>
    }>
      <ReadPageInner params={params} />
    </Suspense>
  );
}
