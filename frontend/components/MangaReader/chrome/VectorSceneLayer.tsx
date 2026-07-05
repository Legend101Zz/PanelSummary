"use client";

import type { CSSProperties } from "react";
import type {
  StoryboardPanel,
  VectorScene,
  VectorSceneBackground,
  VectorSceneLine,
  VectorSceneSfx,
} from "@/lib/types";

function clamp(value: number | undefined, fallback: number, min = 0, max = 100): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function upperToken(value: string | undefined, fallback: string): string {
  const text = (value ?? "").trim();
  return text || fallback;
}

export function vectorSceneHasVisibleInk(scene?: VectorScene | null): boolean {
  if (!scene) return false;
  const toneVisible =
    Boolean(scene.tone) &&
    scene.tone?.pattern !== "none" &&
    (scene.tone?.opacity ?? 0.16) > 0;
  const lineVisible = Boolean(
    scene.linework?.some((line) => (line.opacity ?? 0.38) > 0 && (line.stroke_width ?? 1.4) > 0),
  );
  const silhouetteVisible = Boolean(scene.silhouettes?.some((item) => (item.opacity ?? 0.36) > 0));
  const speedVisible = Boolean(scene.speedlines?.some((item) => (item.opacity ?? 0.24) > 0));
  const focusVisible = Boolean(scene.radial_focus && (scene.radial_focus.opacity ?? 0.18) > 0);
  const sfxVisible = Boolean(scene.sfx?.some((item) => item.text.trim().length > 0));
  return toneVisible || lineVisible || silhouetteVisible || speedVisible || focusVisible || Boolean(scene.vignette) || sfxVisible;
}

export function fallbackVectorSceneForPanel(panel: StoryboardPanel): VectorScene {
  const shotType = panel.shot_type;
  const purpose = panel.purpose;
  const isWide = shotType === "wide" || shotType === "extreme_wide";
  const isClose = shotType === "close_up" || shotType === "extreme_close_up";
  const isSymbolic = shotType === "insert" || shotType === "symbolic" || purpose === "reveal" || purpose === "emotional_turn";

  const linework: VectorSceneLine[] = isWide
    ? [
        { kind: "horizon", x1: 4, y1: 63, x2: 96, y2: 60, stroke_width: 1.6, opacity: 0.42 },
        { kind: "floor", x1: 14, y1: 100, x2: 46, y2: 62, stroke_width: 0.9, opacity: 0.24 },
        { kind: "floor", x1: 86, y1: 100, x2: 54, y2: 62, stroke_width: 0.9, opacity: 0.24 },
        { kind: "interior", x1: 8, y1: 22, x2: 8, y2: 84, stroke_width: 1, opacity: 0.22 },
        { kind: "interior", x1: 92, y1: 18, x2: 92, y2: 82, stroke_width: 1, opacity: 0.22 },
      ]
    : isClose
      ? [
          { kind: "focus", x1: 10, y1: 16, x2: 42, y2: 44, stroke_width: 1.2, opacity: 0.3 },
          { kind: "focus", x1: 90, y1: 18, x2: 58, y2: 45, stroke_width: 1.2, opacity: 0.3 },
          { kind: "hatching", x1: 6, y1: 76, x2: 40, y2: 100, stroke_width: 0.8, opacity: 0.22 },
          { kind: "hatching", x1: 60, y1: 100, x2: 94, y2: 76, stroke_width: 0.8, opacity: 0.22 },
        ]
      : [
          { kind: "diagonal", x1: 6, y1: 78, x2: 94, y2: 48, stroke_width: 1.3, opacity: 0.28 },
          { kind: "interior", x1: 10, y1: 28, x2: 90, y2: 24, stroke_width: 0.9, opacity: 0.22 },
          { kind: "interior", x1: 16, y1: 92, x2: 84, y2: 92, stroke_width: 1.1, opacity: 0.24 },
        ];

  return {
    background: {
      fill: isSymbolic ? "#f6f7fb" : "#fbfaf4",
      gradient_to: isSymbolic ? "#e5e8ef" : "#eee6d4",
      gradient_angle: 135,
    },
    tone: {
      pattern: isClose ? "hatching" : "dots",
      opacity: isWide ? 0.18 : 0.22,
      scale: isWide ? 5 : 7,
      stroke: "#1f1f29",
    },
    linework,
    speedlines: isSymbolic
      ? [{ origin_x: 52, origin_y: 48, count: 16, spread: 66, opacity: 0.18 }]
      : [],
    radial_focus: isClose || isSymbolic ? { x: 52, y: 45, radius: 76, opacity: 0.16 } : null,
    vignette: isClose || purpose === "reveal" || purpose === "emotional_turn",
    mood: purpose,
  };
}

function withRequiredInk(panel: StoryboardPanel, scene?: VectorScene | null): VectorScene {
  const fallback = fallbackVectorSceneForPanel(panel);
  if (!vectorSceneHasVisibleInk(scene)) return fallback;
  return {
    ...scene,
    background: scene?.background ?? fallback.background,
    tone: scene?.tone && scene.tone.pattern !== "none" ? scene.tone : fallback.tone,
    linework: scene?.linework?.length ? scene.linework : fallback.linework,
  };
}

function gradientCoords(angle: number | undefined): { x1: string; y1: string; x2: string; y2: string } {
  const normalized = ((angle ?? 135) % 360 + 360) % 360;
  if (normalized < 45 || normalized >= 315) return { x1: "0%", y1: "50%", x2: "100%", y2: "50%" };
  if (normalized < 135) return { x1: "0%", y1: "100%", x2: "100%", y2: "0%" };
  if (normalized < 225) return { x1: "100%", y1: "50%", x2: "0%", y2: "50%" };
  return { x1: "100%", y1: "0%", x2: "0%", y2: "100%" };
}

function renderTone(scene: VectorScene, ids: SceneIds) {
  const tone = scene.tone;
  if (!tone || tone.pattern === "none" || (tone.opacity ?? 0.16) <= 0) return null;
  return (
    <rect
      x="0"
      y="0"
      width="100"
      height="100"
      fill={`url(#${ids.tone})`}
      opacity={clamp(tone.opacity, 0.16, 0, 1)}
    />
  );
}

function renderLine(line: VectorSceneLine, index: number) {
  return (
    <line
      key={`line-${index}`}
      x1={clamp(line.x1, 0)}
      y1={clamp(line.y1, 0)}
      x2={clamp(line.x2, 100)}
      y2={clamp(line.y2, 100)}
      stroke={upperToken(line.stroke, "#1f1f29")}
      strokeWidth={clamp(line.stroke_width, 1.4, 0.1, 8)}
      strokeLinecap="round"
      opacity={clamp(line.opacity, 0.38, 0, 1)}
      vectorEffect="non-scaling-stroke"
    />
  );
}

function renderSilhouettes(scene: VectorScene) {
  return (scene.silhouettes ?? []).map((silhouette, index) => {
    const x = clamp(silhouette.x, 50);
    const y = clamp(silhouette.y, 78);
    const scale = clamp(silhouette.scale, 1, 0.1, 3);
    const opacity = clamp(silhouette.opacity, 0.36, 0, 1);
    const lean = silhouette.pose?.includes("run") ? -6 : 0;
    return (
      <g
        key={`silhouette-${index}`}
        transform={`translate(${x} ${y}) rotate(${lean}) scale(${scale})`}
        opacity={opacity}
        fill="#1f1f29"
      >
        <ellipse cx="0" cy="-18" rx="4.6" ry="5.8" />
        <path d="M-6 -11 C-9 1 -8 12 -4 20 L4 20 C8 10 9 0 6 -11 Z" />
        <line x1="-5" y1="20" x2="-8" y2="32" stroke="#1f1f29" strokeWidth="3" strokeLinecap="round" />
        <line x1="5" y1="20" x2="8" y2="32" stroke="#1f1f29" strokeWidth="3" strokeLinecap="round" />
      </g>
    );
  });
}

function renderSpeedlines(scene: VectorScene) {
  return (scene.speedlines ?? []).flatMap((burst, burstIndex) => {
    const originX = clamp(burst.origin_x, 50);
    const originY = clamp(burst.origin_y, 48);
    const count = Math.round(clamp(burst.count, 18, 4, 48));
    const spread = clamp(burst.spread, 72, 10, 100);
    const opacity = clamp(burst.opacity, 0.24, 0, 1);
    return Array.from({ length: count }, (_, index) => {
      const angle = (Math.PI * 2 * index) / count;
      const inner = 10 + (index % 4) * 2;
      const outer = spread;
      const x1 = originX + Math.cos(angle) * inner;
      const y1 = originY + Math.sin(angle) * inner;
      const x2 = originX + Math.cos(angle) * outer;
      const y2 = originY + Math.sin(angle) * outer;
      return (
        <line
          key={`speed-${burstIndex}-${index}`}
          x1={clamp(x1, originX)}
          y1={clamp(y1, originY)}
          x2={clamp(x2, originX)}
          y2={clamp(y2, originY)}
          stroke="#1f1f29"
          strokeWidth="0.7"
          strokeLinecap="round"
          opacity={opacity}
          vectorEffect="non-scaling-stroke"
        />
      );
    });
  });
}

function renderSfx(item: VectorSceneSfx, index: number) {
  return (
    <text
      key={`sfx-${index}`}
      x={clamp(item.x, 50)}
      y={clamp(item.y, 30)}
      transform={`rotate(${clamp(item.rotation, 0, -45, 45)} ${clamp(item.x, 50)} ${clamp(item.y, 30)})`}
      textAnchor="middle"
      dominantBaseline="middle"
      fontFamily="var(--font-display, 'Bangers', 'Impact', sans-serif)"
      fontSize={clamp(item.size, 16, 6, 36)}
      fontWeight="900"
      letterSpacing="0"
      fill={upperToken(item.fill, "#fffaf0")}
      stroke={upperToken(item.stroke, "#1f1f29")}
      strokeWidth="1.7"
      paintOrder="stroke fill"
      opacity="0.92"
    >
      {item.text}
    </text>
  );
}

interface SceneIds {
  background: string;
  tone: string;
  focus: string;
  vignette: string;
}

function VectorDefs({ scene, ids }: { scene: VectorScene; ids: SceneIds }) {
  const background: VectorSceneBackground = scene.background ?? {};
  const tone = scene.tone;
  const coords = gradientCoords(background.gradient_angle);
  const toneScale = clamp(tone?.scale, 6, 2, 24);
  const toneStroke = upperToken(tone?.stroke, "#1f1f29");
  return (
    <defs>
      <linearGradient id={ids.background} {...coords}>
        <stop offset="0%" stopColor={upperToken(background.fill, "#fbfaf4")} />
        <stop offset="100%" stopColor={upperToken(background.gradient_to, upperToken(background.fill, "#fbfaf4"))} />
      </linearGradient>
      {tone?.pattern === "hatching" || tone?.pattern === "crosshatch" ? (
        <pattern id={ids.tone} width={toneScale} height={toneScale} patternUnits="userSpaceOnUse" patternTransform="rotate(28)">
          <line x1="0" y1="0" x2="0" y2={toneScale} stroke={toneStroke} strokeWidth="0.7" />
          {tone.pattern === "crosshatch" && (
            <line x1={toneScale / 2} y1="0" x2={toneScale / 2} y2={toneScale} stroke={toneStroke} strokeWidth="0.55" />
          )}
        </pattern>
      ) : (
        <pattern id={ids.tone} width={toneScale} height={toneScale} patternUnits="userSpaceOnUse">
          <circle cx={toneScale / 2} cy={toneScale / 2} r={tone?.pattern === "grain" ? 0.55 : 0.8} fill={toneStroke} />
        </pattern>
      )}
      <radialGradient id={ids.focus} cx={`${clamp(scene.radial_focus?.x, 50)}%`} cy={`${clamp(scene.radial_focus?.y, 45)}%`} r={`${clamp(scene.radial_focus?.radius, 72, 10, 120)}%`}>
        <stop offset="0%" stopColor="#ffffff" stopOpacity={clamp(scene.radial_focus?.opacity, 0.18, 0, 1)} />
        <stop offset="64%" stopColor="#ffffff" stopOpacity="0" />
        <stop offset="100%" stopColor="#1f1f29" stopOpacity="0.08" />
      </radialGradient>
      <radialGradient id={ids.vignette} cx="50%" cy="50%" r="72%">
        <stop offset="58%" stopColor="#1f1f29" stopOpacity="0" />
        <stop offset="100%" stopColor="#1f1f29" stopOpacity="0.22" />
      </radialGradient>
    </defs>
  );
}

interface VectorSceneLayerProps {
  panel: StoryboardPanel;
  scene?: VectorScene | null;
}

const LAYER_STYLE: CSSProperties = {
  zIndex: 2,
  mixBlendMode: "multiply",
};

export function VectorSceneLayer({ panel, scene }: VectorSceneLayerProps) {
  const effectiveScene = withRequiredInk(panel, scene);
  const safeId = panel.panel_id.replace(/[^a-zA-Z0-9_-]/g, "-");
  const ids: SceneIds = {
    background: `vector-bg-${safeId}`,
    tone: `vector-tone-${safeId}`,
    focus: `vector-focus-${safeId}`,
    vignette: `vector-vignette-${safeId}`,
  };

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={LAYER_STYLE}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <VectorDefs scene={effectiveScene} ids={ids} />
      <rect x="0" y="0" width="100" height="100" fill={`url(#${ids.background})`} />
      {renderTone(effectiveScene, ids)}
      {effectiveScene.radial_focus && (
        <rect
          x="0"
          y="0"
          width="100"
          height="100"
          fill={`url(#${ids.focus})`}
          opacity={clamp(effectiveScene.radial_focus.opacity, 0.18, 0, 1)}
        />
      )}
      {renderSpeedlines(effectiveScene)}
      {effectiveScene.linework?.map(renderLine)}
      {renderSilhouettes(effectiveScene)}
      {effectiveScene.vignette && <rect x="0" y="0" width="100" height="100" fill={`url(#${ids.vignette})`} />}
      {effectiveScene.sfx?.map(renderSfx)}
    </svg>
  );
}
