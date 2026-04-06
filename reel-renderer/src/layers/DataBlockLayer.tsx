/**
 * layers/DataBlockLayer.tsx — Animated bullet list
 */

import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Layer } from "../types";

interface Props {
  layer: Layer;
  width: number;
  height: number;
  opacity: number;
  x: number;
  y: number;
  scale: number;
  sceneStartFrame: number;
}

export const DataBlockLayer: React.FC<Props> = ({
  layer,
  width,
  height,
  opacity,
  x,
  y,
  scale,
  sceneStartFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const props = layer.props || {};
  const items: Array<{ label: string; value?: string; icon?: string }> =
    props.items || [];
  const accentColor = props.accentColor || "#F5A623";
  const showIndex = props.showIndex ?? true;
  const staggerDelay = props.staggerDelay || 200;

  return (
    <div
      style={{
        position: "absolute",
        left: x * width,
        top: y * height,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        maxWidth: "80%",
      }}
    >
      {items.map((item, i) => {
        const itemStartFrame =
          sceneStartFrame + Math.round(((i * staggerDelay) / 1000) * fps);
        const itemOpacity = interpolate(
          frame,
          [itemStartFrame, itemStartFrame + Math.round(fps * 0.3)],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const itemX = interpolate(
          frame,
          [itemStartFrame, itemStartFrame + Math.round(fps * 0.3)],
          [-20, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );

        return (
          <div
            key={i}
            style={{
              opacity: itemOpacity,
              transform: `translateX(${itemX}px)`,
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            {showIndex && (
              <span
                style={{
                  fontFamily: "DotGothic16, monospace",
                  fontSize: "0.75rem",
                  color: accentColor,
                  opacity: 0.7,
                  flexShrink: 0,
                  marginTop: 3,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
            )}
            <div>
              <span
                style={{
                  fontFamily: "Outfit, sans-serif",
                  fontSize: "1.1rem",
                  color: "#F0EEE8",
                  lineHeight: 1.4,
                }}
              >
                {item.label}
              </span>
              {item.value && (
                <span
                  style={{
                    marginLeft: 8,
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: "0.95rem",
                    color: accentColor,
                    fontWeight: 600,
                  }}
                >
                  {item.value}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
