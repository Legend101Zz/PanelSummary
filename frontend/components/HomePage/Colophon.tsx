"use client";

/**
 * Colophon — The last page of the manga volume
 * ================================================
 * In real books, the colophon is the final page: publisher info,
 * typefaces, edition number, a printer's mark. In manga volumes,
 * it's the mangaka's afterword + a small doodle + thank-yous.
 *
 * This blends both traditions into something that feels like
 * you've actually reached the back cover of a physical volume.
 */

import { useRef } from "react";
import { motion, useInView } from "motion/react";

// ── Fleuron ornament (❦) drawn as SVG so it's crisp at any size
function Fleuron({ size = 24, color = "rgba(26,24,37,0.18)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2C12 2 8 6 8 10C8 12 9.5 13.5 12 14C14.5 13.5 16 12 16 10C16 6 12 2 12 2Z"
        fill={color}
      />
      <path
        d="M12 14C12 14 6 13 4 16C3 18 4 20 6 21C8 22 10 21 12 18C14 21 16 22 18 21C20 20 21 18 20 16C18 13 12 14 12 14Z"
        fill={color}
      />
      <circle cx="12" cy="14" r="1.5" fill={color} />
    </svg>
  );
}

// ── Tiny manga panel doodle — a character waving goodbye
function MangakaDoodle() {
  return (
    <div
      style={{
        width: 64,
        height: 64,
        position: "relative",
      }}
      aria-hidden="true"
    >
      {/* Simple chibi character — circle head, stick body, waving hand */}
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        {/* Head */}
        <circle cx="32" cy="18" r="10" stroke="rgba(26,24,37,0.2)" strokeWidth="1.5" fill="none" />
        {/* Eyes — two dots */}
        <circle cx="29" cy="17" r="1" fill="rgba(26,24,37,0.25)" />
        <circle cx="35" cy="17" r="1" fill="rgba(26,24,37,0.25)" />
        {/* Smile */}
        <path d="M29 21 Q32 24 35 21" stroke="rgba(26,24,37,0.2)" strokeWidth="1" fill="none" />
        {/* Body */}
        <line x1="32" y1="28" x2="32" y2="44" stroke="rgba(26,24,37,0.2)" strokeWidth="1.5" />
        {/* Left arm (waving) */}
        <motion.line
          x1="32" y1="33" x2="22" y2="27"
          stroke="rgba(26,24,37,0.2)" strokeWidth="1.5"
          animate={{ x2: [22, 20, 22], y2: [27, 24, 27] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Right arm */}
        <line x1="32" y1="33" x2="42" y2="38" stroke="rgba(26,24,37,0.2)" strokeWidth="1.5" />
        {/* Legs */}
        <line x1="32" y1="44" x2="26" y2="54" stroke="rgba(26,24,37,0.2)" strokeWidth="1.5" />
        <line x1="32" y1="44" x2="38" y2="54" stroke="rgba(26,24,37,0.2)" strokeWidth="1.5" />
        {/* Speech bubble with "bye!" */}
        <rect x="42" y="8" width="20" height="12" rx="3" fill="rgba(26,24,37,0.05)" stroke="rgba(26,24,37,0.12)" strokeWidth="0.8" />
        <text x="52" y="16" textAnchor="middle" fill="rgba(26,24,37,0.3)" fontSize="6" fontFamily="Boogaloo, cursive">bye!</text>
        {/* Bubble pointer */}
        <path d="M44 20 L42 18 L46 20" fill="rgba(26,24,37,0.05)" stroke="rgba(26,24,37,0.12)" strokeWidth="0.8" />
      </svg>
    </div>
  );
}

export function Colophon() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <footer ref={ref} className="relative" style={{ background: "var(--bg)" }}>
      {/* Page edges visible on sides — like a thick book's page block */}
      <div className="max-w-2xl mx-auto px-4 pt-2 pb-8">

        {/* The page itself */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={{
            background: "#F2E8D5",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Stacked page edges behind (right side) */}
          <div style={{
            position: "absolute", top: 4, right: -3, bottom: 4, width: 3,
            background: "#E8D8BF",
          }} />
          <div style={{
            position: "absolute", top: 6, right: -5, bottom: 6, width: 2,
            background: "#DDD0B5",
          }} />
          <div style={{
            position: "absolute", top: 8, right: -7, bottom: 8, width: 2,
            background: "#D4C8AD",
          }} />

          {/* Faint ruled lines across the page */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(26,24,37,0.03) 27px, rgba(26,24,37,0.03) 28px)",
          }} />

          {/* Top margin line (red, like a real notebook) */}
          <div style={{
            position: "absolute", top: 0, left: 48, bottom: 0, width: 1,
            background: "rgba(232,25,26,0.06)",
          }} />

          {/* Content */}
          <div style={{ padding: "40px 36px 32px 60px" }}>

            {/* Ornament */}
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <Fleuron size={20} />
            </div>

            {/* Mangaka's afterword */}
            <div style={{ marginBottom: 28 }}>
              <p style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: 12,
                color: "rgba(26,24,37,0.55)",
                lineHeight: 2,
                fontStyle: "italic",
                textIndent: "2em",
              }}>
                Thank you for scrolling this far. Most people wouldn&apos;t —
                which, if you think about it, is exactly the problem we&apos;re
                trying to solve. Every unfinished book is a conversation
                that never happened. We think manga can restart those
                conversations.
              </p>
            </div>

            {/* Doodle + closing */}
            <div style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              marginBottom: 32,
            }}>
              <MangakaDoodle />
              <div style={{ textAlign: "right" }}>
                <p style={{
                  fontFamily: "'Dela Gothic One', sans-serif",
                  fontSize: 11,
                  color: "rgba(26,24,37,0.4)",
                  letterSpacing: "0.1em",
                }}>
                  — THE AUTHOR
                </p>
                <p style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: 9,
                  color: "rgba(26,24,37,0.25)",
                  marginTop: 2,
                  fontStyle: "italic",
                }}>
                  (who also didn&apos;t finish his last book)
                </p>
              </div>
            </div>

            {/* Divider — a thin ink rule with a small diamond */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 20,
            }}>
              <div style={{ flex: 1, height: 1, background: "rgba(26,24,37,0.08)" }} />
              <div style={{
                width: 5, height: 5,
                background: "rgba(26,24,37,0.12)",
                transform: "rotate(45deg)",
              }} />
              <div style={{ flex: 1, height: 1, background: "rgba(26,24,37,0.08)" }} />
            </div>

            {/* Colophon details — actual book metadata */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "6px 24px",
              marginBottom: 20,
            }}>
              {[
                ["TYPESET IN", "Dela Gothic One · Outfit · DotGothic16"],
                ["BUILT WITH", "Next.js · FastAPI · Docling"],
                ["MODELS", "Bring your own (OpenRouter / OpenAI)"],
                ["EDITION", "First — Spring 2025"],
              ].map(([label, value]) => (
                <div key={label} style={{ display: "contents" }}>
                  <p style={{
                    fontFamily: "'DotGothic16', monospace",
                    fontSize: 7,
                    letterSpacing: "0.15em",
                    color: "rgba(26,24,37,0.25)",
                    textAlign: "right",
                    paddingTop: 1,
                  }}>
                    {label}
                  </p>
                  <p style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: 9,
                    color: "rgba(26,24,37,0.4)",
                    lineHeight: 1.5,
                  }}>
                    {value}
                  </p>
                </div>
              ))}
            </div>

            {/* Publisher's mark + page number */}
            <div style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
            }}>
              {/* Publisher mark — a tiny manga panel icon */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}>
                <div style={{
                  width: 16, height: 20,
                  border: "1.5px solid rgba(26,24,37,0.15)",
                  display: "grid",
                  gridTemplateRows: "1fr 1fr",
                  gap: 1,
                  padding: 1,
                }}>
                  <div style={{ background: "rgba(26,24,37,0.08)" }} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                    <div style={{ background: "rgba(232,25,26,0.1)" }} />
                    <div style={{ background: "rgba(245,166,35,0.1)" }} />
                  </div>
                </div>
                <p style={{
                  fontFamily: "'DotGothic16', monospace",
                  fontSize: 7,
                  color: "rgba(26,24,37,0.2)",
                  letterSpacing: "0.1em",
                }}>
                  PANELSUMMARY PRESS
                </p>
              </div>

              {/* Page number */}
              <p style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: 10,
                color: "rgba(26,24,37,0.15)",
              }}>
                ∞
              </p>
            </div>
          </div>
        </motion.div>

        {/* Below the page — book's bottom edge + shadow */}
        <div style={{
          height: 3,
          background: "linear-gradient(90deg, transparent 2%, #D4C8AD 5%, #E8D8BF 50%, #D4C8AD 95%, transparent 98%)",
          marginTop: -1,
        }} />
        <div style={{
          height: 12,
          background: "radial-gradient(ellipse 60% 100% at 50% 0%, rgba(0,0,0,0.12) 0%, transparent 100%)",
        }} />
      </div>

      {/* Beneath everything — the dark surface it sits on */}
      <div className="pb-6 pt-3 text-center">
        <p style={{
          fontFamily: "var(--font-label)",
          fontSize: 7,
          color: "var(--text-3)",
          letterSpacing: "0.25em",
          opacity: 0.3,
        }}>
          EVERY BOOK DESERVES TO BE READ
        </p>
      </div>
    </footer>
  );
}

export default Colophon;
