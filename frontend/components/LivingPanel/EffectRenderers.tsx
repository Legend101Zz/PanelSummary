/**
 * EffectRenderers.tsx — Ink-based manga visual effects
 * =====================================================
 * Everything here should feel like it was drawn with a pen.
 * No neon glows. No emoji sparkles. INK.
 */

import type {
  EffectLayer, ShapeLayer, DataBlockLayer, SceneTransitionLayer,
} from "@/lib/living-panel-types";
import { MangaSpeedLines, InkSplash, Screentone, CrosshatchShading, SoundEffect } from "./MangaInk";

// ============================================================
// EFFECT RENDERER
// ============================================================

export function EffectRenderer({ layer }: { layer: EffectLayer }) {
  const { props } = layer;

  switch (props.effect) {
    case "speed_lines":
      return (
        <MangaSpeedLines
          direction={props.direction === "left" || props.direction === "right" ? "horizontal" : props.direction === "up" || props.direction === "down" ? "vertical" : "radial"}
          intensity={props.intensity ?? 0.5}
          ink={props.color || "#1A1825"}
        />
      );
    case "impact_burst":
      return <InkSplash x="50%" y="50%" size={80} ink={props.color || "#1A1825"} opacity={0.25} />;
    case "screentone":
      return <Screentone density="medium" opacity={props.intensity ?? 0.12} />;
    case "crosshatch":
      return <CrosshatchShading angle={45} spacing={6} opacity={props.intensity ?? 0.1} />;
    case "vignette":
      return <VignetteEffect color={props.color} intensity={props.intensity} />;
    case "sfx":
      return (
        <SoundEffect
          text={props.sfxText || "!!"}
          size={props.sfxSize || 48}
          rotate={props.sfxRotate ?? -12}
          ink={props.color || "#1A1825"}
          outline={props.sfxOutline !== false}
        />
      );
    case "particles":
      return <InkDotsEffect count={props.count} color={props.color} />;
    case "sparkle":
      return <InkSparkleEffect count={props.count} color={props.color} />;
    default:
      return null;
  }
}

// ============================================================
// INK-BASED PARTICLE EFFECTS
// ============================================================

function InkDotsEffect({ count = 15, color = "#1A1825" }: {
  count?: number; color?: string;
}) {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 800 600">
      {Array.from({ length: count }, (_, i) => {
        const seed = i * 137.508;
        const cx = (seed * 3.7) % 800;
        const cy = (seed * 2.3) % 600;
        const r = 1 + (seed % 4);
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill={color} opacity={0.06 + (seed % 5) * 0.03}>
            <animate
              attributeName="opacity"
              values={`${0.06 + (seed % 5) * 0.03};${0.15};${0.06 + (seed % 5) * 0.03}`}
              dur={`${3 + (seed % 4)}s`}
              begin={`${(seed % 2)}s`}
              repeatCount="indefinite"
            />
          </circle>
        );
      })}
    </svg>
  );
}

function InkSparkleEffect({ count = 8, color = "#1A1825" }: {
  count?: number; color?: string;
}) {
  // Small 4-point stars drawn with lines — like pen marks
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 800 600">
      {Array.from({ length: count }, (_, i) => {
        const seed = i * 137.508;
        const cx = 60 + (seed * 3.7) % 680;
        const cy = 60 + (seed * 2.3) % 480;
        const sz = 4 + (seed % 8);
        return (
          <g key={i} opacity={0.15 + (seed % 3) * 0.05}>
            <line x1={cx - sz} y1={cy} x2={cx + sz} y2={cy} stroke={color} strokeWidth="1" strokeLinecap="round" />
            <line x1={cx} y1={cy - sz} x2={cx} y2={cy + sz} stroke={color} strokeWidth="1" strokeLinecap="round" />
            <animate
              attributeName="opacity"
              values="0.15;0.35;0.15"
              dur={`${2 + (seed % 3)}s`}
              begin={`${(seed % 2)}s`}
              repeatCount="indefinite"
            />
          </g>
        );
      })}
    </svg>
  );
}

function VignetteEffect({ color = "#000000", intensity = 0.4 }: {
  color?: string; intensity?: number;
}) {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background: `radial-gradient(ellipse at center, transparent 50%, ${color} 100%)`,
        opacity: intensity,
      }}
    />
  );
}

// ============================================================
// SHAPE RENDERER (ink strokes, not CSS boxes)
// ============================================================

export function ShapeRenderer({ layer }: { layer: ShapeLayer }) {
  const { props } = layer;
  const w = typeof layer.width === "number" ? layer.width : 100;
  const h = typeof layer.height === "number" ? layer.height : 100;
  const stroke = props.stroke || "#1A1825";
  const sw = props.strokeWidth || 2;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {props.shape === "circle" && (
        <circle
          cx={w / 2} cy={h / 2} r={props.radius || w / 2}
          fill={props.fill || "none"}
          stroke={stroke} strokeWidth={sw}
          strokeDasharray={props.dash}
        />
      )}
      {props.shape === "rect" && (
        <rect
          x={sw / 2} y={sw / 2} width={w - sw} height={h - sw}
          fill={props.fill || "none"}
          stroke={stroke} strokeWidth={sw}
          strokeDasharray={props.dash}
        />
      )}
      {props.shape === "line" && (
        <line
          x1={0} y1={h / 2} x2={w} y2={h / 2}
          stroke={stroke} strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={props.dash}
        />
      )}
    </svg>
  );
}

// ============================================================
// DATA BLOCK RENDERER (ink/paper style, not neon boxes)
// ============================================================

export function DataBlockRenderer({
  layer, isAnimating,
}: {
  layer: DataBlockLayer; isAnimating?: boolean;
}) {
  const { props } = layer;
  const accent = props.accentColor || "#1A1825";

  return (
    <div className="flex flex-col gap-1 w-full" style={{ maxWidth: 380 }}>
      {props.items.map((item, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-3 py-1.5"
          style={{
            borderBottom: `1px solid ${accent}20`,
            background: item.highlight ? `${accent}08` : "transparent",
            animation: isAnimating && props.animateIn === "stagger"
              ? `stagger-in 0.4s ${(props.staggerDelay || 200) * i}ms both ease-out`
              : undefined,
          }}
        >
          {props.showIndex && (
            <span style={{
              color: accent,
              fontFamily: "var(--font-display)",
              fontSize: "0.9em",
              fontWeight: 700,
              minWidth: 18,
              opacity: 0.6,
            }}>
              {i + 1}
            </span>
          )}
          {item.icon && <span style={{ fontSize: "0.8em" }}>{item.icon}</span>}
          <div>
            <span style={{
              color: accent,
              fontFamily: "var(--font-body)",
              fontSize: "0.85em",
            }}>
              {item.label}
            </span>
            {item.value && (
              <span style={{
                color: `${accent}99`,
                fontFamily: "var(--font-label)",
                fontSize: "0.75em",
                marginLeft: 6,
              }}>
                {item.value}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// SCENE TRANSITION (ink divider, not neon gradient)
// ============================================================

export function SceneTransitionRenderer({ layer }: { layer: SceneTransitionLayer }) {
  const { props } = layer;
  const ink = props.color || "#1A1825";

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex items-center gap-3">
        {/* Ink brush stroke divider */}
        <svg width="60" height="4" viewBox="0 0 60 4">
          <path d="M0 2 Q10 0 20 2 Q30 4 40 2 Q50 0 60 2" fill="none" stroke={ink} strokeWidth="1.5" opacity="0.3" />
        </svg>
        {props.text && (
          <span style={{
            color: `${ink}66`,
            fontSize: 9,
            letterSpacing: "0.15em",
            fontFamily: "var(--font-label)",
            textTransform: "uppercase" as const,
          }}>
            {props.text}
          </span>
        )}
        <svg width="60" height="4" viewBox="0 0 60 4">
          <path d="M0 2 Q10 4 20 2 Q30 0 40 2 Q50 4 60 2" fill="none" stroke={ink} strokeWidth="1.5" opacity="0.3" />
        </svg>
      </div>
    </div>
  );
}
