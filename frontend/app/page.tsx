"use client";

/**
 * HOMEPAGE — "THE MANGA CHAPTER"
 * ================================
 * The page IS a manga chapter. Every scroll section = a panel sequence.
 * Users discover features by "reading" — not browsing.
 *
 * STRUCTURE:
 *  ① SPLASH PANEL  — title page, character intro, CTA
 *  ② MISSION PANEL — what this product does (upload → parse)
 *  ③ POWER PANEL   — the AI transformation
 *  ④ BATTLE PANEL  — dual-swipe reels (the killer feature)
 *  ⑤ LIBRARY       — existing books if any
 *  ⑥ FINAL PAGE    — CTA + dialogue closer
 *
 * INTERACTIONS:
 *  - Section progress tracker on the right edge
 *  - Scroll → panels animate in with manga reveal
 *  - Hover on feature cards → speech bubble pops
 *  - Character mascot (Sensei Bot) appears in each section
 */

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform, AnimatePresence } from "motion/react";
import { Upload, Film, Zap, BookOpen, ArrowRight, ChevronDown } from "lucide-react";
import { listBooks, getImageUrl, checkHealth } from "@/lib/api";
import type { BookListItem } from "@/lib/types";

// ─── MASCOT SVG — "SENSEI BOT" ─────────────────────────────
// Simple inline SVG character: a round robot with a book
function SenseiBot({ size = 80, expression = "neutral" }: { size?: number; expression?: "neutral" | "excited" | "thinking" }) {
  const eyeY = expression === "thinking" ? 28 : 30;
  const mouthPath = expression === "excited"
    ? "M 30 44 Q 40 52 50 44"
    : expression === "thinking"
    ? "M 32 44 Q 40 46 48 44"
    : "M 32 42 Q 40 46 48 42";

  return (
    <svg width={size} height={size} viewBox="0 0 80 90" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Body */}
      <rect x="15" y="50" width="50" height="34" rx="4" fill="#17161F" stroke="#2E2C3F" strokeWidth="2"/>
      {/* Chest screen */}
      <rect x="24" y="58" width="32" height="18" rx="2" fill="#0F0E17" stroke="#F5A623" strokeWidth="1.5"/>
      <rect x="27" y="61" width="10" height="3" rx="1" fill="#F5A623" opacity="0.6"/>
      <rect x="27" y="67" width="18" height="2" rx="1" fill="#3D7BFF" opacity="0.5"/>
      <rect x="27" y="71" width="12" height="2" rx="1" fill="#3D7BFF" opacity="0.3"/>
      {/* Neck */}
      <rect x="34" y="45" width="12" height="7" rx="2" fill="#17161F" stroke="#2E2C3F" strokeWidth="2"/>
      {/* Head */}
      <rect x="12" y="12" width="56" height="36" rx="8" fill="#1F1E28" stroke="#2E2C3F" strokeWidth="2"/>
      {/* Eyes */}
      <rect x="22" y={eyeY} width="12" height="8" rx="2" fill="#F5A623"/>
      <rect x="46" y={eyeY} width="12" height="8" rx="2" fill="#F5A623"/>
      {/* Eye inner */}
      <rect x="26" y={eyeY+2} width="4" height="4" rx="1" fill="#0F0E17"/>
      <rect x="50" y={eyeY+2} width="4" height="4" rx="1" fill="#0F0E17"/>
      {/* Mouth */}
      <path d={mouthPath} stroke="#F5A623" strokeWidth="2" strokeLinecap="round" fill="none"/>
      {/* Antenna */}
      <line x1="40" y1="12" x2="40" y2="4" stroke="#2E2C3F" strokeWidth="2"/>
      <circle cx="40" cy="3" r="3" fill="#E8191A"/>
      {/* Arms */}
      <rect x="3" y="54" width="12" height="22" rx="4" fill="#17161F" stroke="#2E2C3F" strokeWidth="2"/>
      <rect x="65" y="54" width="12" height="22" rx="4" fill="#17161F" stroke="#2E2C3F" strokeWidth="2"/>
      {/* Book in left hand */}
      <rect x="1" y="72" width="16" height="12" rx="1" fill="#E8191A" stroke="#B31213" strokeWidth="1"/>
      <line x1="9" y1="72" x2="9" y2="84" stroke="#B31213" strokeWidth="1"/>
    </svg>
  );
}

// ─── INLINE SVG SPEED LINES ─────────────────────────────────
function SpeedBurst({ color = "#F5A623", opacity = 0.06 }: { color?: string; opacity?: number }) {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice">
      {Array.from({ length: 40 }, (_, i) => {
        const angle = (i / 40) * 360;
        const rad = (angle * Math.PI) / 180;
        const len = 500 + (i % 5) * 60;
        const x2 = 300 + Math.cos(rad) * len;
        const y2 = 200 + Math.sin(rad) * len;
        return (
          <line key={i} x1={300} y1={200} x2={x2} y2={y2}
            stroke={color} strokeWidth={0.5 + (i % 3) * 0.5} opacity={opacity + (i % 4) * 0.01} />
        );
      })}
    </svg>
  );
}

// ─── SCROLL PROGRESS TRACKER ────────────────────────────────
function SectionTracker({ active, total }: { active: number; total: number }) {
  return (
    <div className="fixed right-5 top-1/2 -translate-y-1/2 z-30 hidden lg:flex flex-col gap-2.5">
      {Array.from({ length: total }, (_, i) => (
        <motion.div
          key={i}
          animate={{
            height: i === active ? 28 : 6,
            background: i === active ? "var(--amber)" : i < active ? "var(--border-2)" : "var(--border)",
            opacity: i === active ? 1 : 0.5,
          }}
          className="w-[3px] rounded-full"
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
        />
      ))}
    </div>
  );
}

// ─── SECTION REVEAL WRAPPER ──────────────────────────────────
function RevealSection({ children, className = "", id = "" }: {
  children: React.ReactNode; className?: string; id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.15 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} id={id} className={className}>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={visible ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </div>
  );
}

// ─── FEATURE PANEL (manga-style info box) ────────────────────
function FeaturePanel({ index, icon, title, bubble, detail, color, delay = 0 }: {
  index: string; icon: string; title: string; bubble: string; detail: string; color: string; delay?: number;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 160, damping: 22 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="panel relative p-5 cursor-default"
      style={{ borderColor: hovered ? color : "var(--border)" }}
      whileHover={{ y: -4 }}
    >
      {/* Panel number */}
      <span className="text-label" style={{ position: "absolute", top: 8, right: 12, fontSize: "9px" }}>{index}</span>

      {/* Icon */}
      <div
        className="w-10 h-10 flex items-center justify-center text-xl mb-4"
        style={{ background: `${color}15`, border: `1px solid ${color}40` }}
      >
        {icon}
      </div>

      <h3 className="font-display text-lg mb-2" style={{ fontFamily: "var(--font-display)", color: "var(--text-1)" }}>
        {title}
      </h3>
      <p style={{ fontFamily: "var(--font-body)", color: "var(--text-2)", fontSize: "0.875rem", lineHeight: 1.6 }}>
        {detail}
      </p>

      {/* Pop speech bubble on hover */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, scale: 0.7, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.7, y: 8 }}
            transition={{ type: "spring", stiffness: 360, damping: 22 }}
            className="bubble bubble--speech absolute -top-14 left-4 text-sm whitespace-nowrap z-10"
          >
            {bubble}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── BOOK CARD ───────────────────────────────────────────────
function BookCard({ book, index }: { book: BookListItem; index: number }) {
  const [hov, setHov] = useState(false);
  const cover = getImageUrl(book.cover_image_id);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, rotate: -1 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ delay: index * 0.08, type: "spring", stiffness: 200, damping: 22 }}
      whileHover={{ y: -6, rotate: 0.5, scale: 1.03 }}
      onHoverStart={() => setHov(true)}
      onHoverEnd={() => setHov(false)}
    >
      <Link href={`/books/${book.id}`}>
        <div
          className="relative w-24 border-2 overflow-hidden transition-all duration-150"
          style={{
            borderColor: hov ? "var(--amber)" : "var(--border)",
            background: "var(--surface)",
            boxShadow: hov ? "4px 4px 0 rgba(245,166,35,0.4)" : "3px 3px 0 rgba(0,0,0,0.4)",
          }}
        >
          {cover
            ? <img src={cover} alt={book.title} className="w-full h-32 object-cover" />
            : <div className="w-full h-32 flex items-center justify-center" style={{ background: "var(--surface-2)" }}>
                <BookOpen size={24} style={{ color: "var(--text-3)" }} />
              </div>
          }
          <div className="p-1.5">
            <p className="text-label leading-tight truncate" style={{ fontSize: "9px", color: hov ? "var(--amber)" : "var(--text-3)" }}>
              {book.title}
            </p>
          </div>
          <AnimatePresence>
            {hov && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center text-xs font-label"
                style={{ background: "rgba(245,166,35,0.85)", color: "#1A1825" }}>
                OPEN ▶
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Link>
    </motion.div>
  );
}

// ─── TYPEWRITER ──────────────────────────────────────────────
function Typewriter({ text, speed = 40 }: { text: string; speed?: number }) {
  const [out, setOut] = useState("");
  useEffect(() => {
    setOut("");
    let i = 0;
    const t = setInterval(() => {
      if (i < text.length) { setOut(text.slice(0, ++i)); }
      else clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [text, speed]);
  return <span>{out}<motion.span animate={{ opacity: [1,0,1] }} transition={{ repeat: Infinity, duration: 0.7 }} style={{ display:"inline-block", width:2, height:"1em", background:"var(--amber)", verticalAlign:"middle", marginLeft:2 }} /></span>;
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
const SECTIONS = 6;

export default function HomePage() {
  const [activeSection, setActiveSection] = useState(0);
  const [books, setBooks] = useState<BookListItem[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>(Array(SECTIONS).fill(null));

  useEffect(() => {
    checkHealth().then(setOnline);
    listBooks().then(setBooks).catch(() => {});
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const idx = sectionRefs.current.indexOf(e.target as HTMLElement);
          if (idx >= 0) setActiveSection(idx);
        }
      });
    }, { threshold: 0.4 });
    sectionRefs.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const setRef = useCallback((i: number) => (el: HTMLElement | null) => {
    sectionRefs.current[i] = el;
  }, []);

  // ── ROOT BACKGROUND ────────────────────────────────────────
  return (
    <div style={{ background: "var(--bg)" }}>
      <SectionTracker active={activeSection} total={SECTIONS} />

      {/* ════════════════════════════════════════════════════
          § 0 — SPLASH PANEL (full-height title page)
      ════════════════════════════════════════════════════ */}
      <section
        ref={setRef(0)}
        className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
      >
        {/* Background layers */}
        <div className="absolute inset-0">
          {/* Grid overlay */}
          <div className="absolute inset-0 opacity-[0.035]"
            style={{ backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
          {/* Speed lines */}
          <div className="absolute inset-0 opacity-80"><SpeedBurst /></div>
          {/* Radial vignette */}
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 60% at 50% 50%, transparent 0%, var(--bg) 100%)" }} />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-4xl mx-auto px-4 md:px-8 text-center">
          {/* Status */}
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 mb-8 px-3 py-1.5 border text-label"
            style={{ borderColor: online === false ? "var(--red)" : "var(--border-2)", background: "var(--surface)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: online ? "var(--teal)" : online === false ? "var(--red)" : "var(--text-3)" }} />
            {online ? "SYSTEM ONLINE — READY TO PARSE" : online === false ? "BACKEND OFFLINE — RUN ./start.sh" : "CONNECTING..."}
          </motion.div>

          {/* The big title */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            <h1 className="text-hero mb-4 leading-[0.88]">
              <motion.span
                initial={{ clipPath: "inset(0 100% 0 0)" }}
                animate={{ clipPath: "inset(0 0% 0 0)" }}
                transition={{ delay: 0.3, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="block"
                style={{ color: "var(--text-1)" }}
              >
                BOOKS ARE
              </motion.span>
              <motion.span
                initial={{ clipPath: "inset(0 100% 0 0)" }}
                animate={{ clipPath: "inset(0 0% 0 0)" }}
                transition={{ delay: 0.55, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="block text-gradient"
              >
                MANGA NOW.
              </motion.span>
            </h1>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            style={{ fontFamily: "var(--font-body)", color: "var(--text-2)", fontSize: "1.1rem", lineHeight: 1.6, maxWidth: "480px", margin: "0 auto 2.5rem" }}
          >
            Drop any PDF. Watch the AI Sensei transform it into swipeable manga panels and addictive lesson reels.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link href="/upload">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }} className="btn-primary">
                <Upload size={16} />
                Upload a Book
              </motion.div>
            </Link>
            {books.length > 0 && (
              <Link href="/reels">
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }} className="btn-secondary">
                  <Film size={16} />
                  Browse Reels
                </motion.div>
              </Link>
            )}
          </motion.div>

          {/* Scroll hint */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.6 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          >
            <span className="text-label" style={{ fontSize: "9px" }}>SCROLL TO READ</span>
            <motion.div
              animate={{ y: [0, 6, 0] }}
              transition={{ repeat: Infinity, duration: 1.4 }}
            >
              <ChevronDown size={18} style={{ color: "var(--text-3)" }} />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════
          § 1 — MISSION PANEL (what it does)
          Paper-colored — inverted panel for visual break
      ════════════════════════════════════════════════════ */}
      <section
        ref={setRef(1)}
        className="relative overflow-hidden section-paper"
        style={{ minHeight: "85vh", display: "flex", alignItems: "center" }}
      >
        <div className="absolute inset-0 halftone--paper" />

        <div className="relative z-10 max-w-6xl mx-auto px-4 md:px-8 py-20 w-full">
          <div className="manga-grid manga-grid--asym gap-8 items-center">

            {/* Left: Character + dialogue */}
            <RevealSection>
              <div className="flex flex-col items-start gap-6">
                <span className="chapter-badge" style={{ "--amber": "#F5A623" } as React.CSSProperties}>
                  CH.01 — THE PROBLEM
                </span>

                <div className="flex items-end gap-4">
                  <motion.div
                    animate={{ y: [-3, 3, -3] }}
                    transition={{ repeat: Infinity, duration: 2.8, ease: "easeInOut" }}
                  >
                    <SenseiBot size={96} expression="thinking" />
                  </motion.div>
                  <div className="bubble bubble--speech mb-8 max-w-xs">
                    「You have a 400-page book. Who has time to read it ALL?」
                  </div>
                </div>

                <h2 className="text-chapter" style={{ color: "var(--ink-on-paper)", fontFamily: "var(--font-display)" }}>
                  Every Book,<br />
                  <span style={{ color: "var(--red)" }}>Unlocked.</span>
                </h2>

                <p style={{ fontFamily: "var(--font-body)", color: "rgba(26,24,37,0.65)", lineHeight: 1.7, maxWidth: "400px" }}>
                  Upload any PDF — textbook, business book, novel. The AI extracts every chapter, detects structure, and builds a knowledge graph you can actually explore.
                </p>
              </div>
            </RevealSection>

            {/* Right: Manga mini-panel grid showing the flow */}
            <RevealSection>
              <div className="manga-grid gap-[3px]" style={{ gridTemplateColumns: "1fr 1fr", gridTemplateRows: "200px 200px" }}>
                {/* Panel A: Raw PDF */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                  className="panel relative flex flex-col items-center justify-center gap-3"
                  style={{ background: "var(--ink-on-paper)", gridColumn: "1", gridRow: "1" }}
                >
                  <div className="panel-label" style={{ background: "#1A1825" }}>RAW PDF</div>
                  <span style={{ fontSize: "3rem" }}>📄</span>
                  <p className="text-label text-center px-2" style={{ color: "var(--text-3)" }}>400 pages of dense text</p>
                </motion.div>

                {/* Panel B: Parsing (tall) */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  className="panel relative flex flex-col items-center justify-center gap-3"
                  style={{ background: "var(--surface)", gridColumn: "2", gridRow: "1 / 3" }}
                >
                  <div className="panel-label">PROCESSING</div>
                  <div className="speed-lines" />
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                    style={{ width: 48, height: 48, borderRadius: "50%", border: "3px solid var(--border-2)", borderTopColor: "var(--amber)" }}
                  />
                  <p className="text-label text-center px-4" style={{ color: "var(--amber)" }}>DOCLING + PyMuPDF<br />CHAPTER DETECTION</p>
                  {/* Progress bars */}
                  {["Chapters", "Images", "Structure"].map((l, i) => (
                    <div key={l} className="w-full px-6">
                      <div className="flex justify-between mb-0.5">
                        <span className="text-label" style={{ fontSize: "8px" }}>{l}</span>
                        <span className="text-label" style={{ fontSize: "8px", color: "var(--amber)" }}>{[12, 47, 100][i]}%</span>
                      </div>
                      <div className="xp-bar">
                        <motion.div
                          className="xp-fill"
                          initial={{ width: 0 }}
                          animate={{ width: `${[12, 47, 100][i]}%` }}
                          transition={{ delay: 0.6 + i * 0.3, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                        />
                      </div>
                    </div>
                  ))}
                </motion.div>

                {/* Panel C: Result */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="panel relative flex flex-col items-center justify-center gap-3 panel--glow-amber"
                  style={{ gridColumn: "1", gridRow: "2" }}
                >
                  <div className="panel-label" style={{ color: "var(--amber)", borderColor: "var(--amber)" }}>DONE</div>
                  <span style={{ fontSize: "2.5rem" }}>⚡</span>
                  <p className="text-label text-center px-2" style={{ color: "var(--amber)" }}>Structured. Ready. Yours.</p>
                </motion.div>
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════
          § 2 — POWER PANEL (AI transformation)
      ════════════════════════════════════════════════════ */}
      <section
        ref={setRef(2)}
        className="relative overflow-hidden"
        style={{ minHeight: "80vh", display: "flex", alignItems: "center" }}
      >
        <div className="absolute inset-0">
          <div className="speed-lines--red opacity-60" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, var(--bg) 0%, rgba(232,25,26,0.04) 50%, var(--bg) 100%)" }} />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 md:px-8 py-20 w-full">
          <RevealSection>
            <div className="text-center mb-14">
              <span className="chapter-badge inline-flex mb-4">CH.02 — THE AI SENSEI</span>
              <h2 className="text-chapter" style={{ fontFamily: "var(--font-display)" }}>
                One Summary.<br />
                <span className="text-gradient">Infinite Formats.</span>
              </h2>
            </div>
          </RevealSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FeaturePanel
              index="01" icon="🧠" title="CANONICAL SUMMARY" delay={0.1} color="var(--blue)"
              bubble="「I read it once so you never have to again.」"
              detail="One LLM call per chapter generates the master summary. Everything else derives from it — no duplicate API calls."
            />
            <FeaturePanel
              index="02" icon="⚔" title="MANGA PANELS" delay={0.22} color="var(--red)"
              bubble="「Your chapters, now drawn in full battle glory!」"
              detail="The canonical summary becomes 6-10 manga panels with dialogue, narrator boxes, and dynamic visual descriptions."
            />
            <FeaturePanel
              index="03" icon="🎬" title="REEL LESSONS" delay={0.34} color="var(--amber)"
              bubble="「2 minutes per lesson. You'll finish the book today.」"
              detail="2-4 reel scripts per chapter. Vertical swipe to discover, horizontal swipe to deep-dive any book."
            />
          </div>

          {/* Cost callout panel */}
          <RevealSection className="mt-6">
            <div
              className="panel p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
              style={{ borderColor: "rgba(245,166,35,0.3)", background: "rgba(245,166,35,0.04)" }}
            >
              <div className="bubble bubble--narrator shrink-0">YOUR KEY. YOUR COST.</div>
              <p style={{ fontFamily: "var(--font-body)", color: "var(--text-2)", fontSize: "0.875rem", lineHeight: 1.6 }}>
                PanelSummary never stores your API key. You bring OpenAI or OpenRouter — we proxy the call and show you the exact cost per book. Typical summary: <span style={{ color: "var(--amber)" }}>$0.02–0.15</span>.
              </p>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════
          § 3 — BATTLE PANEL (dual-swipe feature explainer)
      ════════════════════════════════════════════════════ */}
      <section
        ref={setRef(3)}
        className="relative overflow-hidden section-paper"
        style={{ minHeight: "80vh", display: "flex", alignItems: "center" }}
      >
        <div className="absolute inset-0 halftone--paper" />

        <div className="relative z-10 max-w-6xl mx-auto px-4 md:px-8 py-20 w-full">
          <RevealSection>
            <div className="flex flex-col md:flex-row items-start gap-10">
              {/* Text side */}
              <div className="flex-1">
                <span className="chapter-badge mb-4 inline-flex" style={{ color: "var(--red)" }}>
                  CH.03 — THE KILLER FEATURE
                </span>
                <h2 className="text-chapter mb-6" style={{ color: "var(--ink-on-paper)", fontFamily: "var(--font-display)" }}>
                  DUAL-SWIPE<br />
                  <span style={{ color: "var(--red)" }}>REEL FEED.</span>
                </h2>

                <div className="flex flex-col gap-5">
                  {[
                    { dir: "↕", label: "VERTICAL", accent: "var(--red)", title: "Discover Mode", desc: "Scroll through lessons from ALL your books. Like a For You Page — but for actual knowledge." },
                    { dir: "↔", label: "HORIZONTAL", accent: "var(--ink-on-paper)", title: "Deep-Dive Mode", desc: "Swipe sideways to cycle every lesson from the SAME book. \"Lesson 3/7 · Atomic Habits\"" },
                  ].map((item) => (
                    <div key={item.dir} className="flex gap-4 items-start">
                      <div
                        className="w-10 h-10 shrink-0 flex items-center justify-center text-xl font-display border-2"
                        style={{ borderColor: item.accent, color: item.accent, fontFamily: "var(--font-display)" }}
                      >
                        {item.dir}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-label" style={{ color: item.accent }}>{item.label}</span>
                          <span style={{ fontFamily: "var(--font-display)", fontSize: "0.9rem", color: "var(--ink-on-paper)" }}>{item.title}</span>
                        </div>
                        <p style={{ fontFamily: "var(--font-body)", color: "rgba(26,24,37,0.6)", fontSize: "0.875rem", lineHeight: 1.6 }}>{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {books.length > 0 && (
                  <Link href="/reels">
                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      className="btn-primary mt-8 inline-flex"
                      style={{ background: "var(--red)", borderColor: "var(--red)" }}
                    >
                      <Film size={16} /> Open Reels Feed
                    </motion.div>
                  </Link>
                )}
              </div>

              {/* Phone mockup */}
              <div className="flex-shrink-0 flex justify-center">
                <div
                  className="relative w-52 border-2 overflow-hidden"
                  style={{
                    borderColor: "var(--ink-on-paper)",
                    background: "var(--ink-on-paper)",
                    borderRadius: "16px",
                    height: "340px",
                    boxShadow: "6px 6px 0 rgba(26,24,37,0.2)",
                  }}
                >
                  {/* Phone screen */}
                  <div className="absolute inset-[6px] overflow-hidden" style={{ background: "var(--bg)", borderRadius: "12px" }}>
                    <div className="absolute inset-0"><SpeedBurst opacity={0.04} /></div>
                    {/* Reel card preview */}
                    <div className="absolute inset-0 flex flex-col p-4">
                      <div className="text-label mb-3" style={{ color: "var(--amber)" }}>⚡ LESSON 3/7</div>
                      <p className="font-display text-lg mb-2 leading-tight" style={{ fontFamily: "var(--font-display)", color: "var(--text-1)" }}>
                        3 Rules That Changed Everything
                      </p>
                      <p style={{ fontFamily: "var(--font-body)", color: "var(--amber)", fontSize: "0.8rem", lineHeight: 1.4, marginBottom: "1rem" }}>
                        What if habits aren't about willpower?
                      </p>
                      {["Make it Obvious", "Make it Attractive", "Make it Easy"].map((p, i) => (
                        <motion.div key={p} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.15 }}
                          className="flex gap-2 items-start mb-2">
                          <span className="text-label w-4 shrink-0" style={{ color: "var(--teal)" }}>{i+1}</span>
                          <p style={{ fontFamily: "var(--font-body)", fontSize: "0.78rem", color: "var(--text-2)", lineHeight: 1.4 }}>{p}</p>
                        </motion.div>
                      ))}
                      {/* Swipe indicators */}
                      <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1">
                        {[0,1,2].map((i) => (
                          <motion.div key={i}
                            animate={{ width: i === 2 ? 20 : 6 }}
                            className="h-1 rounded-full"
                            style={{ background: i === 2 ? "var(--amber)" : "var(--border-2)" }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  {/* Swipe arrows decoration */}
                  <div className="absolute -left-3 top-1/2 -translate-y-1/2 text-lg" style={{ color: "var(--border-2)" }}>◀</div>
                  <div className="absolute -right-3 top-1/2 -translate-y-1/2 text-lg" style={{ color: "var(--red)" }}>▶</div>
                </div>
              </div>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════
          § 4 — LIBRARY (only if books exist)
      ════════════════════════════════════════════════════ */}
      {books.length > 0 && (
        <section ref={setRef(4)} className="relative overflow-hidden" style={{ minHeight: "50vh", display: "flex", alignItems: "center" }}>
          <div className="halftone absolute inset-0 opacity-50" />
          <div className="relative z-10 max-w-6xl mx-auto px-4 md:px-8 py-16 w-full">
            <RevealSection>
              <div className="flex items-center gap-4 mb-8">
                <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, var(--amber), transparent)" }} />
                <span className="chapter-badge" style={{ color: "var(--amber)" }}>YOUR LIBRARY</span>
                <div className="h-px flex-1" style={{ background: "linear-gradient(270deg, var(--amber), transparent)" }} />
              </div>
              <div className="flex flex-wrap gap-4">
                {books.map((b, i) => <BookCard key={b.id} book={b} index={i} />)}
                <Link href="/upload">
                  <motion.div whileHover={{ scale: 1.04 }}
                    className="w-24 h-[152px] drop-zone flex flex-col items-center justify-center gap-2"
                    style={{ color: "var(--text-3)" }}
                  >
                    <span style={{ fontSize: "1.5rem" }}>＋</span>
                    <span className="text-label" style={{ fontSize: "9px" }}>ADD</span>
                  </motion.div>
                </Link>
              </div>
            </RevealSection>
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════
          § 5 — FINAL PAGE (CTA chapter end)
      ════════════════════════════════════════════════════ */}
      <section
        ref={setRef(5)}
        className="relative overflow-hidden"
        style={{ minHeight: "70vh", display: "flex", alignItems: "center" }}
      >
        <div className="absolute inset-0">
          <SpeedBurst color="var(--red)" opacity={0.05} />
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(232,25,26,0.06) 0%, var(--bg) 100%)" }} />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 md:px-8 py-20 w-full text-center">
          <RevealSection>
            {/* End-of-chapter marker */}
            <div className="flex items-center gap-4 justify-center mb-8">
              <div className="h-px w-20" style={{ background: "var(--border-2)" }} />
              <span className="text-label">END OF CHAPTER</span>
              <div className="h-px w-20" style={{ background: "var(--border-2)" }} />
            </div>

            <div className="flex items-end justify-center gap-6 mb-8">
              <motion.div animate={{ y: [-4, 4, -4] }} transition={{ repeat: Infinity, duration: 3 }}>
                <SenseiBot size={100} expression="excited" />
              </motion.div>
              <div className="bubble bubble--speech text-base mb-8 text-left">
                「Your first book is waiting.<br />Let's make it legendary.」
              </div>
            </div>

            <h2 className="text-chapter mb-8" style={{ fontFamily: "var(--font-display)" }}>
              READY TO<br />
              <span className="text-gradient">BEGIN?</span>
            </h2>

            <Link href="/upload">
              <motion.div
                whileHover={{ scale: 1.05, boxShadow: "6px 6px 0 var(--red-dim)" }}
                whileTap={{ scale: 0.96 }}
                className="btn-primary text-xl inline-flex gap-3 px-10 py-5"
              >
                <Upload size={20} />
                Upload Your First Book
                <ArrowRight size={20} />
              </motion.div>
            </Link>

            <p className="text-label mt-6" style={{ color: "var(--text-3)" }}>
              No account. No subscription. Just your PDF and your API key.
            </p>
          </RevealSection>
        </div>
      </section>
    </div>
  );
}
