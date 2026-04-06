/**
 * layers/EffectLayer.tsx — Visual FX (speed lines, particles, vignette, etc.)
 */

import React from "react";
import type { Layer } from "../types";

interface Props {
  layer: Layer;
  width: number;
  height: number;
  opacity: number;
}

/** Speed lines radiating from center */
function SpeedLines({ color, intensity, direction, w, h }: any) {
  const isRadial = direction === "radial";
  const count = 36;
  const cx = w / 2;
  const cy = isRadial ? h * 0.75 : h / 2;
  const len = Math.max(w, h);

  return (
    <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * 360;
        const rad = (angle * Math.PI) / 180;
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + Math.cos(rad) * len}
            y2={cy + Math.sin(rad) * len}
            stroke={color}
            strokeWidth={0.5 + (i % 3) * 0.4}
            opacity={intensity * (0.3 + (i % 4) * 0.1)}
          />
        );
      })}
    </svg>
  );
}

/** Vignette overlay */
function Vignette({ intensity }: { intensity: number }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${intensity}) 100%)`,
      }}
    />
  );
}

/** Simple particles (dots floating) */
function Particles({ color, intensity, w, h }: any) {
  const count = Math.round(intensity * 30);
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${(i * 37 + 13) % 100}%`,
            top: `${(i * 53 + 7) % 100}%`,
            width: 2 + (i % 3),
            height: 2 + (i % 3),
            borderRadius: "50%",
            background: color,
            opacity: 0.3 + (i % 5) * 0.1,
          }}
        />
      ))}
    </>
  );
}

/** SFX text (e.g. "WHAM!", "CRACK!") */
function SfxText({ text, size, color, rotation }: any) {
  return (
    <div
      style={{
        fontSize: size || 48,
        fontFamily: "Dela Gothic One, sans-serif",
        color: color || "#E8191A",
        transform: `rotate(${rotation || 0}deg)`,
        fontWeight: 900,
        letterSpacing: "0.05em",
        textShadow: `2px 2px 0 rgba(0,0,0,0.3)`,
        lineHeight: 1,
      }}
    >
      {text}
    </div>
  );
}

export const EffectLayer: React.FC<Props> = ({
  layer,
  width,
  height,
  opacity,
}) => {
  const props = layer.props || {};
  const effect = props.effect || "";
  const color = props.color || "#F5A623";
  const intensity = props.intensity ?? 0.5;
  const direction = props.direction || "radial";

  const x = layer.x ? parseFloat(String(layer.x)) / 100 : 0;
  const y = layer.y ? parseFloat(String(layer.y)) / 100 : 0;

  // Full-screen effects
  if (effect === "speed_lines") {
    return (
      <div style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}>
        <SpeedLines color={color} intensity={intensity} direction={direction} w={width} h={height} />
      </div>
    );
  }

  if (effect === "vignette") {
    return (
      <div style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}>
        <Vignette intensity={intensity} />
      </div>
    );
  }

  if (effect === "particles" || effect === "sparkle") {
    return (
      <div style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}>
        <Particles color={color} intensity={intensity} w={width} h={height} />
      </div>
    );
  }

  if (effect === "impact_burst" || effect === "ink_splash") {
    return (
      <div
        style={{
          position: "absolute",
          left: x * width,
          top: y * height,
          width: 200,
          height: 200,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${color}40, transparent 70%)`,
          opacity,
          transform: "translate(-50%, -50%)",
        }}
      />
    );
  }

  if (effect === "sfx") {
    return (
      <div
        style={{
          position: "absolute",
          left: x * width,
          top: y * height,
          opacity,
          pointerEvents: "none",
        }}
      >
        <SfxText
          text={props.sfxText || "!!"}
          size={props.sfxSize}
          color={color}
          rotation={props.sfxRotate}
        />
      </div>
    );
  }

  // Pattern overlays (halftone, crosshatch, screentone)
  if (["halftone", "crosshatch", "screentone", "dots", "lines"].includes(effect)) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: opacity * intensity,
          background:
            effect === "halftone" || effect === "screentone" || effect === "dots"
              ? `radial-gradient(circle, ${color} 1px, transparent 1px)`
              : `repeating-linear-gradient(0deg, ${color}15 0px, transparent 1px, transparent 8px)`,
          backgroundSize:
            effect === "halftone" || effect === "screentone" || effect === "dots"
              ? "6px 6px"
              : undefined,
          mixBlendMode: "multiply",
          pointerEvents: "none",
        }}
      />
    );
  }

  return null;
};
