"use client";

/**
 * MangaReader.tsx — Page-Based Manga Experience
 * ===============================================
 * Each manga "page" is a CSS grid with panel cells.
 * Content types: narration, dialogue, splash, data, transition.
 * Images are RARE — most panels are text + mood backgrounds.
 * Character "sprites" are stylized avatars rendered in code.
 *
 * Navigation: arrow keys, swipe, or click.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Menu, X, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { getImageUrl } from "@/lib/api";
import { getStyleAccent } from "@/lib/utils";
import type {
  Summary, MangaChapter, MangaPage, PagePanel, DialogueLine,
} from "@/lib/types";

// ──────────────────────────────────────────────────────────
// LAYOUT → CSS GRID MAPPING
// ──────────────────────────────────────────────────────────

const LAYOUT_GRIDS: Record<string, React.CSSProperties> = {
  "full":    { gridTemplate: `"main" 1fr / 1fr` },
  "2-row":   { gridTemplate: `"top" 1fr "bottom" 1fr / 1fr` },
  "3-row":   { gridTemplate: `"top" 1fr "middle" 1fr "bottom" 1fr / 1fr` },
  "2-col":   { gridTemplate: `"left right" 1fr / 1fr 1fr` },
  "L-shape": { gridTemplate: `"main side-top" 1fr "main side-bottom" 1fr / 2fr 1fr` },
  "T-shape": { gridTemplate: `"top top" 1fr "bottom-left bottom-right" 1fr / 1fr 1fr` },
  "grid-4":  { gridTemplate: `"tl tr" 1fr "bl br" 1fr / 1fr 1fr` },
};

// ──────────────────────────────────────────────────────────
// VISUAL MOOD → GRADIENT MAPPING
// ──────────────────────────────────────────────────────────

const MOOD_GRADIENTS: Record<string, string> = {
  "dramatic-dark":  "linear-gradient(160deg, #0a0a1a 0%, #1a1025 50%, #0d0d1e 100%)",
  "warm-amber":     "linear-gradient(160deg, #1a1408 0%, #2a1c0a 50%, #1a1205 100%)",
  "cool-mystery":   "linear-gradient(160deg, #081018 0%, #0a1520 50%, #060e18 100%)",
  "intense-red":    "linear-gradient(160deg, #1a0808 0%, #250a0a 50%, #1a0505 100%)",
  "calm-green":     "linear-gradient(160deg, #081a10 0%, #0a2015 50%, #051a0c 100%)",
  "ethereal-purple": "linear-gradient(160deg, #120820 0%, #1a0a28 50%, #100618 100%)",
};

const MOOD_ACCENT: Record<string, string> = {
  "dramatic-dark":  "#8080ff",
  "warm-amber":     "#f5a623",
  "cool-mystery":   "#00bfa5",
  "intense-red":    "#e8191a",
  "calm-green":     "#4caf50",
  "ethereal-purple": "#bb86fc",
};

// ──────────────────────────────────────────────────────────
// CHARACTER SPRITE (code-rendered avatar, no AI image)
// ──────────────────────────────────────────────────────────

const EXPRESSION_EMOJI: Record<string, string> = {
  neutral: "😐", curious: "🤔", shocked: "😲", determined: "😤",
  wise: "🧘", thoughtful: "💭", excited: "✨", sad: "😔", angry: "😠",
};

const CHAR_COLORS: string[] = [
  "#00bfa5", "#f5a623", "#e8191a", "#bb86fc", "#3d7bff", "#ff6b6b",
];

function CharacterSprite({ name, expression, size = 48 }: { name: string; expression: string; size?: number }) {
  // Deterministic color from name
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const color = CHAR_COLORS[hash % CHAR_COLORS.length];
  const initial = name.charAt(0).toUpperCase();
  const emoji = EXPRESSION_EMOJI[expression] || "";

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative flex items-center justify-center rounded-full border-2 font-display"
        style={{
          width: size, height: size,
          background: `${color}18`,
          borderColor: `${color}80`,
          color: color,
          fontSize: size * 0.4,
        }}
      >
        {initial}
        {emoji && (
          <span className="absolute -top-1 -right-1 text-xs">{emoji}</span>
        )}
      </div>
      <span className="font-label" style={{ fontSize: "8px", color: "var(--text-3)", letterSpacing: "0.1em" }}>
        {name.toUpperCase()}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// PANEL CONTENT RENDERERS
// ──────────────────────────────────────────────────────────

function NarrationContent({ panel, accent }: { panel: PagePanel; accent: string }) {
  const moodAccent = MOOD_ACCENT[panel.visual_mood] || accent;
  return (
    <div className="w-full h-full flex items-center justify-center p-5 relative"
      style={{ background: MOOD_GRADIENTS[panel.visual_mood] || MOOD_GRADIENTS["dramatic-dark"] }}>
      {/* Subtle halftone */}
      <div className="absolute inset-0 opacity-10"
        style={{ backgroundImage: `radial-gradient(circle, ${moodAccent}40 1px, transparent 1px)`, backgroundSize: "16px 16px" }} />
      <div className="relative z-10 max-w-md">
        <div className="bubble bubble--narrator w-full text-left" style={{ borderColor: `${moodAccent}60`, color: moodAccent }}>
          {panel.text}
        </div>
      </div>
    </div>
  );
}

function DialogueContent({ panel, accent }: { panel: PagePanel; accent: string }) {
  const lines = panel.dialogue || [];
  const charName = panel.character || lines[0]?.character || "?";
  const expr = panel.expression || "neutral";

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4"
      style={{ background: MOOD_GRADIENTS[panel.visual_mood] || "var(--surface)" }}>
      <CharacterSprite name={charName} expression={expr} size={44} />
      <div className="flex flex-col gap-2 w-full max-w-xs">
        {lines.map((line: DialogueLine, i: number) => (
          <motion.div key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.1 }}
          >
            <div className="bubble bubble--speech text-sm w-full">
              {line.text}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function SplashContent({ panel, accent }: { panel: PagePanel; accent: string }) {
  const imgUrl = panel.image_id ? getImageUrl(panel.image_id) : null;

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden"
      style={{ background: MOOD_GRADIENTS[panel.visual_mood] || MOOD_GRADIENTS["dramatic-dark"] }}>
      {/* Speed lines bg */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice">
        {Array.from({ length: 36 }, (_, i) => {
          const a = (i / 36) * 360 * Math.PI / 180;
          return <line key={i} x1={300} y1={400} x2={300 + Math.cos(a) * 700} y2={400 + Math.sin(a) * 700}
            stroke={accent} strokeWidth={0.4 + (i % 3) * 0.4} opacity={0.06} />;
        })}
      </svg>

      {/* Image if generated */}
      {imgUrl ? (
        <img src={imgUrl} alt={panel.text || "splash"} className="absolute inset-0 w-full h-full object-cover opacity-60" />
      ) : (
        /* Halftone pattern when no image */
        <div className="absolute inset-0 opacity-20"
          style={{ backgroundImage: `radial-gradient(circle, ${accent}40 1px, transparent 1px)`, backgroundSize: "18px 18px" }} />
      )}

      {/* Text overlay */}
      {panel.text && (
        <motion.div
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 20 }}
          className="relative z-10 text-center px-6 max-w-lg"
        >
          <h2 className="font-display leading-none"
            style={{
              fontSize: "clamp(2rem, 8vw, 4.5rem)",
              color: "var(--text-1)",
              textShadow: `3px 3px 0 ${accent}60, 0 0 40px rgba(0,0,0,0.8)`,
              lineHeight: 1.05,
            }}>
            {panel.text}
          </h2>
        </motion.div>
      )}
    </div>
  );
}

function DataContent({ panel, accent }: { panel: PagePanel; accent: string }) {
  const moodAccent = MOOD_ACCENT[panel.visual_mood] || accent;
  const items = panel.text?.split("|").map(s => s.trim()).filter(Boolean) || [];

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-5"
      style={{ background: MOOD_GRADIENTS[panel.visual_mood] || "var(--surface)" }}>
      {items.length > 1 ? (
        items.map((item, i) => (
          <motion.div key={i}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.08 }}
            className="flex items-center gap-3 px-4 py-2 border w-full max-w-sm"
            style={{ borderColor: `${moodAccent}30`, background: `${moodAccent}08` }}
          >
            <span className="font-display text-lg" style={{ color: moodAccent }}>{i + 1}</span>
            <span className="font-body text-sm" style={{ color: "var(--text-2)" }}>{item}</span>
          </motion.div>
        ))
      ) : (
        <motion.p
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="font-display text-center text-2xl leading-tight px-4"
          style={{ color: moodAccent }}
        >
          {panel.text}
        </motion.p>
      )}
    </div>
  );
}

function TransitionContent({ panel, accent }: { panel: PagePanel; accent: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center"
      style={{ background: "var(--bg)" }}>
      <div className="flex items-center gap-4">
        <div className="h-px w-16" style={{ background: `linear-gradient(90deg, transparent, ${accent})` }} />
        {panel.text && (
          <span className="font-label" style={{ color: "var(--text-3)", fontSize: "9px", letterSpacing: "0.2em" }}>
            {panel.text.toUpperCase()}
          </span>
        )}
        <div className="h-px w-16" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// PANEL CELL DISPATCHER
// ──────────────────────────────────────────────────────────

function PanelCell({ panel, accent }: { panel: PagePanel; accent: string }) {
  const content = (() => {
    switch (panel.content_type) {
      case "narration":  return <NarrationContent panel={panel} accent={accent} />;
      case "dialogue":   return <DialogueContent panel={panel} accent={accent} />;
      case "splash":     return <SplashContent panel={panel} accent={accent} />;
      case "data":       return <DataContent panel={panel} accent={accent} />;
      case "transition": return <TransitionContent panel={panel} accent={accent} />;
      default:           return <NarrationContent panel={panel} accent={accent} />;
    }
  })();

  return (
    <div className="relative overflow-hidden border" style={{ borderColor: "var(--border)", gridArea: panel.position }}>
      {content}
      {/* Panel type label */}
      <span className="absolute top-0 right-0 font-label px-1.5 py-0.5 capitalize"
        style={{ fontSize: "7px", color: "var(--text-3)", background: "var(--surface-2)", borderLeft: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        {panel.content_type}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// MANGA PAGE (CSS grid of panels)
// ──────────────────────────────────────────────────────────

function MangaPageView({ page, accent }: { page: MangaPage; accent: string }) {
  const gridStyle = LAYOUT_GRIDS[page.layout] || LAYOUT_GRIDS["full"];

  return (
    <div className="w-full h-full" style={{ display: "grid", gap: "2px", ...gridStyle }}>
      {page.panels.map((panel, i) => (
        <PanelCell key={`${panel.position}-${i}`} panel={panel} accent={accent} />
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// CHAPTER SIDEBAR
// ──────────────────────────────────────────────────────────

function ChapterSidebar({ chapters, current, onSelect, onClose, accent }: {
  chapters: MangaChapter[]; current: number; onSelect: (i: number) => void; onClose: () => void; accent: string;
}) {
  return (
    <motion.div initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
      transition={{ type: "spring", stiffness: 280, damping: 30 }}
      className="fixed left-0 top-0 bottom-0 z-50 flex flex-col border-r"
      style={{ background: "var(--bg)", borderColor: "var(--border)", width: "270px" }}>
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "var(--border)" }}>
        <span className="font-label" style={{ color: accent, fontSize: "10px", letterSpacing: "0.2em" }}>CHAPTERS</span>
        <button onClick={onClose} style={{ color: "var(--text-3)" }}><X size={16} /></button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {chapters.map((ch, i) => {
          const pageCount = ch.pages?.length || ch.panels?.length || 0;
          return (
            <button key={i} onClick={() => { onSelect(i); onClose(); }}
              className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors"
              style={{
                background: current === i ? `${accent}0f` : "transparent",
                borderLeft: `3px solid ${current === i ? accent : "transparent"}`,
              }}>
              <span className="font-label w-5 text-right flex-shrink-0" style={{ color: "var(--text-3)", fontSize: "9px" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="truncate text-sm" style={{ maxWidth: "180px", color: current === i ? accent : "var(--text-2)", fontFamily: "var(--font-body)" }}>
                  {ch.chapter_title}
                </p>
                <p className="font-label" style={{ fontSize: "8px", color: "var(--text-3)" }}>{pageCount} pages</p>
              </div>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────
// MAIN READER
// ──────────────────────────────────────────────────────────

export function MangaReader({ summary }: { summary: Summary }) {
  const [chIdx, setChIdx]     = useState(0);
  const [pageIdx, setPageIdx] = useState(0);
  const [sidebar, setSidebar] = useState(false);

  const chapters = summary.manga_chapters;
  const chapter  = chapters[chIdx];
  const accent   = getStyleAccent(summary.style);

  // Use pages if available, fall back to legacy
  // Issue 5.1: Legacy panels get mood inferred from panel type (not all "dramatic-dark")
  const pages: MangaPage[] = chapter?.pages?.length
    ? chapter.pages
    : (chapter?.panels || []).map((p, i) => {
        // Map legacy panel_type to a reasonable visual_mood
        const legacyMoodMap: Record<string, string> = {
          dialogue: "warm-amber",
          action: "dramatic-dark",
          title: "dramatic-dark",
          recap: "cool-mystery",
          montage: "warm-amber",
          narration: "cool-mystery",
          data: "cool-mystery",
          transition: "soft-melancholy",
        };
        const mood = legacyMoodMap[p.panel_type] || "dramatic-dark";

        return {
          page_index: i,
          layout: "full" as const,
          panels: [{
            position: "main",
            content_type: p.panel_type === "dialogue" ? "dialogue" as const : "narration" as const,
            text: p.caption || p.visual_description,
            dialogue: p.dialogue || [],
            visual_mood: mood as any,
            character: null,
            expression: "neutral" as const,
            image_id: p.image_id,
            image_prompt: null,
          }],
        };
      });

  const page = pages[pageIdx];

  const goNext = useCallback(() => {
    if (pageIdx < pages.length - 1) { setPageIdx(p => p + 1); return; }
    if (chIdx < chapters.length - 1) { setChIdx(c => c + 1); setPageIdx(0); }
  }, [pageIdx, pages.length, chIdx, chapters.length]);

  const goPrev = useCallback(() => {
    if (pageIdx > 0) { setPageIdx(p => p - 1); return; }
    if (chIdx > 0) {
      const prevPages = chapters[chIdx - 1]?.pages?.length || chapters[chIdx - 1]?.panels?.length || 1;
      setChIdx(c => c - 1);
      setPageIdx(prevPages - 1);
    }
  }, [pageIdx, chIdx, chapters]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft")  goPrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev]);

  if (!chapter || !page) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
      <p style={{ color: "var(--text-3)" }}>No pages found</p>
    </div>
  );

  const isFirst = chIdx === 0 && pageIdx === 0;
  const isLast  = chIdx === chapters.length - 1 && pageIdx === pages.length - 1;

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: "var(--bg)" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b z-30"
        style={{ background: "rgba(15,14,23,0.9)", backdropFilter: "blur(10px)", borderColor: "var(--border)" }}>
        <button onClick={() => setSidebar(true)} className="flex items-center gap-2" style={{ color: "var(--text-3)" }}>
          <Menu size={16} />
          <span className="font-label hidden sm:block" style={{ fontSize: "9px" }}>CHAPTERS</span>
        </button>
        <div className="text-center">
          <p className="font-label truncate" style={{ color: "var(--text-1)", fontSize: "10px", maxWidth: "200px" }}>
            {chapter.chapter_title}
          </p>
          <p className="font-label" style={{ color: "var(--text-3)", fontSize: "8px" }}>
            CH.{chIdx + 1}/{chapters.length} · PAGE {pageIdx + 1}/{pages.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/books/${summary.book_id || ''}/manga/living?summary=${summary.id || ''}`}
            className="flex items-center gap-1 font-label px-2 py-0.5 border uppercase transition-colors"
            style={{ color: '#ffc220', borderColor: '#ffc22040', background: '#ffc22010', fontSize: '9px', textDecoration: 'none' }}
            title="View Living Panels (animated)"
          >
            <Sparkles size={10} />
            LIVING
          </a>
          <span className="font-label px-2 py-0.5 border uppercase"
            style={{ color: accent, borderColor: `${accent}40`, background: `${accent}10`, fontSize: "9px" }}>
            {page.layout}
          </span>
        </div>
      </div>

      {/* Main page + nav */}
      <div className="flex-1 flex items-stretch min-h-0">
        {/* Prev */}
        <button onClick={goPrev} disabled={isFirst}
          className="flex items-center px-2 sm:px-4 transition-opacity"
          style={{ color: "var(--text-3)", opacity: isFirst ? 0.2 : 1 }}>
          <ChevronLeft size={28} />
        </button>

        {/* Page */}
        <div className="flex-1 min-w-0 relative overflow-hidden border"
          style={{ borderColor: `${accent}25`, margin: "8px 0" }}>
          <AnimatePresence mode="wait">
            <motion.div key={`${chIdx}-${pageIdx}`}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.08}
              onDragEnd={(_, info) => {
                if (info.offset.x < -60) goNext();
                else if (info.offset.x > 60) goPrev();
              }}
            >
              <MangaPageView page={page} accent={accent} />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Next */}
        <button onClick={goNext} disabled={isLast}
          className="flex items-center px-2 sm:px-4 transition-opacity"
          style={{ color: "var(--text-3)", opacity: isLast ? 0.2 : 1 }}>
          <ChevronRight size={28} />
        </button>
      </div>

      {/* Page dots */}
      <div className="flex items-center justify-center gap-1.5 py-2">
        {pages.map((_, i) => (
          <motion.div key={i}
            animate={{ width: i === pageIdx ? 18 : 5, opacity: i === pageIdx ? 1 : 0.25 }}
            className="h-1 rounded-full cursor-pointer"
            style={{ background: accent }}
            onClick={() => setPageIdx(i)}
          />
        ))}
      </div>

      {/* Chapter sidebar */}
      <AnimatePresence>
        {sidebar && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.6)" }}
              onClick={() => setSidebar(false)} />
            <ChapterSidebar chapters={chapters} current={chIdx}
              onSelect={i => { setChIdx(i); setPageIdx(0); }}
              onClose={() => setSidebar(false)} accent={accent} />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
