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
    case "manga_screen":
      return `repeating-linear-gradient(45deg, ${color}08, ${color}08 2px, transparent 2px, transparent 6px)`;
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
// IMAGE RENDERER
// ============================================================

import type { ImageLayer } from "@/lib/living-panel-types";

export function ImageRenderer({ layer }: { layer: ImageLayer }) {
  const { props } = layer;
  return (
    <img
      src={props.src}
      alt={props.alt || ""}
      className="w-full h-full"
      style={{
        objectFit: props.objectFit || "cover",
        filter: props.filter,
        mixBlendMode: (props.blendMode as any) || "normal",
      }}
    />
  );
}

// ============================================================
// LAYER CONTENT DISPATCHER
// ============================================================

import type { Layer } from "@/lib/living-panel-types";
import {
  EffectRenderer,
  ShapeRenderer,
  DataBlockRenderer,
  SceneTransitionRenderer,
} from "./EffectRenderers";

// Re-export for other consumers
export {
  EffectRenderer,
  ShapeRenderer,
  DataBlockRenderer,
  SceneTransitionRenderer,
};

export function LayerContent({
  layer,
  isAnimating,
}: {
  layer: Layer;
  isAnimating?: boolean;
}) {
  switch (layer.type) {
    case "background":
      return <BackgroundRenderer layer={layer} />;
    case "sprite":
      return <SpriteRenderer layer={layer} />;
    case "text":
      return <TextRenderer layer={layer} isAnimating={isAnimating} />;
    case "speech_bubble":
      return <SpeechBubbleRenderer layer={layer} isAnimating={isAnimating} />;
    case "effect":
      return <EffectRenderer layer={layer} />;
    case "shape":
      return <ShapeRenderer layer={layer} />;
    case "data_block":
      return <DataBlockRenderer layer={layer} isAnimating={isAnimating} />;
    case "scene_transition":
      return <SceneTransitionRenderer layer={layer} />;
    case "image":
      return <ImageRenderer layer={layer as ImageLayer} />;
    default:
      return null;
  }
}

