"use client";

/**
 * MangaPivotSection.tsx — "BUT MANGA WORKS"
 * ============================================
 * A manga-page-style section with diagonal panel cuts,
 * speed lines, and dramatic scroll-triggered reveals.
 *
 * Inspired by actual shonen manga page layouts:
 * - Diagonal slash cuts
 * - Overlapping panels
 * - Speed lines radiating from impact
 * - Text that PUNCHES onto the screen
 */

import { useRef, useEffect, useState } from "react";
import { motion, useInView, useScroll, useTransform } from "motion/react";

// ============================================================
// SPEED LINES — radiating from a focal point (canvas-drawn)
// ============================================================

function SpeedLinesCanvas({ color = "rgba(26,24,37,0.06)", count = 60 }: {
  color?: string; count?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawn = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || drawn.current) return;
    drawn.current = true;
    const ctx = canvas.getContext("2d")!;
    const w = 800, h = 600;
    canvas.width = w;
    canvas.height = h;

    const cx = w / 2, cy = h * 0.4;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.03;
      const innerR = 60 + Math.random() * 40;
      const outerR = 300 + Math.random() * 200;
      const thickness = 0.5 + Math.random() * 1.5;

      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
      ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
      ctx.stroke();
    }
  }, [color, count]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.7 }}
    />
  );
}

// ============================================================
// DIAGONAL PANEL — a clip-path manga panel
// ============================================================

function DiagonalPanel({ children, clipPath, delay = 0, className = "" }: {
  children: React.ReactNode;
  clipPath: string;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <div ref={ref} className={`absolute inset-0 ${className}`}>
      <motion.div
        className="absolute inset-0"
        style={{ clipPath }}
        initial={{ opacity: 0, scale: 1.15 }}
        animate={inView ? { opacity: 1, scale: 1 } : {}}
        transition={{
          duration: 0.6,
          delay,
          ease: [0.16, 1, 0.3, 1],
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

// ============================================================
// SLASH LINE — the diagonal cut between panels
// ============================================================

function SlashLine({ angle, position, delay = 0 }: {
  angle: number; position: number; delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <div ref={ref} className="absolute inset-0 pointer-events-none z-20">
      <motion.div
        className="absolute"
        style={{
          top: 0,
          bottom: 0,
          left: `${position}%`,
          width: 3,
          background: "var(--ink-on-paper)",
          transformOrigin: "top center",
          transform: `rotate(${angle}deg)`,
        }}
        initial={{ scaleY: 0 }}
        animate={inView ? { scaleY: 1 } : {}}
        transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}

// ============================================================
// IMPACT TEXT — dramatic manga-style text reveal
// ============================================================

function ImpactText({ text, delay = 0, color = "var(--ink-on-paper)", size = "clamp(3rem, 10vw, 6rem)" }: {
  text: string; delay?: number; color?: string; size?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <div ref={ref} className="overflow-hidden">
      <motion.div
        initial={{ y: "110%", rotate: -3 }}
        animate={inView ? { y: "0%", rotate: 0 } : {}}
        transition={{
          duration: 0.5,
          delay,
          ease: [0.16, 1, 0.3, 1],
        }}
      >
        <span style={{
          fontFamily: "var(--font-display)",
          fontSize: size,
          lineHeight: 0.9,
          color,
          display: "block",
        }}>
          {text}
        </span>
      </motion.div>
    </div>
  );
}

// ============================================================
// MAIN SECTION
// ============================================================

export function MangaPivotSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { once: true, margin: "-100px" });
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  // Parallax for background elements
  const bgY = useTransform(scrollYProgress, [0, 1], ["20%", "-20%"]);
  const speedLinesScale = useTransform(scrollYProgress, [0.2, 0.5], [0.8, 1.1]);

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden"
      style={{
        background: "var(--paper)",
        minHeight: "90vh",
      }}
    >
      {/* ── LAYER 0: Paper texture ── */}
      <div className="absolute inset-0 halftone--paper" />

      {/* ── LAYER 1: Speed lines (parallax) ── */}
      <motion.div className="absolute inset-0" style={{ y: bgY, scale: speedLinesScale }}>
        <SpeedLinesCanvas count={80} />
      </motion.div>

      {/* ── LAYER 2: Diagonal panel layout ── */}
      <div className="relative z-10">

        {/* ── TOP ZONE: The problem panel (left diagonal) ── */}
        <div className="relative" style={{ height: "clamp(280px, 50vh, 400px)" }}>

          {/* Panel A: Text wall (left side, diagonal cut) */}
          <DiagonalPanel
            clipPath="polygon(0 0, 62% 0, 48% 100%, 0 100%)"
            delay={0.1}
          >
            <div
              className="absolute inset-0 flex flex-col items-center justify-center p-8"
              style={{ background: "#fff" }}
            >
              <span style={{
                fontFamily: "var(--font-label)",
                fontSize: 9,
                letterSpacing: "0.25em",
                color: "rgba(26,24,37,0.3)",
                marginBottom: 12,
              }}>THE OLD WAY</span>

              {/* Dense text block visualization */}
              <div className="space-y-1.5 opacity-40" style={{ maxWidth: 200 }}>
                {Array.from({ length: 9 }, (_, i) => (
                  <div key={i} style={{
                    height: 4,
                    width: `${50 + (i * 7) % 50}%`,
                    background: "var(--ink-on-paper)",
                    borderRadius: 1,
                  }} />
                ))}
              </div>

              <p style={{
                fontFamily: "var(--font-body)",
                fontSize: "0.7rem",
                color: "rgba(26,24,37,0.35)",
                fontStyle: "italic",
                marginTop: 10,
              }}>
                Dense. Linear. Abandoned.
              </p>
            </div>
          </DiagonalPanel>

          {/* Diagonal slash between panels */}
          <SlashLine angle={-8} position={54} delay={0.35} />

          {/* Panel B: Manga panels (right side) */}
          <DiagonalPanel
            clipPath="polygon(58% 0, 100% 0, 100% 100%, 44% 100%)"
            delay={0.25}
          >
            <div
              className="absolute inset-0 flex flex-col items-center justify-center p-8"
              style={{ background: "var(--paper-2)" }}
            >
              <span style={{
                fontFamily: "var(--font-label)",
                fontSize: 9,
                letterSpacing: "0.25em",
                color: "var(--red)",
                marginBottom: 12,
              }}>THE MANGA WAY</span>

              {/* Mini manga grid */}
              <div style={{ width: 120 }}>
                <div className="grid grid-cols-2 gap-[2px]">
                  {/* Big top panel */}
                  <div className="col-span-2 border-2 flex items-center justify-center"
                    style={{
                      borderColor: "var(--ink-on-paper)",
                      height: 36,
                      background: "#fff",
                    }}>
                    <span style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 7,
                      color: "var(--ink-on-paper)",
                    }}>INSIGHT</span>
                  </div>
                  {/* Two bottom panels */}
                  <div className="border-2 flex items-center justify-center"
                    style={{
                      borderColor: "var(--ink-on-paper)",
                      height: 44,
                      background: "#fff",
                      position: "relative",
                    }}>
                    {/* Character dot */}
                    <div style={{
                      width: 10, height: 18,
                      background: "var(--ink-on-paper)",
                      borderRadius: "50% 50% 0 0",
                    }} />
                    {/* Speech bubble */}
                    <div style={{
                      position: "absolute",
                      top: 2, right: 2,
                      background: "#fff",
                      border: "1px solid var(--ink-on-paper)",
                      borderRadius: 6,
                      padding: "1px 4px",
                      fontFamily: "var(--font-bubble)",
                      fontSize: 6,
                    }}>\u300C!\u300D</div>
                  </div>
                  <div className="border-2 flex items-center justify-center"
                    style={{
                      borderColor: "var(--ink-on-paper)",
                      height: 44,
                      background: "rgba(26,24,37,0.03)",
                    }}>
                    <span style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 6,
                      color: "var(--ink-on-paper)",
                    }}>ACTION!</span>
                  </div>
                </div>
              </div>

              <p style={{
                fontFamily: "var(--font-body)",
                fontSize: "0.7rem",
                color: "var(--ink-on-paper)",
                fontWeight: 600,
                marginTop: 10,
              }}>
                Visual. Sequential. Addictive.
              </p>
            </div>
          </DiagonalPanel>
        </div>

        {/* ── CENTER ZONE: The impact statement ── */}
        <div
          className="relative flex flex-col items-center justify-center py-16 px-4"
          style={{ minHeight: "clamp(200px, 35vh, 340px)" }}
        >
          {/* Big radial speed lines behind text */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `repeating-conic-gradient(
                from 0deg at 50% 50%,
                transparent 0deg,
                rgba(232,25,26,0.04) 0.5deg,
                transparent 1deg
              )`,
            }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 1, delay: 0.5 }}
          />

          <div className="relative z-10 text-center">
            <motion.p
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ delay: 0.4 }}
              style={{
                fontFamily: "var(--font-label)",
                fontSize: 10,
                letterSpacing: "0.3em",
                color: "rgba(26,24,37,0.3)",
                marginBottom: 8,
              }}
            >
              THE FORMAT THAT SURVIVES
            </motion.p>

            {/* "BUT" — slides up */}
            <ImpactText text="BUT" delay={0.5} size="clamp(2rem, 6vw, 3.5rem)" color="rgba(26,24,37,0.5)" />

            {/* "MANGA" — dramatic red, bigger, with slight rotation */}
            <div className="relative inline-block">
              <ImpactText text="MANGA" delay={0.65} size="clamp(3.5rem, 12vw, 8rem)" color="var(--red)" />

              {/* Red accent slash behind MANGA */}
              <motion.div
                className="absolute -z-10"
                style={{
                  top: "20%",
                  left: "-5%",
                  right: "-5%",
                  height: "60%",
                  background: "rgba(232,25,26,0.06)",
                  transform: "skewX(-5deg)",
                }}
                initial={{ scaleX: 0 }}
                animate={inView ? { scaleX: 1 } : {}}
                transition={{ duration: 0.4, delay: 0.7 }}
              />
            </div>

            {/* "WORKS." — punches up from below */}
            <ImpactText text="WORKS." delay={0.8} size="clamp(2rem, 6vw, 3.5rem)" />

            {/* Subtext */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 1.1, duration: 0.6 }}
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "clamp(0.85rem, 2.5vw, 1rem)",
                color: "rgba(26,24,37,0.55)",
                maxWidth: 460,
                margin: "16px auto 0",
                lineHeight: 1.7,
              }}
            >
              People binge 200 chapters in a weekend. Manga compresses
              knowledge into <strong>visual sequences</strong> — panels,
              pacing, emotion. Your brain processes it
              <span style={{ color: "var(--red)", fontWeight: 600 }}> 60,000× faster</span> than text.
            </motion.p>
          </div>
        </div>

        {/* ── BOTTOM ZONE: "So we built..." punchline ── */}
        <div className="relative py-10 px-4">
          {/* Horizontal manga panel border */}
          <motion.div
            className="absolute top-0 left-[8%] right-[8%] h-[3px]"
            style={{ background: "var(--ink-on-paper)" }}
            initial={{ scaleX: 0 }}
            animate={inView ? { scaleX: 1 } : {}}
            transition={{ duration: 0.5, delay: 1.2 }}
          />

          <motion.div
            className="text-center pt-8"
            initial={{ opacity: 0, y: 24 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 1.3, duration: 0.6 }}
          >
            <p style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(1rem, 3vw, 1.5rem)",
              color: "var(--ink-on-paper)",
              marginBottom: 4,
            }}>
              So we built a machine that turns
            </p>
            <p style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(1.4rem, 5vw, 2.6rem)",
              lineHeight: 1,
            }}>
              <span style={{ color: "rgba(26,24,37,0.25)" }}>any book</span>{" "}
              <span style={{ color: "var(--red)" }}>into manga.</span>
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export default MangaPivotSection;
