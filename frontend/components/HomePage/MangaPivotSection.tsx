"use client";

/**
 * MangaPivotSection.tsx — "BUT MANGA WORKS"
 * ============================================
 * A manga-page-style section with:
 * - Side-by-side comparison (text vs manga) with diagonal divider
 * - Speed lines radiating from impact
 * - Text that PUNCHES onto the screen
 */

import { useRef, useEffect } from "react";
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
// COMPARISON PANELS — grid layout with diagonal SVG divider
// ============================================================

function ComparisonPanels() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <div ref={ref} className="max-w-5xl mx-auto px-4 py-12">
      <div
        className="relative grid grid-cols-1 md:grid-cols-2 overflow-hidden"
        style={{ border: "3px solid var(--ink-on-paper)" }}
      >
        {/* ── LEFT: The Old Way ── */}
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center justify-center p-8 md:p-10"
          style={{ background: "#fff", minHeight: 280 }}
        >
          <span style={{
            fontFamily: "var(--font-label)",
            fontSize: 10,
            letterSpacing: "0.25em",
            color: "rgba(26,24,37,0.3)",
            marginBottom: 16,
          }}>THE OLD WAY</span>

          {/* Dense text block visualization */}
          <div className="space-y-2 w-full" style={{ maxWidth: 220 }}>
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="flex gap-1.5">
                {Array.from({ length: 2 + (i % 3) }, (_, j) => (
                  <div key={j} style={{
                    height: 5,
                    flex: `${1 + ((i + j) % 3)}`,
                    background: `rgba(26,24,37,${0.06 + ((i * 3 + j * 7) % 10) * 0.008})`,
                    borderRadius: 1,
                  }} />
                ))}
              </div>
            ))}
          </div>

          <p style={{
            fontFamily: "var(--font-body)",
            fontSize: "0.8rem",
            color: "rgba(26,24,37,0.35)",
            fontStyle: "italic",
            marginTop: 16,
          }}>
            Dense. Linear. Abandoned.
          </p>
        </motion.div>

        {/* ── DIAGONAL DIVIDER (SVG) ── */}
        <div
          className="absolute top-0 bottom-0 left-1/2 z-10 hidden md:block"
          style={{ width: 40, marginLeft: -20 }}
        >
          <svg
            viewBox="0 0 40 400"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full"
          >
            <motion.polygon
              points="0,0 40,0 20,400 0,400"
              fill="#fff"
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ delay: 0.3 }}
            />
            <motion.line
              x1="20" y1="0" x2="10" y2="400"
              stroke="var(--ink-on-paper)"
              strokeWidth="3"
              initial={{ pathLength: 0 }}
              animate={inView ? { pathLength: 1 } : {}}
              transition={{ duration: 0.6, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
            />
          </svg>
        </div>

        {/* Mobile horizontal divider */}
        <motion.div
          className="md:hidden h-[3px] w-full"
          style={{ background: "var(--ink-on-paper)" }}
          initial={{ scaleX: 0 }}
          animate={inView ? { scaleX: 1 } : {}}
          transition={{ duration: 0.4, delay: 0.3 }}
        />

        {/* ── RIGHT: The Manga Way ── */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center justify-center p-8 md:p-10"
          style={{ background: "var(--paper-2)", minHeight: 280 }}
        >
          <span style={{
            fontFamily: "var(--font-label)",
            fontSize: 10,
            letterSpacing: "0.25em",
            color: "var(--red)",
            marginBottom: 16,
          }}>THE MANGA WAY</span>

          {/* Actual manga page layout */}
          <div style={{
            width: "100%",
            maxWidth: 200,
            border: "3px solid var(--ink-on-paper)",
            background: "#fff",
            overflow: "hidden",
          }}>
            {/* Panel 1: Wide top — character splash */}
            <div style={{
              borderBottom: "2.5px solid var(--ink-on-paper)",
              height: 100,
              position: "relative",
              overflow: "hidden",
              background: "linear-gradient(135deg, #2c3260 0%, #1f2440 100%)",
            }}>
              <img
                src="/manga-character.svg"
                alt=""
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: "90%",
                  height: "auto",
                }}
              />
              {/* Narrator box */}
              <div style={{
                position: "absolute",
                top: 4, left: 4,
                background: "#1A1825",
                color: "#F5A623",
                fontFamily: "var(--font-label)",
                fontSize: 6,
                letterSpacing: "0.12em",
                padding: "2px 6px",
                border: "1px solid #F5A623",
              }}>CH.03</div>
            </div>

            {/* Panel row: 2 columns */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              borderBottom: "2.5px solid var(--ink-on-paper)",
              height: 65,
            }}>
              {/* Panel 2: Character + speech */}
              <div style={{
                borderRight: "2.5px solid var(--ink-on-paper)",
                position: "relative",
                background: "#fff",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                overflow: "hidden",
              }}>
                <div style={{
                  width: 22, height: 32,
                  background: "var(--ink-on-paper)",
                  borderRadius: "50% 50% 10% 10%",
                  marginBottom: -5,
                }} />
                {/* Speech bubble */}
                <div style={{
                  position: "absolute",
                  top: 4, right: 4,
                  background: "#fff",
                  border: "1.5px solid var(--ink-on-paper)",
                  borderRadius: 10,
                  padding: "3px 6px",
                  fontFamily: "var(--font-bubble)",
                  fontSize: 8,
                  color: "var(--ink-on-paper)",
                  lineHeight: 1.2,
                }}>
                  This is<br/>the key!
                </div>
              </div>

              {/* Panel 3: Action with speed lines */}
              <div style={{
                position: "relative",
                background: "#fff",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <div style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: `repeating-conic-gradient(
                    from 0deg at 50% 50%,
                    transparent 0deg,
                    rgba(26,24,37,0.06) 0.8deg,
                    transparent 1.6deg
                  )`,
                }} />
                <span style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 10,
                  color: "var(--ink-on-paper)",
                  position: "relative",
                  zIndex: 1,
                  textShadow: "0 0 4px #fff, 0 0 8px #fff",
                }}>BOOM!</span>
              </div>
            </div>

            {/* Panel 4: Bottom narration */}
            <div style={{
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#fff",
            }}>
              <span style={{
                fontFamily: "var(--font-body)",
                fontSize: 7,
                fontStyle: "italic",
                color: "rgba(26,24,37,0.5)",
                textAlign: "center",
                lineHeight: 1.3,
              }}>
                Knowledge compressed<br/>into visual memory.
              </span>
            </div>
          </div>

          <p style={{
            fontFamily: "var(--font-body)",
            fontSize: "0.8rem",
            color: "var(--ink-on-paper)",
            fontWeight: 600,
            marginTop: 12,
          }}>
            Visual. Sequential. Addictive.
          </p>
        </motion.div>
      </div>
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
      {/* Paper texture */}
      <div className="absolute inset-0 halftone--paper" />

      {/* Speed lines (parallax) */}
      <motion.div className="absolute inset-0" style={{ y: bgY, scale: speedLinesScale }}>
        <SpeedLinesCanvas count={80} />
      </motion.div>

      {/* Content */}
      <div className="relative z-10">

        {/* Comparison panels */}
        <ComparisonPanels />

        {/* Impact statement */}
        <div
          className="relative flex flex-col items-center justify-center py-16 px-4"
          style={{ minHeight: "clamp(200px, 35vh, 340px)" }}
        >
          {/* Radial speed lines behind text */}
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

            <ImpactText text="BUT" delay={0.5} size="clamp(2rem, 6vw, 3.5rem)" color="rgba(26,24,37,0.5)" />

            <div className="relative inline-block">
              <ImpactText text="MANGA" delay={0.65} size="clamp(3.5rem, 12vw, 8rem)" color="var(--red)" />
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

            <ImpactText text="WORKS." delay={0.8} size="clamp(2rem, 6vw, 3.5rem)" />

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

        {/* "So we built..." punchline */}
        <div className="relative py-10 px-4">
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
