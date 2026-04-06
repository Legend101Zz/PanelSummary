/**
 * layers/TextLayer.tsx — Text rendering with typewriter support
 */

import React from "react";
import type { Layer } from "../types";

interface Props {
  layer: Layer;
  width: number;
  height: number;
  opacity: number;
  x: number;
  y: number;
  scale: number;
  rotate: number;
  typewriterChars: number | null;
}

export const TextLayer: React.FC<Props> = ({
  layer,
  width,
  height,
  opacity,
  x,
  y,
  scale,
  rotate,
  typewriterChars,
}) => {
  const props = layer.props || {};
  const content = props.content || "";
  const displayText =
    typewriterChars !== null
      ? content.slice(0, typewriterChars)
      : content;

  return (
    <div
      style={{
        position: "absolute",
        left: x * width,
        top: y * height,
        opacity,
        transform: `scale(${scale}) rotate(${rotate}deg)`,
        transformOrigin: "top left",
        fontSize: props.fontSize || "1.5rem",
        fontFamily: props.fontFamily || "Outfit, sans-serif",
        color: props.color || "#F0EEE8",
        textAlign: props.textAlign || "left",
        maxWidth: props.maxWidth || "80%",
        lineHeight: props.lineHeight || 1.4,
        letterSpacing: props.letterSpacing || "normal",
        textTransform: props.textTransform || "none",
        textDecoration: props.textDecoration || "none",
        fontWeight: props.fontWeight || "normal",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {displayText}
      {typewriterChars !== null && typewriterChars < content.length && (
        <span style={{ opacity: 0.6 }}>▌</span>
      )}
    </div>
  );
};
