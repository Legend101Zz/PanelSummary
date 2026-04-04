/**
 * LayerRenderers.tsx — Manga-style layer renderers
 * ==================================================
 * Ink on paper. Screentone. Hand-drawn character silhouettes.
 * Uses MangaInk primitives for authentic manga feel.
 */

import { useState, useEffect, useRef } from "react";
import type {
  BackgroundLayer, SpriteLayer, TextLayer, SpeechBubbleLayer,
  ImageLayer, Layer,
} from "@/lib/living-panel-types";
import { createTypewriter } from "./AnimationSystem";
import {
  PaperTexture, Screentone, CrosshatchShading,
  MangaCharacter, MangaBubble, MangaSpeedLines,
} from "./MangaInk";
import {
  EffectRenderer, ShapeRenderer, DataBlockRenderer, SceneTransitionRenderer,
} from "./EffectRenderers";

// Re-export for other consumers
export { EffectRenderer, ShapeRenderer, DataBlockRenderer, SceneTransitionRenderer };

// ============================================================
// BACKGROUND RENDERER (ink + paper + screentone)
// ============================================================

export function BackgroundRenderer({ layer }: { layer: BackgroundLayer }) {
  const { props } = layer;

  // Determine if this is a dark or light background
  const isDark = props.gradient?.[0]?.startsWith("#0") ||
                 props.gradient?.[0]?.startsWith("#1") ||
                 props.gradient?.[0] === "#000000";

  return (
    <div className="absolute inset-0">
      {/* Paper base (warm cream for light, dark ink for dark) */}
      <PaperTexture tone={isDark ? "dark" : "cream"} />

      {/* Optional gradient overlay (subtle, not neon) */}
      {props.gradient && (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(${props.gradientAngle ?? 160}deg, ${props.gradient.join(", ")})`,
            opacity: isDark ? 0.85 : 0.15,
            mixBlendMode: isDark ? "normal" : "multiply",
          }}
        />
      )}

      {/* Screentone / crosshatch pattern */}
      {props.pattern === "halftone" && (
        <Screentone density="medium" opacity={props.patternOpacity ?? 0.1} />
      )}
      {props.pattern === "dots" && (
        <Screentone density="light" opacity={props.patternOpacity ?? 0.08} />
      )}
      {(props.pattern === "crosshatch" || props.pattern === "lines") && (
        <CrosshatchShading
          angle={props.pattern === "lines" ? 0 : 45}
          spacing={6}
          opacity={props.patternOpacity ?? 0.1}
        />
      )}
      {props.pattern === "manga_screen" && (
        <Screentone density="heavy" opacity={props.patternOpacity ?? 0.06} />
      )}

      {/* Image if provided */}
      {props.image && (
        <img
          src={props.image} alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: 0.4, mixBlendMode: "multiply" }}
        />
      )}
    </div>
  );
}

// ============================================================
// SPRITE RENDERER (manga silhouette character)
// ============================================================

export function SpriteRenderer({ layer }: { layer: SpriteLayer }) {
  const { props } = layer;
  const isDark = props.silhouette;

  return (
    <MangaCharacter
      name={props.character || "Character"}
      expression={props.expression || "neutral"}
      pose={props.facing === "left" ? "thinking" : "standing"}
      size={props.size || 64}
      ink={isDark ? "#000" : "#1A1825"}
      showName={props.showName !== false}
    />
  );
}

// ============================================================
// TEXT RENDERER (manga typography)
// ============================================================

export function TextRenderer({
  layer, isAnimating,
}: {
  layer: TextLayer; isAnimating?: boolean;
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
    display: "var(--font-display, 'Dela Gothic One', sans-serif)",
    body: "var(--font-body, 'Outfit', sans-serif)",
    label: "var(--font-label, 'DotGothic16', monospace)",
    mono: "'DotGothic16', monospace",
  };

  return (
    <div
      style={{
        fontSize: props.fontSize || "1rem",
        fontFamily: fontMap[props.fontFamily || "body"],
        color: props.color || "#1A1825",
        textAlign: props.textAlign || "left",
        maxWidth: props.maxWidth || "90%",
        lineHeight: props.lineHeight || 1.4,
        textShadow: props.textShadow,
        letterSpacing: props.letterSpacing,
        whiteSpace: "pre-wrap" as const,
        // 2D: Prevent text from overflowing panel bounds
        overflow: "hidden" as const,
        maxHeight: "80%",
        wordBreak: "break-word" as const,
      }}
    >
      {visibleText}
      {props.typewriter && visibleText.length < props.content.length && (
        <span style={{ opacity: 0.4, animation: "pulse-glow 0.8s infinite" }}>█</span>
      )}
    </div>
  );
}

// ============================================================
// SPEECH BUBBLE RENDERER (hand-drawn manga bubbles)
// ============================================================

export function SpeechBubbleRenderer({
  layer, isAnimating,
}: {
  layer: SpeechBubbleLayer; isAnimating?: boolean;
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

  return (
    <MangaBubble
      variant={props.style}
      tail={props.tailDirection || "bottom"}
      maxWidth={props.maxWidth || 240}
    >
      {props.character && props.style !== "narrator" && (
        <span
          style={{
            display: "block",
            fontSize: 9,
            fontFamily: "var(--font-label)",
            color: "#888",
            letterSpacing: "0.08em",
            textTransform: "uppercase" as const,
            marginBottom: 3,
          }}
        >
          {props.character}
        </span>
      )}
      {visibleText}
      {props.typewriter && visibleText.length < props.text.length && (
        <span style={{ opacity: 0.3 }}>█</span>
      )}
    </MangaBubble>
  );
}

// ============================================================
// IMAGE RENDERER
// ============================================================

export function ImageRenderer({ layer }: { layer: ImageLayer }) {
  const { props } = layer;
  return (
    <img
      src={props.src} alt={props.alt || ""}
      className="w-full h-full"
      style={{
        objectFit: props.objectFit || "cover",
        filter: props.filter || "grayscale(0.3) contrast(1.1)",
        mixBlendMode: (props.blendMode as any) || "multiply",
      }}
    />
  );
}

// ============================================================
// LAYER CONTENT DISPATCHER
// ============================================================

export function LayerContent({
  layer, isAnimating,
}: {
  layer: Layer; isAnimating?: boolean;
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
