/**
 * LayerRenderers.tsx — Individual layer type renderers
 * =====================================================
 * Each layer type from the DSL gets its own renderer component.
 * These are pure presentational components — the animation system
 * controls their motion state externally.
 */

import { useState, useEffect, useRef } from "react";
import type {
  BackgroundLayer,
  SpriteLayer,
  TextLayer,
  SpeechBubbleLayer,
  EffectLayer,
  ShapeLayer,
  DataBlockLayer,
  SceneTransitionLayer,
} from "@/lib/living-panel-types";
import { createTypewriter } from "./AnimationSystem";

// ============================================================
// SHARED CONSTANTS
// ============================================================

const CHAR_COLORS = [
  "#00bfa5", "#f5a623", "#e8191a", "#bb86fc",
  "#3d7bff", "#ff6b6b", "#00f5ff", "#4caf50",
];

const EXPRESSION_EMOJI: Record<string, string> = {
  neutral: "😐", curious: "🤔", shocked: "😲", determined: "😤",
  wise: "🧘", thoughtful: "💭", excited: "✨", sad: "😔",
  angry: "😠", smirk: "😏", fearful: "😨", triumphant: "😎",
};

function getCharColor(name: string): string {
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return CHAR_COLORS[hash % CHAR_COLORS.length];
}

// ============================================================
// BACKGROUND RENDERER
// ============================================================

export function BackgroundRenderer({ layer }: { layer: BackgroundLayer }) {
  const { props } = layer;
  const angle = props.gradientAngle ?? 160;
  const gradient = props.gradient
    ? `linear-gradient(${angle}deg, ${props.gradient.join(", ")})`
    : undefined;

  return (
    <div className="absolute inset-0" style={{ background: gradient || "#0a0a1a" }}>
      {/* Pattern overlay */}
      {props.pattern && (
        <div
          className="absolute inset-0"
          style={{
            opacity: props.patternOpacity ?? 0.1,
            backgroundImage: getPatternCSS(props.pattern, props.patternColor || "#ffffff"),
            backgroundSize: props.pattern === "halftone" ? "16px 16px" : "24px 24px",
          }}
        />
      )}
      {/* Image */}
      {props.image && (
        <img
          src={props.image}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: 0.6 }}
        />
      )}
    </div>
  );
}

function getPatternCSS(pattern: string, color: string): string {
  switch (pattern) {
    case "halftone":
      return `radial-gradient(circle, ${color}40 1px, transparent 1px)`;
    case "crosshatch":
      return `repeating-linear-gradient(45deg, ${color}15, ${color}15 1px, transparent 1px, transparent 8px), repeating-linear-gradient(-45deg, ${color}15, ${color}15 1px, transparent 1px, transparent 8px)`;
    case "dots":
      return `radial-gradient(circle, ${color}30 2px, transparent 2px)`;
    case "lines":
      return `repeating-linear-gradient(0deg, ${color}10, ${color}10 1px, transparent 1px, transparent 6px)`;
    case "noise":
      return `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;
    default:
      return "none";
  }
}

// ============================================================
// SPRITE RENDERER
// ============================================================

export function SpriteRenderer({ layer }: { layer: SpriteLayer }) {
  const { props } = layer;
  const color = getCharColor(props.character);
  const initial = props.character.charAt(0).toUpperCase();
  const emoji = EXPRESSION_EMOJI[props.expression] || "";
  const size = props.size || 64;

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative flex items-center justify-center rounded-full border-2"
        style={{
          width: size,
          height: size,
          background: props.silhouette ? "#111" : `${color}18`,
          borderColor: props.silhouette ? "#333" : `${color}80`,
          color: props.silhouette ? "#333" : color,
          fontSize: size * 0.4,
          fontFamily: "var(--font-display, sans-serif)",
          fontWeight: 700,
          boxShadow: props.glowColor ? `0 0 20px ${props.glowColor}` : undefined,
        }}
      >
        {initial}
        {emoji && (
          <span
            className="absolute -top-1 -right-1"
            style={{ fontSize: size * 0.25 }}
          >
            {emoji}
          </span>
        )}
      </div>
      {(props.showName !== false) && (
        <span
          style={{
            fontSize: "8px",
            color: "rgba(255,255,255,0.4)",
            letterSpacing: "0.1em",
            fontFamily: "var(--font-label, monospace)",
            textTransform: "uppercase",
          }}
        >
          {props.character}
        </span>
      )}
    </div>
  );
}

// ============================================================
// TEXT RENDERER
// ============================================================

export function TextRenderer({
  layer,
  isAnimating,
}: {
  layer: TextLayer;
  isAnimating?: boolean;
}) {
  const { props } = layer;
  const [visibleText, setVisibleText] = useState(
    props.typewriter ? "" : props.content
  );
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (props.typewriter && isAnimating) {
      cleanupRef.current = createTypewriter(
        props.content,
        props.typewriterSpeed || 40,
        setVisibleText,
      );
      return () => cleanupRef.current?.();
    } else if (!props.typewriter) {
      setVisibleText(props.content);
    }
  }, [props.content, props.typewriter, props.typewriterSpeed, isAnimating]);

  const fontMap: Record<string, string> = {
    display: "var(--font-display, 'Bebas Neue', sans-serif)",
    body: "var(--font-body, 'Inter', sans-serif)",
    label: "var(--font-label, 'JetBrains Mono', monospace)",
    mono: "'JetBrains Mono', monospace",
  };

  return (
    <div
      style={{
        fontSize: props.fontSize || "1rem",
        fontFamily: fontMap[props.fontFamily || "body"],
        color: props.color || "#ffffff",
        textAlign: props.textAlign || "left",
        maxWidth: props.maxWidth || "100%",
        lineHeight: props.lineHeight || 1.4,
        textShadow: props.textShadow,
        letterSpacing: props.letterSpacing,
      }}
    >
      {visibleText}
      {props.typewriter && visibleText.length < props.content.length && (
        <span className="animate-pulse">█</span>
      )}
    </div>
  );
}

// ============================================================
// SPEECH BUBBLE RENDERER
// ============================================================

export function SpeechBubbleRenderer({
  layer,
  isAnimating,
}: {
  layer: SpeechBubbleLayer;
  isAnimating?: boolean;
}) {
  const { props } = layer;
  const [visibleText, setVisibleText] = useState(
    props.typewriter ? "" : props.text
  );
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (props.typewriter && isAnimating) {
      cleanupRef.current = createTypewriter(
        props.text,
        props.typewriterSpeed || 40,
        setVisibleText,
      );
      return () => cleanupRef.current?.();
    } else if (!props.typewriter) {
      setVisibleText(props.text);
    }
  }, [props.text, props.typewriter, props.typewriterSpeed, isAnimating]);

  const bubbleStyles = getBubbleStyle(props.style);

  return (
    <div
      className="relative"
      style={{
        maxWidth: props.maxWidth || 240,
        padding: "12px 16px",
        borderRadius: props.style === "thought" ? "50% / 20%" : "12px",
        background: props.backgroundColor || bubbleStyles.bg,
        border: `2px solid ${props.borderColor || bubbleStyles.border}`,
        color: props.textColor || bubbleStyles.text,
        fontSize: props.style === "shout" ? "1.1em" : "0.9em",
        fontWeight: props.style === "shout" ? 700 : 400,
        fontStyle: props.style === "whisper" ? "italic" : "normal",
        fontFamily: props.style === "narrator" ? "var(--font-label, monospace)" : "var(--font-body, sans-serif)",
        lineHeight: 1.4,
      }}
    >
      {props.character && props.style !== "narrator" && (
        <span
          style={{
            fontSize: "9px",
            color: getCharColor(props.character),
            letterSpacing: "0.1em",
            fontFamily: "var(--font-label, monospace)",
            textTransform: "uppercase",
            display: "block",
            marginBottom: 4,
          }}
        >
          {props.character}
        </span>
      )}
      {visibleText}
      {props.typewriter && visibleText.length < props.text.length && (
        <span className="animate-pulse">█</span>
      )}
      {/* Tail */}
      {props.tailDirection !== "none" && (
        <BubbleTail
          direction={props.tailDirection || "bottom"}
          color={props.backgroundColor || bubbleStyles.bg}
          borderColor={props.borderColor || bubbleStyles.border}
        />
      )}
    </div>
  );
}

function getBubbleStyle(style: string) {
  const styles: Record<string, { bg: string; border: string; text: string }> = {
    speech:   { bg: "rgba(255,255,255,0.95)", border: "rgba(0,0,0,0.3)", text: "#111" },
    thought:  { bg: "rgba(200,200,255,0.15)", border: "rgba(150,150,255,0.3)", text: "#ccc" },
    shout:    { bg: "rgba(255,50,50,0.2)", border: "rgba(255,80,80,0.6)", text: "#ff4444" },
    whisper:  { bg: "rgba(100,100,100,0.15)", border: "rgba(100,100,100,0.2)", text: "#999" },
    narrator: { bg: "rgba(0,0,0,0.7)", border: "rgba(100,100,255,0.4)", text: "#8888ff" },
  };
  return styles[style] || styles.speech;
}

function BubbleTail({
  direction,
  color,
  borderColor,
}: {
  direction: string;
  color: string;
  borderColor: string;
}) {
  const positions: Record<string, React.CSSProperties> = {
    bottom: { bottom: -8, left: "30%", borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderTop: `8px solid ${color}` },
    top:    { top: -8, left: "30%", borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderBottom: `8px solid ${color}` },
    left:   { left: -8, top: "40%", borderTop: "8px solid transparent", borderBottom: "8px solid transparent", borderRight: `8px solid ${color}` },
    right:  { right: -8, top: "40%", borderTop: "8px solid transparent", borderBottom: "8px solid transparent", borderLeft: `8px solid ${color}` },
  };

  return (
    <div
      className="absolute"
      style={{ width: 0, height: 0, ...positions[direction] }}
    />
  );
}

// ============================================================
// EFFECT RENDERER
// ============================================================

export function EffectRenderer({ layer }: { layer: EffectLayer }) {
  const { props } = layer;

  switch (props.effect) {
    case "speed_lines":
      return <SpeedLinesEffect color={props.color} count={props.count} intensity={props.intensity} />;
    case "particles":
      return <ParticlesEffect color={props.color} count={props.count} direction={props.direction} />;
    case "sparkle":
      return <SparkleEffect color={props.color} count={props.count} />;
    case "vignette":
      return <VignetteEffect color={props.color} intensity={props.intensity} />;
    case "impact_burst":
      return <ImpactBurstEffect color={props.color} />;
    case "screen_shake":
      return null; // handled by parent container animation
    default:
      return null;
  }
}

function SpeedLinesEffect({ color = "#00f5ff", count = 24, intensity = 0.5 }: {
  color?: string; count?: number; intensity?: number;
}) {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * 360 * Math.PI / 180;
        return (
          <line
            key={i}
            x1={400} y1={300}
            x2={400 + Math.cos(angle) * 900}
            y2={300 + Math.sin(angle) * 900}
            stroke={color}
            strokeWidth={0.4 + (i % 3) * 0.4}
            opacity={intensity * 0.15}
          />
        );
      })}
    </svg>
  );
}

function ParticlesEffect({ color = "#ffffff", count = 20, direction = "up" }: {
  color?: string; count?: number; direction?: string;
}) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: count }, (_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 3;
        const duration = 2 + Math.random() * 3;
        const size = 2 + Math.random() * 4;

        return (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${left}%`,
              bottom: direction === "up" ? "-10px" : undefined,
              top: direction === "down" ? "-10px" : undefined,
              width: size,
              height: size,
              background: color,
              opacity: 0.3 + Math.random() * 0.4,
              animation: `particle-${direction || "up"} ${duration}s ${delay}s infinite linear`,
            }}
          />
        );
      })}
    </div>
  );
}

function SparkleEffect({ color = "#ffd700", count = 12 }: {
  color?: string; count?: number;
}) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: count }, (_, i) => {
        const left = 10 + Math.random() * 80;
        const top = 10 + Math.random() * 80;
        const delay = Math.random() * 2;
        const size = 4 + Math.random() * 8;

        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: size,
              height: size,
              color: color,
              fontSize: size * 2,
              animation: `sparkle-twinkle 1.5s ${delay}s infinite ease-in-out`,
            }}
          >
            ✨
          </div>
        );
      })}
    </div>
  );
}

function VignetteEffect({ color = "#000000", intensity = 0.6 }: {
  color?: string; intensity?: number;
}) {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background: `radial-gradient(ellipse at center, transparent 40%, ${color} 100%)`,
        opacity: intensity,
      }}
    />
  );
}

function ImpactBurstEffect({ color = "#ffffff" }: { color?: string }) {
  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      <div
        className="rounded-full"
        style={{
          width: 120,
          height: 120,
          background: `radial-gradient(circle, ${color}60 0%, transparent 70%)`,
          animation: "impact-burst 0.6s ease-out forwards",
        }}
      />
    </div>
  );
}

// ============================================================
// SHAPE RENDERER
// ============================================================

export function ShapeRenderer({ layer }: { layer: ShapeLayer }) {
  const { props } = layer;
  const w = typeof layer.width === "number" ? layer.width : 100;
  const h = typeof layer.height === "number" ? layer.height : 100;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {props.shape === "circle" && (
        <circle
          cx={w / 2} cy={h / 2} r={props.radius || w / 2}
          fill={props.fill || "none"}
          stroke={props.stroke || "#ffffff"}
          strokeWidth={props.strokeWidth || 2}
          strokeDasharray={props.dash}
        />
      )}
      {props.shape === "rect" && (
        <rect
          x={0} y={0} width={w} height={h}
          fill={props.fill || "none"}
          stroke={props.stroke || "#ffffff"}
          strokeWidth={props.strokeWidth || 2}
          strokeDasharray={props.dash}
        />
      )}
      {props.shape === "line" && (
        <line
          x1={0} y1={h / 2} x2={w} y2={h / 2}
          stroke={props.stroke || "#ffffff"}
          strokeWidth={props.strokeWidth || 2}
          strokeDasharray={props.dash}
        />
      )}
    </svg>
  );
}

// ============================================================
// DATA BLOCK RENDERER
// ============================================================

export function DataBlockRenderer({
  layer,
  isAnimating,
}: {
  layer: DataBlockLayer;
  isAnimating?: boolean;
}) {
  const { props } = layer;
  const accent = props.accentColor || "#00f5ff";

  return (
    <div className="flex flex-col gap-2 w-full" style={{ maxWidth: 400 }}>
      {props.items.map((item, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-2 border"
          style={{
            borderColor: `${accent}30`,
            background: item.highlight ? `${accent}15` : `${accent}08`,
            animation: isAnimating && props.animateIn === "stagger"
              ? `stagger-in 0.4s ${(props.staggerDelay || 200) * i}ms both ease-out`
              : undefined,
          }}
        >
          {props.showIndex && (
            <span
              style={{
                color: accent,
                fontFamily: "var(--font-display, sans-serif)",
                fontSize: "1.1em",
                fontWeight: 700,
                minWidth: 20,
              }}
            >
              {i + 1}
            </span>
          )}
          {item.icon && <span>{item.icon}</span>}
          <div>
            <span
              style={{
                color: "rgba(255,255,255,0.85)",
                fontFamily: "var(--font-body, sans-serif)",
                fontSize: "0.9em",
              }}
            >
              {item.label}
            </span>
            {item.value && (
              <span
                style={{
                  color: accent,
                  fontFamily: "var(--font-label, monospace)",
                  fontSize: "0.8em",
                  marginLeft: 8,
                }}
              >
                {item.value}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// SCENE TRANSITION RENDERER
// ============================================================

export function SceneTransitionRenderer({ layer }: { layer: SceneTransitionLayer }) {
  const { props } = layer;

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex items-center gap-4">
        <div
          className="h-px w-16"
          style={{
            background: `linear-gradient(90deg, transparent, ${props.color || "#ffffff"})`,
          }}
        />
        {props.text && (
          <span
            style={{
              color: props.color || "rgba(255,255,255,0.4)",
              fontSize: "9px",
              letterSpacing: "0.2em",
              fontFamily: "var(--font-label, monospace)",
              textTransform: "uppercase",
            }}
          >
            {props.text}
          </span>
        )}
        <div
          className="h-px w-16"
          style={{
            background: `linear-gradient(90deg, ${props.color || "#ffffff"}, transparent)`,
          }}
        />
      </div>
    </div>
  );
}
