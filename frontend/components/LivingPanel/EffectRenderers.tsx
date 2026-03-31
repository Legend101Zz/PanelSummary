/**
 * EffectRenderers.tsx — Visual effects and shape layer renderers
 * ===============================================================
 * Separated from LayerRenderers for file size management.
 * These render SVG effects, CSS particles, and geometric shapes.
 */

import type {
  EffectLayer,
  ShapeLayer,
  DataBlockLayer,
  SceneTransitionLayer,
} from "@/lib/living-panel-types";

// ============================================================
// EFFECT RENDERER
// ============================================================

export function EffectRenderer({ layer }: { layer: EffectLayer }) {
  const { props } = layer;

  switch (props.effect) {
    case "speed_lines":
      return <SpeedLinesEffect color={props.color} count={props.count} intensity={props.intensity} />;
    case "particles":
      return <ParticlesEffect color={props.color} count={props.count} direction={props.direction} />;
    case "sparkle":
      return <SparkleEffect color={props.color} count={props.count} />;
    case "vignette":
      return <VignetteEffect color={props.color} intensity={props.intensity} />;
    case "impact_burst":
      return <ImpactBurstEffect color={props.color} />;
    case "screen_shake":
      return null;
    default:
      return null;
  }
}

function SpeedLinesEffect({ color = "#00f5ff", count = 24, intensity = 0.5 }: {
  color?: string; count?: number; intensity?: number;
}) {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * 360 * Math.PI / 180;
        return (
          <line
            key={i}
            x1={400} y1={300}
            x2={400 + Math.cos(angle) * 900}
            y2={300 + Math.sin(angle) * 900}
            stroke={color}
            strokeWidth={0.4 + (i % 3) * 0.4}
            opacity={intensity * 0.15}
          />
        );
      })}
    </svg>
  );
}

function ParticlesEffect({ color = "#ffffff", count = 20, direction = "up" }: {
  color?: string; count?: number; direction?: string;
}) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: count }, (_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 3;
        const duration = 2 + Math.random() * 3;
        const size = 2 + Math.random() * 4;

        return (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${left}%`,
              bottom: direction === "up" ? "-10px" : undefined,
              top: direction === "down" ? "-10px" : undefined,
              width: size,
              height: size,
              background: color,
              opacity: 0.3 + Math.random() * 0.4,
              animation: `particle-${direction || "up"} ${duration}s ${delay}s infinite linear`,
            }}
          />
        );
      })}
    </div>
  );
}

function SparkleEffect({ color = "#ffd700", count = 12 }: {
  color?: string; count?: number;
}) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: count }, (_, i) => {
        const left = 10 + Math.random() * 80;
        const top = 10 + Math.random() * 80;
        const delay = Math.random() * 2;
        const size = 4 + Math.random() * 8;

        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: size,
              height: size,
              color: color,
              fontSize: size * 2,
              animation: `sparkle-twinkle 1.5s ${delay}s infinite ease-in-out`,
            }}
          >
            ✨
          </div>
        );
      })}
    </div>
  );
}

function VignetteEffect({ color = "#000000", intensity = 0.6 }: {
  color?: string; intensity?: number;
}) {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background: `radial-gradient(ellipse at center, transparent 40%, ${color} 100%)`,
        opacity: intensity,
      }}
    />
  );
}

function ImpactBurstEffect({ color = "#ffffff" }: { color?: string }) {
  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      <div
        className="rounded-full"
        style={{
          width: 120,
          height: 120,
          background: `radial-gradient(circle, ${color}60 0%, transparent 70%)`,
          animation: "impact-burst 0.6s ease-out forwards",
        }}
      />
    </div>
  );
}

// ============================================================
// SHAPE RENDERER
// ============================================================

export function ShapeRenderer({ layer }: { layer: ShapeLayer }) {
  const { props } = layer;
  const w = typeof layer.width === "number" ? layer.width : 100;
  const h = typeof layer.height === "number" ? layer.height : 100;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {props.shape === "circle" && (
        <circle
          cx={w / 2} cy={h / 2} r={props.radius || w / 2}
          fill={props.fill || "none"}
          stroke={props.stroke || "#ffffff"}
          strokeWidth={props.strokeWidth || 2}
          strokeDasharray={props.dash}
        />
      )}
      {props.shape === "rect" && (
        <rect
          x={0} y={0} width={w} height={h}
          fill={props.fill || "none"}
          stroke={props.stroke || "#ffffff"}
          strokeWidth={props.strokeWidth || 2}
          strokeDasharray={props.dash}
        />
      )}
      {props.shape === "line" && (
        <line
          x1={0} y1={h / 2} x2={w} y2={h / 2}
          stroke={props.stroke || "#ffffff"}
          strokeWidth={props.strokeWidth || 2}
          strokeDasharray={props.dash}
        />
      )}
    </svg>
  );
}

// ============================================================
// DATA BLOCK RENDERER
// ============================================================

export function DataBlockRenderer({
  layer,
  isAnimating,
}: {
  layer: DataBlockLayer;
  isAnimating?: boolean;
}) {
  const { props } = layer;
  const accent = props.accentColor || "#00f5ff";

  return (
    <div className="flex flex-col gap-2 w-full" style={{ maxWidth: 400 }}>
      {props.items.map((item, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-2 border"
          style={{
            borderColor: `${accent}30`,
            background: item.highlight ? `${accent}15` : `${accent}08`,
            animation: isAnimating && props.animateIn === "stagger"
              ? `stagger-in 0.4s ${(props.staggerDelay || 200) * i}ms both ease-out`
              : undefined,
          }}
        >
          {props.showIndex && (
            <span
              style={{
                color: accent,
                fontFamily: "var(--font-display, sans-serif)",
                fontSize: "1.1em",
                fontWeight: 700,
                minWidth: 20,
              }}
            >
              {i + 1}
            </span>
          )}
          {item.icon && <span>{item.icon}</span>}
          <div>
            <span
              style={{
                color: "rgba(255,255,255,0.85)",
                fontFamily: "var(--font-body, sans-serif)",
                fontSize: "0.9em",
              }}
            >
              {item.label}
            </span>
            {item.value && (
              <span
                style={{
                  color: accent,
                  fontFamily: "var(--font-label, monospace)",
                  fontSize: "0.8em",
                  marginLeft: 8,
                }}
              >
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
// SCENE TRANSITION RENDERER
// ============================================================

export function SceneTransitionRenderer({ layer }: { layer: SceneTransitionLayer }) {
  const { props } = layer;

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex items-center gap-4">
        <div
          className="h-px w-16"
          style={{
            background: `linear-gradient(90deg, transparent, ${props.color || "#ffffff"})`,
          }}
        />
        {props.text && (
          <span
            style={{
              color: props.color || "rgba(255,255,255,0.4)",
              fontSize: "9px",
              letterSpacing: "0.2em",
              fontFamily: "var(--font-label, monospace)",
              textTransform: "uppercase",
            }}
          >
            {props.text}
          </span>
        )}
        <div
          className="h-px w-16"
          style={{
            background: `linear-gradient(90deg, ${props.color || "#ffffff"}, transparent)`,
          }}
        />
      </div>
    </div>
  );
}
