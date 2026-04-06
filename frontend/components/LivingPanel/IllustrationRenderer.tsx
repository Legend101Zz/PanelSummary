/**
 * IllustrationRenderer.tsx — SVG scene illustration layer
 * ========================================================
 * Renders full-scene SVG illustrations from:
 * 1. Scene library components (scene="laboratory")
 * 2. Inline SVG markup (svg="<svg>...</svg>")
 *
 * The LLM picks a scene name and optional color overrides.
 * This is what makes panels look like manga instead of text-on-gradient.
 */

import React, { useMemo } from "react";
import type { IllustrationLayer } from "@/lib/living-panel-types";
import { SCENE_REGISTRY } from "./illustrations/SceneLibrary";

// SVG style filters — apply manga-ink aesthetic to illustrations
const STYLE_FILTERS: Record<string, React.CSSProperties> = {
  "manga-ink": {
    filter: "contrast(1.1) saturate(0)",
    opacity: 0.2,
    mixBlendMode: "multiply" as const,
  },
  blueprint: {
    filter: "saturate(0.3) brightness(1.2)",
    opacity: 0.15,
    mixBlendMode: "screen" as const,
  },
  watercolor: {
    filter: "blur(0.5px) saturate(0.6)",
    opacity: 0.25,
    mixBlendMode: "multiply" as const,
  },
  neon: {
    filter: "brightness(1.3) saturate(1.5)",
    opacity: 0.2,
    mixBlendMode: "screen" as const,
  },
};

export function IllustrationRenderer({ layer }: { layer: IllustrationLayer }) {
  const { props } = layer;
  const style = STYLE_FILTERS[props.style || "manga-ink"] || STYLE_FILTERS["manga-ink"];

  // Inline SVG: render the raw markup directly
  const inlineSvg = useMemo(() => {
    if (!props.svg) return null;
    // Sanitize: strip any script tags (safety net)
    const clean = props.svg
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/on\w+="[^"]*"/gi, "");
    return { __html: clean };
  }, [props.svg]);

  // Scene component: look up from the registry
  const SceneComponent = props.scene ? SCENE_REGISTRY[props.scene] : null;

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={style}
      role="img"
      aria-label={props.description || `Illustration: ${props.scene || "custom"}`}
    >
      {SceneComponent && (
        <SceneComponent
          primary={props.primaryColor}
          accent={props.accentColor}
          elements={props.elements}
        />
      )}
      {inlineSvg && !SceneComponent && (
        <div
          className="w-full h-full flex items-center justify-center"
          dangerouslySetInnerHTML={inlineSvg}
        />
      )}
    </div>
  );
}
