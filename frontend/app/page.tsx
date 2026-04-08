"use client";

/**
 * HOMEPAGE v3 — "The Attention Economy Problem"
 * ===============================================
 * A story told through scroll, game, and manga panels.
 *
 * STRUCTURE:
 *  ① COLD OPEN   — The problem statement, raw and bold
 *  ② THE GAME    — "Attention Gauntlet" — try to read without distracting
 *  ③ THE PIVOT   — But manga... manga works. Here's why.
 *  ④ HOW IT WORKS— Upload → AI → Manga (3 steps)
 *  ⑤ LIBRARY     — Manga shelf
 *  ⑥ CTA         — Final push
 *  ⑦ BOOK FOOTER — Open book closing illustration
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useInView } from "motion/react";
import { Upload, Film, Video, BookOpen, ArrowRight, ArrowDown } from "lucide-react";
import { listBooks, checkHealth } from "@/lib/api";
import type { BookListItem } from "@/lib/types";
import dynamic from "next/dynamic";

const AttentionGame = dynamic(() => import("@/components/HomePage/AttentionGame"), { ssr: false });
const MangaPivotSection = dynamic(() => import("@/components/HomePage/MangaPivotSection"), { ssr: false });
const MangaShelf = dynamic(() => import("@/components/HomePage/MangaShelf"), { ssr: false });
const BookFooter = dynamic(() => import("@/components/HomePage/BookFooter"), { ssr: false });

// ============================================================
// REVEAL — animate children on scroll into view
// ============================================================

function Reveal({ children, className = "", delay = 0 }: {
  children: React.ReactNode; className?: string; delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <div ref={ref} className={className}>
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </div>
  );
}

// ============================================================
// STAT COUNTER — animated number
// ============================================================

function StatCounter({ end, suffix = "", label, duration = 2000 }: {
  end: number; suffix?: string; label: string; duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref as React.RefObject<HTMLElement>, { once: true });
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(Math.floor(eased * end));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, end, duration]);

  return (
    <div className="text-center">
      <span ref={ref} style={{
        fontFamily: "var(--font-display)",
        fontSize: "clamp(2rem, 6vw, 3.5rem)",
        color: "var(--amber)",
        lineHeight: 1,
      }}>
        {val}{suffix}
      </span>
      <p style={{
        fontFamily: "var(--font-label)",
        fontSize: 9,
        color: "var(--text-3)",
        letterSpacing: "0.2em",
        marginTop: 6,
      }}>
        {label}
      </p>
    </div>
  );
}

// ============================================================
// STEP CARD
// ============================================================

function StepCard({ num, title, desc, accent, icon }: {
  num: string; title: string; desc: string; accent: string; icon: React.ReactNode;
}) {
  return (
    <div
      className="relative p-6 border-2 transition-all"
      style={{
        borderColor: "var(--border)",
        background: "var(--surface)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = accent;
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
      }}
    >
      <span style={{
        position: "absolute", bottom: 8, right: 10,
        fontFamily: "var(--font-display)", fontSize: "4rem",
        lineHeight: 1, pointerEvents: "none", zIndex: 0, opacity: 0.07, color: accent,
      }}>{num}</span>

      <div className="relative z-10 flex items-center gap-3 mb-3">
        <div style={{
          width: 36, height: 36,
          display: "flex", alignItems: "center", justifyContent: "center",
          border: `2px solid ${accent}`, color: accent,
        }}>
          {icon}
        </div>
        <h3 style={{
          fontFamily: "var(--font-display)", fontSize: "1.1rem", color: "var(--text-1)",
        }}>{title}</h3>
      </div>

      <p className="relative z-10" style={{
        fontFamily: "var(--font-body)", fontSize: "0.85rem",
        color: "var(--text-2)", lineHeight: 1.7,
      }}>{desc}</p>
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function HomePage() {
  const [books, setBooks] = useState<BookListItem[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    checkHealth().then(setOnline);
    listBooks().then(setBooks).catch(() => {});
  }, []);

  return (
    <div style={{ background: "var(--bg)" }}>

      {/* § 0 — COLD OPEN */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "radial-gradient(circle, #F0EEE8 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />

        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="mb-10"
        >
          <span className="inline-flex items-center gap-2 px-3 py-1.5 border text-label"
            style={{
              borderColor: online === false ? "var(--red)" : "var(--border-2)",
              background: "var(--surface)",
            }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: online ? "var(--teal)" : online === false ? "var(--red)" : "var(--text-3)" }} />
            {online ? "ENGINE ONLINE" : online === false ? "BACKEND OFFLINE — RUN ./start.sh" : "CONNECTING..."}
          </span>
        </motion.div>

        <div className="relative z-10 max-w-3xl text-center">
          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            style={{
              fontFamily: "var(--font-label)", fontSize: 10,
              letterSpacing: "0.3em", color: "var(--text-3)", marginBottom: 20,
            }}
          >
            A READING CRISIS IN THE ATTENTION ECONOMY
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(2.5rem, 10vw, 7rem)",
              lineHeight: 0.9, color: "var(--text-1)", marginBottom: 24,
            }}
          >
            NOBODY<br />
            <span style={{ color: "var(--red)" }}>FINISHES</span><br />
            THE BOOK.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "clamp(0.95rem, 2.5vw, 1.15rem)",
              color: "var(--text-2)", lineHeight: 1.7, maxWidth: 480, margin: "0 auto",
            }}
          >
            You bought <span style={{ color: "var(--amber)", fontWeight: 600 }}>12 books</span> this year.
            Started 8. Finished 4. The rest collect dust — and guilt.
            What if the format was the problem, not you?
          </motion.p>
        </div>

        <motion.div
          className="absolute bottom-8 flex flex-col items-center gap-2"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}
        >
          <span className="text-label" style={{ fontSize: 8 }}>SCROLL DOWN</span>
          <motion.div animate={{ y: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.4 }}>
            <ArrowDown size={14} style={{ color: "var(--text-3)" }} />
          </motion.div>
        </motion.div>
      </section>

      {/* § 1 — THE STATS */}
      <section className="py-16 px-4">
        <Reveal>
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
              <StatCounter end={67} suffix="%" label="ABANDON BEFORE CH.3" />
              <StatCounter end={12} suffix="min" label="AVERAGE ATTENTION SPAN" />
              <StatCounter end={400} label="PAGES IN AVG BUSINESS BOOK" />
              <StatCounter end={4} label="BOOKS FINISHED PER YEAR" />
            </div>
            <div className="mt-8 text-center">
              <p style={{ fontFamily: "var(--font-body)", color: "var(--text-3)", fontSize: "0.85rem" }}>
                The attention economy won. But there&apos;s a format that fights back.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* § 2 — THE GAME */}
      <section className="py-16 px-4">
        <Reveal>
          <div className="max-w-[680px] mx-auto">
            <div className="text-center mb-8">
              <span className="chapter-badge mb-3 inline-flex">INTERACTIVE — TRY IT</span>
              <h2 style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(1.4rem, 4vw, 2.2rem)",
                color: "var(--text-1)", lineHeight: 1.1, marginBottom: 8,
              }}>
                THE ATTENTION<br />
                <span style={{ color: "var(--red)" }}>GAUNTLET</span>
              </h2>
              <p style={{
                fontFamily: "var(--font-body)", fontSize: "0.85rem",
                color: "var(--text-2)", maxWidth: 420, margin: "0 auto",
              }}>
                Try to read a book. Dodge notifications, emails, meetings,
                and social media. How many pages can you survive?
              </p>
            </div>
            <AttentionGame />
          </div>
        </Reveal>
      </section>

      {/* § 3 — THE PIVOT */}
      <MangaPivotSection />

      {/* § 4 — THE PIPELINE */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <span className="chapter-badge inline-flex mb-3">THE PIPELINE</span>
              <h2 style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(1.8rem, 5vw, 3rem)",
                color: "var(--text-1)", lineHeight: 1,
              }}>
                PDF IN<span style={{ color: "var(--text-3)", margin: "0 12px" }}>·</span>
                <span style={{ color: "var(--amber)" }}>MANGA OUT</span>
              </h2>
              <p style={{
                fontFamily: "var(--font-body)", fontSize: "0.9rem",
                color: "var(--text-3)", maxWidth: 440,
                margin: "10px auto 0", lineHeight: 1.6,
              }}>
                Three steps. One AI call per chapter. Your book, reimagined.
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Reveal delay={0.1}>
              <StepCard
                num="01" title="DROP THE PDF"
                desc="Any book, any length. Docling + PyMuPDF detect chapters, extract structure, and build a knowledge graph of concepts and characters."
                accent="var(--amber)" icon={<Upload size={18} />}
              />
            </Reveal>
            <Reveal delay={0.2}>
              <StepCard
                num="02" title="AI DISTILLS"
                desc="One LLM call per chapter. Canonical summaries, character bibles, emotional arcs — the book's DNA, compressed and understood."
                accent="var(--red)" icon={<BookOpen size={18} />}
              />
            </Reveal>
            <Reveal delay={0.3}>
              <StepCard
                num="03" title="READ · WATCH · SCROLL"
                desc="Swipeable manga panels with characters and dialogue. Animated Living Panels. 30-second video reels. Choose your format."
                accent="var(--teal)" icon={<Film size={18} />}
              />
            </Reveal>
          </div>

          {/* Cost callout */}
          <Reveal delay={0.4}>
            <div className="mt-6 p-4 border flex flex-col sm:flex-row items-start sm:items-center gap-3"
              style={{
                borderColor: "rgba(245,166,35,0.2)",
                background: "rgba(245,166,35,0.03)",
              }}>
              <span style={{
                fontFamily: "var(--font-label)", fontSize: 9,
                color: "var(--amber)", letterSpacing: "0.15em",
                border: "1px solid rgba(245,166,35,0.3)", padding: "2px 8px", flexShrink: 0,
              }}>YOUR KEY</span>
              <p style={{
                fontFamily: "var(--font-body)", fontSize: "0.8rem",
                color: "var(--text-2)", lineHeight: 1.6,
              }}>
                Bring your own OpenAI or OpenRouter key. We never store it.
                Cost per book: <span style={{ color: "var(--amber)" }}>$0.02–$0.15</span>.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* § 5 — MANGA SHELF */}
      <MangaShelf books={books} />

      {/* § 6 — FINAL CTA */}
      <section className="relative py-24 px-4 overflow-hidden">
        <div className="absolute inset-0" style={{
          background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(232,25,26,0.04) 0%, transparent 100%)",
        }} />

        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <Reveal>
            <div className="flex items-center gap-4 justify-center mb-6">
              <div className="h-px w-16" style={{ background: "var(--border-2)" }} />
              <span className="text-label" style={{ fontSize: 8 }}>FINAL PAGE</span>
              <div className="h-px w-16" style={{ background: "var(--border-2)" }} />
            </div>

            <h2 style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(2rem, 7vw, 4rem)",
              lineHeight: 1, color: "var(--text-1)", marginBottom: 16,
            }}>
              STOP BUYING.<br />
              <span className="text-gradient">START READING.</span>
            </h2>

            <p style={{
              fontFamily: "var(--font-body)", fontSize: "1rem",
              color: "var(--text-2)", maxWidth: 420,
              margin: "0 auto 28px", lineHeight: 1.7,
            }}>
              Upload your first book. Watch it transform.
              No account. No subscription. Just your PDF.
            </p>

            <Link href="/upload">
              <motion.div
                whileHover={{ scale: 1.04, boxShadow: "6px 6px 0 var(--red-dim)" }}
                whileTap={{ scale: 0.96 }}
                className="btn-primary text-lg inline-flex gap-3 px-10 py-4"
              >
                <Upload size={18} />
                Upload a Book
                <ArrowRight size={18} />
              </motion.div>
            </Link>

            {books.length > 0 && (
              <div className="mt-4 flex gap-3 flex-wrap justify-center">
                <Link href="/reels">
                  <motion.span
                    whileHover={{ scale: 1.03 }}
                    className="btn-secondary text-sm inline-flex gap-2 px-6 py-3"
                  >
                    <Film size={14} />
                    Lesson Reels
                  </motion.span>
                </Link>
                <Link href="/video-reels">
                  <motion.span
                    whileHover={{ scale: 1.03 }}
                    className="text-sm inline-flex gap-2 px-6 py-3 border items-center font-label transition-colors"
                    style={{ borderColor: "var(--amber)", color: "var(--amber)", background: "var(--surface)", fontSize: "11px" }}
                  >
                    <Video size={14} />
                    Video Reels
                  </motion.span>
                </Link>
              </div>
            )}
          </Reveal>
        </div>
      </section>

      {/* § 7 — BOOK FOOTER */}
      <BookFooter />
    </div>
  );
}
