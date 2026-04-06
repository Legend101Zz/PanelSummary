/**
 * layers/CounterLayer.tsx — Animated number counter
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
  counterValue: number | null;
}

export const CounterLayer: React.FC<Props> = ({
  layer,
  width,
  height,
  opacity,
  x,
  y,
  scale,
  rotate,
  counterValue,
}) => {
  const props = layer.props || {};
  const value = counterValue ?? props.to ?? 0;
  const prefix = props.prefix || "";
  const suffix = props.suffix || "";

  return (
    <div
      style={{
        position: "absolute",
        left: x * width,
        top: y * height,
        opacity,
        transform: `scale(${scale}) rotate(${rotate}deg)`,
        transformOrigin: props.textAlign === "center" ? "center" : "top left",
        fontSize: props.fontSize || "5rem",
        fontFamily: props.fontFamily || "Dela Gothic One, sans-serif",
        color: props.color || "#E8191A",
        textAlign: props.textAlign || "left",
        fontWeight: 900,
        lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {prefix}
      {value}
      {suffix}
    </div>
  );
};
