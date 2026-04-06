/**
 * layers/SpeechBubbleLayer.tsx — Dialogue bubbles with tail
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
  typewriterChars: number | null;
}

export const SpeechBubbleLayer: React.FC<Props> = ({
  layer,
  width,
  height,
  opacity,
  x,
  y,
  scale,
  typewriterChars,
}) => {
  const props = layer.props || {};
  const text = props.text || "";
  const character = props.character || "";
  const style = props.style || "speech";
  const displayText =
    typewriterChars !== null ? text.slice(0, typewriterChars) : text;

  const isNarrator = style === "narrator";
  const isShout = style === "shout";
  const isWhisper = style === "whisper";
  const isThought = style === "thought";

  const bgColor = isNarrator
    ? "rgba(15, 14, 23, 0.85)"
    : isShout
      ? "#E8191A"
      : "rgba(242, 232, 213, 0.95)";
  const textColor = isNarrator || isShout ? "#F0EEE8" : "#1A1825";
  const borderRadius = isThought ? "50% / 40%" : isShout ? "4px" : "16px";
  const border = isNarrator
    ? "1px solid rgba(240,238,232,0.2)"
    : isShout
      ? "3px solid #B31213"
      : "2px solid #1A1825";

  return (
    <div
      style={{
        position: "absolute",
        left: x * width,
        top: y * height,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        maxWidth: props.maxWidth || "70%",
        padding: "16px 20px",
        background: bgColor,
        color: textColor,
        borderRadius,
        border,
        fontFamily: isNarrator
          ? "Outfit, sans-serif"
          : "Boogaloo, cursive, sans-serif",
        fontSize: isShout ? "1.4rem" : isWhisper ? "0.9rem" : "1.1rem",
        fontStyle: isWhisper ? "italic" : "normal",
        fontWeight: isShout ? 700 : 400,
        letterSpacing: isShout ? "0.05em" : "normal",
        textTransform: isShout ? "uppercase" : "none",
        lineHeight: 1.4,
      }}
    >
      {character && !isNarrator && (
        <div
          style={{
            fontSize: "0.7rem",
            fontFamily: "DotGothic16, monospace",
            opacity: 0.6,
            marginBottom: 4,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {character}
        </div>
      )}
      {displayText}
    </div>
  );
};
