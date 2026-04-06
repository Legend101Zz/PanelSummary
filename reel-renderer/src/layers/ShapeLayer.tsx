/**
 * layers/ShapeLayer.tsx — Geometric primitives
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
}

export const ShapeLayer: React.FC<Props> = ({
  layer,
  width,
  height,
  opacity,
  x,
  y,
  scale,
  rotate,
}) => {
  const props = layer.props || {};
  const shape = props.shape || "rect";
  const fill = props.fill || "transparent";
  const stroke = props.stroke || "#F5A623";
  const strokeWidth = props.strokeWidth || 2;
  const w = props.width || 100;
  const h = props.height || 100;
  const borderRadius = props.borderRadius || (shape === "circle" ? "50%" : 0);

  if (shape === "line") {
    return (
      <div
        style={{
          position: "absolute",
          left: x * width,
          top: y * height,
          width: w,
          height: strokeWidth,
          background: stroke,
          opacity,
          transform: `scale(${scale}) rotate(${rotate}deg)`,
          transformOrigin: "left center",
        }}
      />
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        left: x * width,
        top: y * height,
        width: w,
        height: h,
        background: fill,
        border: `${strokeWidth}px solid ${stroke}`,
        borderRadius,
        opacity,
        transform: `scale(${scale}) rotate(${rotate}deg)`,
        transformOrigin: "center",
      }}
    />
  );
};
