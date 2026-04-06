/**
 * layers/BackgroundLayer.tsx — Gradient, pattern, solid backgrounds
 */

import React from "react";
import type { Layer } from "../types";

interface Props {
  layer: Layer;
  width: number;
  height: number;
  opacity: number;
}

/** Generate CSS for patterns */
function patternCSS(
  pattern: string,
  opacity: number,
  color = "#ffffff",
): string {
  const c = color;
  const o = opacity;
  switch (pattern) {
    case "halftone":
      return `radial-gradient(circle, ${c} 1px, transparent 1px)`;
    case "crosshatch":
      return [
        `repeating-linear-gradient(0deg, ${c}${Math.round(o * 255).toString(16).padStart(2, "0")} 0px, transparent 1px, transparent 8px)`,
        `repeating-linear-gradient(90deg, ${c}${Math.round(o * 255).toString(16).padStart(2, "0")} 0px, transparent 1px, transparent 8px)`,
      ].join(", ");
    case "dots":
      return `radial-gradient(circle, ${c} 1.5px, transparent 1.5px)`;
    case "lines":
      return `repeating-linear-gradient(0deg, ${c}${Math.round(o * 255).toString(16).padStart(2, "0")} 0px, transparent 1px, transparent 12px)`;
    case "manga_screen":
    case "screentone":
      return `radial-gradient(circle, ${c} 0.8px, transparent 0.8px)`;
    case "noise":
      return `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='${o}'/%3E%3C/svg%3E")`;
    default:
      return "";
  }
}

export const BackgroundLayer: React.FC<Props> = ({
  layer,
  width,
  height,
  opacity,
}) => {
  const props = layer.props || {};
  const gradient = props.gradient as string[] | undefined;
  const angle = props.gradientAngle ?? 180;
  const pattern = props.pattern as string | undefined;
  const patternOpacity = props.patternOpacity ?? 0.06;

  let background = props.color || "#0F0E17";
  if (gradient && gradient.length >= 2) {
    background = `linear-gradient(${angle}deg, ${gradient.join(", ")})`;
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        width,
        height,
        background,
        opacity,
      }}
    >
      {pattern && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: patternCSS(
              pattern,
              patternOpacity,
              gradient?.[1] || "#ffffff",
            ),
            backgroundSize:
              pattern === "halftone" || pattern === "dots" || pattern === "screentone" || pattern === "manga_screen"
                ? "8px 8px"
                : undefined,
            opacity: patternOpacity,
            mixBlendMode: "multiply",
          }}
        />
      )}
    </div>
  );
};
