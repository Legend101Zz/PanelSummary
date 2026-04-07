/**
 * LayerRenderer.tsx — Renders a single DSL layer
 * ==================================================
 * Each layer type gets its own visual treatment.
 * Layers are positioned absolutely within the scene.
 */

"use client";

import React, { useMemo } from "react";
import type { Layer, TimelineEntry } from "./types";
import { getEasing, clamp01, lerp, interpolateValue } from "./easing";

interface LayerProps {
  layer: Layer;
  sceneLocalMs: number;
  timeline: TimelineEntry[];
}

/** Compute animated properties for a layer at a given time */
function computeAnimatedStyle(
  layer: Layer,
  sceneLocalMs: number,
  timeline: TimelineEntry[],
): React.CSSProperties {
  const style: Record<string, any> = {};
  let x = layer.x || "0%";
  let y = layer.y || "0%";
  let opacity = layer.opacity ?? 1;
  let scale = layer.scale ?? 1;
  let rotate = layer.rotate ?? 0;

  // Apply timeline animations targeting this layer
  const myEntries = timeline.filter((e) => e.target === layer.id);

  for (const entry of myEntries) {
    const startMs = entry.at;
    const endMs = entry.at + entry.duration;
    const easeFn = getEasing(entry.easing);

    if (sceneLocalMs < startMs) {
      // Before animation — use "from" values
      if (entry.animate.opacity) opacity = entry.animate.opacity[0];
      if (entry.animate.scale) scale = entry.animate.scale[0];
      if (entry.animate.rotate) rotate = entry.animate.rotate[0];
      if (entry.animate.x) x = String(entry.animate.x[0]);
      if (entry.animate.y) y = String(entry.animate.y[0]);
    } else if (sceneLocalMs >= endMs) {
      // After animation — use "to" values
      if (entry.animate.opacity) opacity = entry.animate.opacity[1];
      if (entry.animate.scale) scale = entry.animate.scale[1];
      if (entry.animate.rotate) rotate = entry.animate.rotate[1];
      if (entry.animate.x) x = String(entry.animate.x[1]);
      if (entry.animate.y) y = String(entry.animate.y[1]);
    } else {
      // During animation — interpolate
      const rawT = clamp01((sceneLocalMs - startMs) / entry.duration);
      const t = easeFn(rawT);

      if (entry.animate.opacity) {
        const [from, to] = entry.animate.opacity;
        opacity = lerp(from, to, t);
      }
      if (entry.animate.scale) {
        const [from, to] = entry.animate.scale;
        scale = lerp(from, to, t);
      }
      if (entry.animate.rotate) {
        const [from, to] = entry.animate.rotate;
        rotate = lerp(from, to, t);
      }
      if (entry.animate.x) {
        x = interpolateValue(entry.animate.x[0], entry.animate.x[1], t);
      }
      if (entry.animate.y) {
        y = interpolateValue(entry.animate.y[0], entry.animate.y[1], t);
      }
    }
  }

  return {
    position: "absolute" as const,
    left: x,
    top: y,
    opacity,
    transform: `scale(${scale}) rotate(${rotate}deg)`,
    transformOrigin: "center center",
  };
}

/** Typewriter effect: reveal text character by character */
function useTypewriter(
  text: string,
  sceneLocalMs: number,
  startMs: number,
  speed: number = 30,
): string {
  if (sceneLocalMs < startMs) return "";
  const elapsed = sceneLocalMs - startMs;
  const chars = Math.floor(elapsed / speed);
  return text.slice(0, Math.min(chars, text.length));
}

// ── Individual Layer Types ──────────────────────────────────

function BackgroundLayer({ layer }: { layer: Layer }) {
  const { gradient, gradientAngle, pattern, patternOpacity } =
    layer.props;

  const bgStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
  };

  if (gradient && Array.isArray(gradient) && gradient.length >= 2) {
    const angle = gradientAngle || 180;
    bgStyle.background = `linear-gradient(${angle}deg, ${gradient.join(", ")})`;
  }

  return (
    <div style={bgStyle}>
      {pattern && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: patternOpacity || 0.06,
            backgroundImage: getPatternCSS(pattern),
            backgroundSize: "20px 20px",
          }}
        />
      )}
    </div>
  );
}

function TextLayerContent({
  layer,
  sceneLocalMs,
  timeline,
}: LayerProps) {
  const { content, fontSize, fontFamily, color, maxWidth, lineHeight,
    typewriter, typewriterSpeed, textAlign, letterSpacing, textTransform,
  } = layer.props;

  // Find if typewriter is animated via timeline
  const typewriterEntry = timeline.find(
    (e) => e.target === layer.id && e.animate.typewriter,
  );

  const displayText =
    typewriter || typewriterEntry
      ? useTypewriter(
          content || "",
          sceneLocalMs,
          typewriterEntry?.at || 200,
          typewriterSpeed || 30,
        )
      : content;

  return (
    <div
      style={{
        fontSize: fontSize || "1.5rem",
        fontFamily: fontFamily ? `"${fontFamily}", sans-serif` : "inherit",
        color: color || "#F0EEE8",
        maxWidth: maxWidth || "90%",
        lineHeight: lineHeight || 1.4,
        textAlign: textAlign || "left",
        letterSpacing: letterSpacing || "normal",
        textTransform: textTransform || "none",
        wordWrap: "break-word",
        whiteSpace: "pre-wrap",
      }}
    >
      {displayText}
      {(typewriter || typewriterEntry) &&
        (displayText?.length || 0) < (content?.length || 0) && (
          <span
            style={{
              display: "inline-block",
              width: "2px",
              height: "1.1em",
              background: color || "#F0EEE8",
              marginLeft: 2,
              animation: "blink 0.8s step-end infinite",
            }}
          />
        )}
    </div>
  );
}

function CounterLayerContent({
  layer,
  sceneLocalMs,
  timeline,
}: LayerProps) {
  const { from = 0, to = 100, prefix = "", suffix = "",
    fontSize, fontFamily, color, duration_ms = 2000,
  } = layer.props;

  // Find countUp animation in timeline
  const countEntry = timeline.find(
    (e) => e.target === layer.id && e.animate.countUp,
  );
  const startMs = countEntry?.at || 0;
  const dur = countEntry?.duration || duration_ms;

  let value = from;
  if (sceneLocalMs >= startMs + dur) {
    value = to;
  } else if (sceneLocalMs > startMs) {
    const t = clamp01((sceneLocalMs - startMs) / dur);
    value = Math.round(lerp(from, to, t));
  }

  return (
    <div
      style={{
        fontSize: fontSize || "4rem",
        fontFamily: fontFamily
          ? `"${fontFamily}", monospace`
          : "var(--font-display), monospace",
        color: color || "#F5A623",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {prefix}
      {value.toLocaleString()}
      {suffix}
    </div>
  );
}

function SpeechBubbleContent({ layer }: { layer: Layer }) {
  const { text, character, style: bubbleStyle = "speech",
    maxWidth, tailDirection = "left",
  } = layer.props;

  const isShout = bubbleStyle === "shout";
  const isWhisper = bubbleStyle === "whisper";
  const isNarrator = bubbleStyle === "narrator";

  return (
    <div
      style={{
        maxWidth: maxWidth || "70%",
        padding: "12px 18px",
        borderRadius: isShout ? 4 : 16,
        background: isNarrator
          ? "rgba(15,14,23,0.85)"
          : isWhisper
            ? "rgba(240,238,232,0.08)"
            : "#F0EEE8",
        color: isNarrator || isWhisper ? "#F0EEE8" : "#1A1825",
        border: isShout
          ? "3px solid #E8191A"
          : isNarrator
            ? "1px solid rgba(240,238,232,0.15)"
            : "2px solid #2E2C3F",
        position: "relative",
        fontFamily: isShout
          ? '"Dela Gothic One", sans-serif'
          : '"Outfit", sans-serif',
        fontSize: isShout ? "1.3rem" : isWhisper ? "0.9rem" : "1rem",
        fontStyle: isWhisper ? "italic" : "normal",
        letterSpacing: isShout ? "0.02em" : "normal",
      }}
    >
      {character && !isNarrator && (
        <span
          style={{
            display: "block",
            fontSize: "0.65rem",
            fontFamily: '"DotGothic16", monospace',
            color: isShout ? "#E8191A" : "#5E5C78",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            marginBottom: 4,
          }}
        >
          {character}
        </span>
      )}
      {text}
    </div>
  );
}

function EffectLayer({ layer }: { layer: Layer }) {
  const { effect, color, intensity = 0.5, sfxText, sfxSize } =
    layer.props;

  if (effect === "sfx" && sfxText) {
    return (
      <div
        style={{
          fontSize: sfxSize || "5rem",
          fontFamily: '"Dela Gothic One", sans-serif',
          color: color || "#E8191A",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          textShadow: `0 0 40px ${color || "#E8191A"}60`,
          WebkitTextStroke: "1px rgba(0,0,0,0.3)",
        }}
      >
        {sfxText}
      </div>
    );
  }

  if (effect === "speed_lines") {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: intensity,
          background: `repeating-linear-gradient(
            90deg,
            transparent,
            transparent 8px,
            ${color || "#F0EEE8"}15 8px,
            ${color || "#F0EEE8"}15 9px
          )`,
        }}
      />
    );
  }

  if (effect === "vignette") {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse at center, transparent 40%, ${color || "#000"} 100%)`,
          opacity: intensity,
        }}
      />
    );
  }

  if (effect === "particles") {
    return (
      <div style={{ position: "absolute", inset: 0, opacity: intensity }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 3 + Math.random() * 4,
              height: 3 + Math.random() * 4,
              borderRadius: "50%",
              background: color || "#F5A623",
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              opacity: 0.3 + Math.random() * 0.5,
              animation: `float-particle ${2 + Math.random() * 3}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 2}s`,
            }}
          />
        ))}
      </div>
    );
  }

  return null;
}

function DataBlockContent({ layer }: { layer: Layer }) {
  const {
    items = [],
    accentColor = "#F5A623",
    showIndex = true,
  } = layer.props;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {(items as { label: string; value?: string }[]).map(
        (item, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "6px 0",
              borderBottom: "1px solid rgba(240,238,232,0.06)",
            }}
          >
            {showIndex && (
              <span
                style={{
                  fontFamily: '"DotGothic16", monospace',
                  fontSize: "0.7rem",
                  color: accentColor,
                  minWidth: 20,
                  letterSpacing: "0.1em",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
            )}
            <div>
              <span
                style={{
                  color: "#F0EEE8",
                  fontSize: "0.9rem",
                  fontFamily: '"Outfit", sans-serif',
                }}
              >
                {item.label}
              </span>
              {item.value && (
                <span
                  style={{
                    display: "block",
                    color: "#A8A6C0",
                    fontSize: "0.75rem",
                    marginTop: 2,
                  }}
                >
                  {item.value}
                </span>
              )}
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function SpriteContent({ layer }: { layer: Layer }) {
  const { character, expression, pose, size = "200px", aura } =
    layer.props;

  const auraColor =
    aura === "energy"
      ? "#F5A623"
      : aura === "dark"
        ? "#E8191A"
        : aura === "calm"
          ? "#0053E2"
          : "transparent";

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${auraColor}20, transparent 70%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
      }}
    >
      {/* Stylized character initial as silhouette */}
      <div
        style={{
          width: "60%",
          height: "60%",
          borderRadius: "50%",
          background: "#2E2C3F",
          border: `2px solid ${auraColor || "#5E5C78"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "2.5rem",
          fontFamily: '"Dela Gothic One", sans-serif',
          color: auraColor || "#5E5C78",
        }}
      >
        {(character || "?")[0].toUpperCase()}
      </div>
      {character && (
        <span
          style={{
            fontSize: "0.6rem",
            fontFamily: '"DotGothic16", monospace',
            color: "#5E5C78",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            marginTop: 6,
          }}
        >
          {character}
        </span>
      )}
    </div>
  );
}

// ── Pattern generators ──────────────────────────────────────

function getPatternCSS(pattern: string): string {
  switch (pattern) {
    case "halftone":
      return "radial-gradient(circle, currentColor 1px, transparent 1px)";
    case "crosshatch":
      return `repeating-linear-gradient(45deg, currentColor 0, currentColor 1px, transparent 0, transparent 10px),
              repeating-linear-gradient(-45deg, currentColor 0, currentColor 1px, transparent 0, transparent 10px)`;
    case "dots":
      return "radial-gradient(circle, currentColor 1.5px, transparent 1.5px)";
    case "lines":
      return "repeating-linear-gradient(0deg, currentColor 0, currentColor 1px, transparent 0, transparent 8px)";
    case "manga_screen":
      return "radial-gradient(circle, currentColor 1px, transparent 1px)";
    case "noise":
      return "none"; // handled differently
    default:
      return "none";
  }
}

// ── Main LayerRenderer ──────────────────────────────────────

export const LayerRenderer: React.FC<LayerProps> = ({
  layer,
  sceneLocalMs,
  timeline,
}) => {
  const animStyle = useMemo(
    () => computeAnimatedStyle(layer, sceneLocalMs, timeline),
    [layer, sceneLocalMs, timeline],
  );

  // Background layers are full-bleed, no position wrapper
  if (layer.type === "background") {
    return <BackgroundLayer layer={layer} />;
  }

  // Effect layers are also full-bleed
  if (layer.type === "effect") {
    return (
      <div style={animStyle}>
        <EffectLayer layer={layer} />
      </div>
    );
  }

  return (
    <div style={animStyle}>
      {layer.type === "text" && (
        <TextLayerContent
          layer={layer}
          sceneLocalMs={sceneLocalMs}
          timeline={timeline}
        />
      )}
      {layer.type === "counter" && (
        <CounterLayerContent
          layer={layer}
          sceneLocalMs={sceneLocalMs}
          timeline={timeline}
        />
      )}
      {layer.type === "speech_bubble" && (
        <SpeechBubbleContent layer={layer} />
      )}
      {layer.type === "data_block" && <DataBlockContent layer={layer} />}
      {layer.type === "sprite" && <SpriteContent layer={layer} />}
      {layer.type === "shape" && <ShapeContent layer={layer} />}
    </div>
  );
};

function ShapeContent({ layer }: { layer: Layer }) {
  const {
    shape = "rect",
    fill = "transparent",
    stroke = "#5E5C78",
    strokeWidth = 1,
    width = "100px",
    height = "100px",
    borderRadius = 0,
  } = layer.props;

  if (shape === "circle") {
    return (
      <div
        style={{
          width,
          height: width,
          borderRadius: "50%",
          background: fill,
          border: `${strokeWidth}px solid ${stroke}`,
        }}
      />
    );
  }

  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        background: fill,
        border: `${strokeWidth}px solid ${stroke}`,
      }}
    />
  );
}
