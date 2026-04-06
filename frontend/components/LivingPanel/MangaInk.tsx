/**
 * MangaInk.tsx — Hand-drawn manga art primitives
 * =================================================
 * SVG-based ink textures, character sketches, and panel borders
 * that actually FEEL like manga. No neon, no gradients, no slop.
 *
 * PHILOSOPHY: Manga is ink on paper.
 * - Black linework with visible brush energy
 * - Screentone dots for shading (not CSS gradients)
 * - White/cream paper, not dark mode tech aesthetic
 * - Imperfect borders that feel hand-ruled
 * - Characters are silhouettes with expressive linework
 */

import { useMemo, useRef, useEffect } from "react";
import rough from "roughjs";

// ============================================================
// PAPER TEXTURE (the foundation of everything)
// ============================================================

export function PaperTexture({ tone = "cream" }: { tone?: "cream" | "warm" | "cool" | "dark" }) {
  const colors = {
    cream: { bg: "#F2E8D5", grain: "#D4C4A8" },
    warm:  { bg: "#EDE0CC", grain: "#C8B89C" },
    cool:  { bg: "#E8E4DE", grain: "#C0BDB5" },
    dark:  { bg: "#1A1825", grain: "#2E2C3F" },
  };
  const c = colors[tone];

  return (
    <div className="absolute inset-0" style={{ background: c.bg }}>
      {/* Paper grain noise */}
      <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.35 }}>
        <defs>
          <filter id={`paper-grain-${tone}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
        <rect width="100%" height="100%" filter={`url(#paper-grain-${tone})`} opacity="0.12" />
      </svg>
    </div>
  );
}

// ============================================================
// SCREENTONE PATTERNS (the manga way to shade)
// ============================================================

export function Screentone({
  density = "medium",
  opacity = 0.15,
  className = "",
}: {
  density?: "light" | "medium" | "heavy";
  opacity?: number;
  className?: string;
}) {
  const sizes = { light: 8, medium: 5, heavy: 3 };
  const dotR = { light: 0.8, medium: 1, heavy: 1.2 };
  const s = sizes[density];
  const r = dotR[density];

  return (
    <svg className={`absolute inset-0 w-full h-full pointer-events-none ${className}`} style={{ opacity }}>
      <defs>
        <pattern id={`screentone-${density}`} width={s} height={s} patternUnits="userSpaceOnUse">
          <circle cx={s / 2} cy={s / 2} r={r} fill="#000" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#screentone-${density})`} />
    </svg>
  );
}

// ============================================================
// CROSSHATCH SHADING
// ============================================================

export function CrosshatchShading({
  angle = 45,
  spacing = 6,
  opacity = 0.12,
}: {
  angle?: number;
  spacing?: number;
  opacity?: number;
}) {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity }}>
      <defs>
        <pattern
          id={`crosshatch-${angle}-${spacing}`}
          width={spacing}
          height={spacing}
          patternUnits="userSpaceOnUse"
          patternTransform={`rotate(${angle})`}
        >
          <line x1="0" y1="0" x2="0" y2={spacing} stroke="#1A1825" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#crosshatch-${angle}-${spacing})`} />
    </svg>
  );
}

// ============================================================
// INK BORDER (slightly wobbly, like hand-ruled)
// ============================================================

export function InkBorder({
  thickness = 3,
  color = "#1A1825",
  roughness = 0.8,
}: {
  thickness?: number;
  color?: string;
  roughness?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = svgRef.current;
    // Clear previous
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const rc = rough.svg(svg);
    const w = svg.clientWidth || 800;
    const h = svg.clientHeight || 600;

    const rect = rc.rectangle(thickness / 2, thickness / 2, w - thickness, h - thickness, {
      stroke: color,
      strokeWidth: thickness,
      roughness,
      bowing: 1,
      fill: "none",
    });
    svg.appendChild(rect);
  }, [thickness, color, roughness]);

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-20"
      preserveAspectRatio="none"
    />
  );
}

// ============================================================
// MANGA CHARACTER SILHOUETTE
// ============================================================

const SILHOUETTE_PATHS: Record<string, string> = {
  // Standing figure — simple but recognizable
  standing: "M24 8 C24 4 20 0 16 0 C12 0 8 4 8 8 C8 10 9 12 11 13 L9 22 L6 32 L10 32 L12 26 L14 32 L18 32 L20 26 L22 32 L26 32 L23 22 L21 13 C23 12 24 10 24 8 Z",
  // Sitting/thinking pose
  thinking: "M20 8 C20 4 17 1 14 1 C11 1 8 4 8 8 C8 10 9 12 11 13 L10 18 L6 20 L4 28 L8 28 L10 24 L12 30 L16 30 L18 24 L20 22 L24 24 L26 22 L22 18 L20 13 C22 12 20 10 20 8 Z",
  // Action pose — leaning forward with arms extended
  action: "M18 7 C18 3 15 0 12 0 C9 0 6 3 6 7 C6 9 7 11 9 12 L6 18 L2 22 L4 24 L10 20 L8 28 L10 32 L14 24 L16 32 L20 32 L18 22 L22 18 L20 16 L16 14 L15 12 C17 11 18 9 18 7 Z",
  // Dramatic — wide stance, chest out, power pose
  dramatic: "M20 7 C20 3 17 0 14 0 C11 0 8 3 8 7 C8 9 9 11 11 12 L8 16 L3 14 L2 16 L7 20 L6 26 L4 32 L8 32 L10 28 L14 32 L18 32 L20 28 L22 32 L26 32 L24 26 L23 20 L28 16 L27 14 L22 16 L19 12 C21 11 22 9 20 7 Z",
  // Defeated — slumped, head down
  defeated: "M18 9 C18 5 16 3 14 3 C12 3 10 5 10 9 C10 11 11 12 12 13 L11 16 L9 18 L7 20 L6 26 L5 32 L9 32 L10 28 L13 32 L17 32 L18 28 L19 32 L23 32 L22 26 L21 20 L19 18 L17 16 L16 13 C17 12 18 11 18 9 Z",
  // Presenting — one arm extended forward
  presenting: "M22 8 C22 4 19 1 16 1 C13 1 10 4 10 8 C10 10 11 12 13 13 L11 18 L9 22 L7 32 L11 32 L13 26 L15 32 L19 32 L21 26 L23 32 L27 32 L25 22 L23 16 L28 12 L30 10 L28 8 L22 14 L20 13 C22 12 23 10 22 8 Z",
  // Pointing — arm pointing at something
  pointing: "M22 8 C22 4 19 0 16 0 C13 0 10 4 10 8 C10 10 11 12 13 13 L12 18 L9 22 L7 32 L11 32 L13 26 L15 32 L19 32 L21 26 L23 32 L27 32 L24 22 L22 16 L26 10 L30 6 L29 4 L24 8 L20 13 C22 12 23 10 22 8 Z",
  // Celebrating — arms up
  celebrating: "M20 8 C20 4 17 0 14 0 C11 0 8 4 8 8 C8 10 9 12 11 13 L10 16 L6 10 L4 6 L2 8 L6 14 L8 20 L6 28 L4 32 L8 32 L10 28 L14 32 L18 32 L20 28 L22 32 L24 32 L26 28 L24 20 L26 14 L30 8 L28 6 L26 10 L22 16 L19 13 C21 12 22 10 20 8 Z",
};

export function MangaCharacter({
  name,
  expression,
  pose = "standing",
  size = 64,
  ink = "#1A1825",
  showName = true,
  signatureColor,
  aura = "none",
}: {
  name: string;
  expression: string;
  pose?: string;
  size?: number;
  ink?: string;
  showName?: boolean;
  signatureColor?: string;
  aura?: string;
}) {
  const hash = (name || "Character").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const path = SILHOUETTE_PATHS[pose] || SILHOUETTE_PATHS.standing;
  const expressionMark = getExpressionMark(expression);
  const accentColor = signatureColor || ink;

  // Generate a deterministic color from character name if no signature
  const autoColor = signatureColor || `hsl(${hash % 360}, 60%, 45%)`;

  return (
    <div className="flex flex-col items-center gap-1" style={{ width: size * 1.2 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        style={{ filter: "drop-shadow(1px 1px 0 rgba(0,0,0,0.1))" }}
        role="img"
        aria-label={`${name} — ${expression}`}
      >
        {/* Aura effect behind the character */}
        {aura && aura !== "none" && (
          <AuraEffect aura={aura} color={autoColor} />
        )}
        {/* Silhouette fill */}
        <path d={path} fill={ink} stroke="none" />
        {/* Accent stripe — gives each character visual identity */}
        {signatureColor && (
          <path
            d={path}
            fill="none"
            stroke={signatureColor}
            strokeWidth="0.6"
            opacity="0.7"
          />
        )}
        {/* Expression marks near the head */}
        {expressionMark && (
          <g transform="translate(16, 4)">
            {expressionMark}
          </g>
        )}
      </svg>
      {showName && (
        <span
          style={{
            fontSize: Math.max(8, size * 0.14),
            fontFamily: "var(--font-label, monospace)",
            color: signatureColor || ink,
            letterSpacing: "0.12em",
            textTransform: "uppercase" as const,
            opacity: 0.7,
          }}
        >
          {name}
        </span>
      )}
    </div>
  );
}

/** Renders a subtle aura glow behind a character silhouette. */
function AuraEffect({ aura, color }: { aura: string; color: string }) {
  const auraColors: Record<string, string[]> = {
    energy:  [color, "transparent"],
    calm:    ["#88bbff", "transparent"],
    dark:    ["#2a1a3a", "transparent"],
    fire:    ["#E8191A", "#ff6600", "transparent"],
    ice:     ["#66ccff", "#aaddff", "transparent"],
  };
  const stops = auraColors[aura] || auraColors.energy;
  const id = `aura-${aura}-${color.replace('#', '')}`;
  return (
    <>
      <defs>
        <radialGradient id={id} cx="50%" cy="50%" r="60%">
          {stops.map((c, i) => (
            <stop
              key={i}
              offset={`${(i / (stops.length - 1)) * 100}%`}
              stopColor={c}
              stopOpacity={i === stops.length - 1 ? 0 : 0.25}
            />
          ))}
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="18" fill={`url(#${id})`} />
    </>
  );
}

function getExpressionMark(expression: string): React.ReactNode | null {
  switch (expression || "neutral") {
    case "shocked":
      return (
        <>
          <line x1="-6" y1="-6" x2="-4" y2="-8" stroke="#fff" strokeWidth="1.5" />
          <line x1="6" y1="-6" x2="8" y2="-8" stroke="#fff" strokeWidth="1.5" />
        </>
      );
    case "angry":
      return (
        <>
          <line x1="-5" y1="-3" x2="-2" y2="-1" stroke="#fff" strokeWidth="1.2" />
          <line x1="5" y1="-3" x2="2" y2="-1" stroke="#fff" strokeWidth="1.2" />
        </>
      );
    case "curious":
    case "thoughtful":
      return (
        <text x="8" y="-6" fill="#fff" fontSize="6" fontFamily="var(--font-bubble)">?</text>
      );
    case "excited":
      return (
        <text x="8" y="-6" fill="#fff" fontSize="6" fontFamily="var(--font-bubble)">!</text>
      );
    case "wise":
      return (
        <circle cx="0" cy="-2" r="2" fill="none" stroke="#fff" strokeWidth="0.8" opacity="0.6" />
      );
    case "sad":
      return (
        <path d="M-3 0 Q0 3 3 0" fill="none" stroke="#fff" strokeWidth="0.8" />
      );
    case "determined":
      return (
        <>
          <line x1="-5" y1="-4" x2="-2" y2="-3" stroke="#fff" strokeWidth="1.4" />
          <line x1="5" y1="-4" x2="2" y2="-3" stroke="#fff" strokeWidth="1.4" />
          <line x1="-2" y1="2" x2="2" y2="2" stroke="#fff" strokeWidth="0.8" />
        </>
      );
    case "smirk":
      return (
        <path d="M-2 1 Q1 3 4 0" fill="none" stroke="#fff" strokeWidth="0.8" />
      );
    case "fearful":
      return (
        <>
          <circle cx="-3" cy="-2" r="1.5" fill="none" stroke="#fff" strokeWidth="0.6" />
          <circle cx="3" cy="-2" r="1.5" fill="none" stroke="#fff" strokeWidth="0.6" />
          <path d="M-2 2 Q0 4 2 2" fill="none" stroke="#fff" strokeWidth="0.6" />
        </>
      );
    case "triumphant":
      return (
        <>
          <text x="0" y="-8" fill="#fff" fontSize="5" fontFamily="var(--font-bubble)" textAnchor="middle">★</text>
          <line x1="-5" y1="-3" x2="-2" y2="-4" stroke="#fff" strokeWidth="1" />
          <line x1="5" y1="-3" x2="2" y2="-4" stroke="#fff" strokeWidth="1" />
        </>
      );
    default:
      return null;
  }
}

// ============================================================
// MANGA SPEED LINES (drawn, not CSS)
// ============================================================

export function MangaSpeedLines({
  direction = "radial",
  intensity = 0.5,
  ink = "#1A1825",
}: {
  direction?: "radial" | "horizontal" | "vertical";
  intensity?: number;
  ink?: string;
}) {
  const lines = useMemo(() => {
    const count = Math.floor(20 + intensity * 30);
    return Array.from({ length: count }, (_, i) => {
      const seed = i * 137.508; // golden angle
      if (direction === "radial") {
        const angle = (i / count) * Math.PI * 2;
        const innerR = 80 + (seed % 40);
        const outerR = 300 + (seed % 200);
        return {
          x1: 400 + Math.cos(angle) * innerR,
          y1: 300 + Math.sin(angle) * innerR,
          x2: 400 + Math.cos(angle) * outerR,
          y2: 300 + Math.sin(angle) * outerR,
          sw: 0.3 + (seed % 3) * 0.4,
        };
      } else if (direction === "horizontal") {
        const y = (i / count) * 600;
        return {
          x1: 0, y1: y + (seed % 8) - 4,
          x2: 800, y2: y + (seed % 8) - 4,
          sw: 0.2 + (seed % 2) * 0.3,
        };
      } else {
        const x = (i / count) * 800;
        return {
          x1: x + (seed % 8) - 4, y1: 0,
          x2: x + (seed % 8) - 4, y2: 600,
          sw: 0.2 + (seed % 2) * 0.3,
        };
      }
    });
  }, [direction, intensity]);

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      style={{ opacity: intensity * 0.4 }}
    >
      {lines.map((l, i) => (
        <line
          key={i}
          x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke={ink}
          strokeWidth={l.sw}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

// ============================================================
// INK SPLASH / IMPACT BURST
// ============================================================

export function InkSplash({
  x = "50%",
  y = "50%",
  size = 60,
  ink = "#1A1825",
  opacity = 0.3,
}: {
  x?: string; y?: string;
  size?: number; ink?: string; opacity?: number;
}) {
  const splatters = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2 + (i * 0.3);
      const dist = size * (0.3 + Math.random() * 0.7);
      const r = 2 + Math.random() * 6;
      return { cx: Math.cos(angle) * dist, cy: Math.sin(angle) * dist, r };
    });
  }, [size]);

  return (
    <svg
      className="absolute pointer-events-none"
      style={{ left: x, top: y, transform: "translate(-50%, -50%)", opacity }}
      width={size * 3} height={size * 3}
      viewBox={`${-size * 1.5} ${-size * 1.5} ${size * 3} ${size * 3}`}
    >
      <circle cx={0} cy={0} r={size * 0.2} fill={ink} />
      {splatters.map((s, i) => (
        <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={ink} />
      ))}
    </svg>
  );
}

// ============================================================
// MANGA SPEECH BUBBLE (hand-drawn border)
// ============================================================

export function MangaBubble({
  children,
  variant = "speech",
  tail = "bottom",
  maxWidth = 240,
  className = "",
}: {
  children: React.ReactNode;
  variant?: "speech" | "thought" | "shout" | "whisper" | "narrator" | "internal";
  tail?: "left" | "right" | "bottom" | "top" | "none";
  maxWidth?: number;
  className?: string;
}) {
  const styles = getBubbleStyles(variant);

  return (
    <div
      className={`relative ${className}`}
      style={{
        maxWidth,
        padding: variant === "shout" ? "14px 18px" : "10px 14px",
        borderRadius: variant === "thought" ? "50% / 30%" : variant === "shout" ? 2 : 14,
        background: styles.bg,
        border: styles.border,
        fontFamily: styles.font,
        fontSize: variant === "shout" ? "1.1em" : variant === "whisper" ? "0.85em" : "0.95em",
        fontStyle: variant === "whisper" ? "italic" : "normal",
        fontWeight: variant === "shout" ? 700 : 400,
        color: styles.color,
        lineHeight: 1.45,
        boxShadow: variant === "shout" ? "3px 3px 0 #1A1825" : "1px 1px 0 rgba(0,0,0,0.08)",
        // 2D: Prevent speech bubbles from overflowing
        overflow: "hidden" as const,
        maxHeight: 180,
        wordBreak: "break-word" as const,
      }}
    >
      {children}
      {tail !== "none" && variant !== "narrator" && (
        <BubbleTailSVG direction={tail} variant={variant} />
      )}
    </div>
  );
}

function getBubbleStyles(variant: string) {
  switch (variant) {
    case "thought":
      return { bg: "#fff", border: "2px dashed #555", font: "var(--font-body)", color: "#333" };
    case "shout":
      return { bg: "#fff", border: "3px solid #1A1825", font: "var(--font-display)", color: "#1A1825" };
    case "whisper":
      return { bg: "rgba(255,255,255,0.85)", border: "1px solid #aaa", font: "var(--font-body)", color: "#666" };
    case "narrator":
      return { bg: "#1A1825", border: "2px solid #444", font: "var(--font-label)", color: "#F2E8D5" };
    default: // speech
      return { bg: "#fff", border: "2.5px solid #1A1825", font: "var(--font-bubble)", color: "#1A1825" };
  }
}

function BubbleTailSVG({ direction, variant }: { direction: string; variant: string }) {
  const isThought = variant === "thought";

  if (isThought) {
    // Thought bubbles use small circles instead of a tail
    const pos: Record<string, React.CSSProperties> = {
      bottom: { bottom: -16, left: 24 },
      top: { top: -16, left: 24 },
      left: { left: -16, top: "40%" },
      right: { right: -16, top: "40%" },
    };
    return (
      <div className="absolute" style={{ ...pos[direction] }}>
        <svg width="16" height="16">
          <circle cx="4" cy="12" r="3" fill="#fff" stroke="#555" strokeWidth="1.5" strokeDasharray="2 2" />
          <circle cx="12" cy="4" r="2" fill="#fff" stroke="#555" strokeWidth="1" strokeDasharray="2 2" />
        </svg>
      </div>
    );
  }

  // Solid tail for speech bubbles
  const positions: Record<string, React.CSSProperties> = {
    bottom: { bottom: -12, left: 22 },
    top: { top: -12, left: 22 },
    left: { left: -12, top: "35%" },
    right: { right: -12, top: "35%" },
  };

  const rotations: Record<string, number> = {
    bottom: 0, top: 180, left: 90, right: -90,
  };

  return (
    <div className="absolute" style={{ ...positions[direction] }}>
      <svg width="20" height="14" viewBox="0 0 20 14" style={{ transform: `rotate(${rotations[direction]}deg)` }}>
        <polygon points="2,0 10,14 18,0" fill="#fff" stroke="#1A1825" strokeWidth="2.5" strokeLinejoin="round" />
        {/* Cover the top edge where it meets the bubble */}
        <rect x="0" y="0" width="20" height="3" fill="#fff" />
      </svg>
    </div>
  );
}

// ============================================================
// ONOMATOPOEIA / SOUND EFFECTS (manga SFX text)
// ============================================================

export function SoundEffect({
  text,
  x = "50%",
  y = "50%",
  size = 48,
  rotate = -12,
  ink = "#1A1825",
  outline = true,
}: {
  text: string;
  x?: string; y?: string;
  size?: number;
  rotate?: number;
  ink?: string;
  outline?: boolean;
}) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: x, top: y,
        transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
        fontFamily: "var(--font-display)",
        fontSize: size,
        color: outline ? "#fff" : ink,
        WebkitTextStroke: outline ? `2px ${ink}` : undefined,
        textShadow: outline ? `3px 3px 0 ${ink}` : undefined,
        letterSpacing: "-0.02em",
        lineHeight: 0.9,
        userSelect: "none" as const,
      }}
    >
      {text}
    </div>
  );
}
