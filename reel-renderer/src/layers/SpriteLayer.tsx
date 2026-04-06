/**
 * layers/SpriteLayer.tsx — Character silhouettes
 * Renders stylized character placeholders with expressions.
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
}

/** Simple expression mappings to emoji/symbols for silhouette faces */
const EXPRESSION_EYES: Record<string, string> = {
  neutral: "• •",
  curious: "◦ ◦",
  shocked: "○ ○",
  wise: "— —",
  thoughtful: "• ·",
  excited: "★ ★",
  sad: "· ·",
  angry: "▸ ◂",
  determined: "▪ ▪",
  smirk: "• ¬",
  fearful: "◇ ◇",
  triumphant: "✦ ✦",
};

export const SpriteLayer: React.FC<Props> = ({
  layer,
  width,
  height,
  opacity,
  x,
  y,
  scale,
}) => {
  const props = layer.props || {};
  const character = props.character || "?";
  const expression = props.expression || "neutral";
  const size = props.size || 64;
  const silhouette = props.silhouette !== false;
  const facing = props.facing || "right";
  const aura = props.aura || "none";
  const signatureColor = props.signatureColor || "#F5A623";
  const showName = props.showName !== false;

  const eyes = EXPRESSION_EYES[expression] || "• •";
  const px = x * width;
  const py = y * height;
  const headSize = size * 0.6;

  const auraGlow =
    aura === "energy"
      ? `0 0 ${size * 0.4}px ${signatureColor}40`
      : aura === "dark"
        ? `0 0 ${size * 0.4}px rgba(0,0,0,0.6)`
        : "none";

  return (
    <div
      style={{
        position: "absolute",
        left: px,
        top: py,
        opacity,
        transform: `scale(${scale}) scaleX(${facing === "left" ? -1 : 1})`,
        transformOrigin: "center bottom",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* Head */}
      <div
        style={{
          width: headSize,
          height: headSize,
          borderRadius: "50%",
          background: silhouette ? "#1A1825" : signatureColor,
          border: `2px solid ${signatureColor}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: headSize * 0.25,
          color: silhouette ? signatureColor : "#1A1825",
          letterSpacing: headSize * 0.1,
          boxShadow: auraGlow,
        }}
      >
        <span style={{ transform: facing === "left" ? "scaleX(-1)" : "none" }}>
          {eyes}
        </span>
      </div>

      {/* Body */}
      <div
        style={{
          width: headSize * 0.5,
          height: size * 0.5,
          background: silhouette ? "#1A1825" : `${signatureColor}80`,
          borderRadius: "0 0 8px 8px",
          marginTop: -2,
          border: `2px solid ${signatureColor}`,
          borderTop: "none",
        }}
      />

      {/* Name tag */}
      {showName && (
        <div
          style={{
            marginTop: 6,
            fontSize: 10,
            fontFamily: "DotGothic16, monospace",
            color: signatureColor,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            transform: facing === "left" ? "scaleX(-1)" : "none",
          }}
        >
          {character}
        </div>
      )}
    </div>
  );
};
