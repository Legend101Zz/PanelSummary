/**
 * SceneLibrary.tsx — Procedural manga scene backgrounds
 * ======================================================
 * Reusable SVG scene components that the LLM selects by name.
 * Each scene is a full 800×600 SVG with manga-ink aesthetic.
 *
 * WHY PROCEDURAL: LLM-generated SVG is inconsistent and expensive.
 * These scenes are deterministic, fast, and visually consistent.
 * The LLM picks a scene name + color overrides — we do the rest.
 */

import React from "react";

interface SceneProps {
  primary?: string;
  accent?: string;
  /** Additional floating elements (nodes, monitors, etc.) */
  elements?: Array<{
    type: string;
    x: string;
    y: string;
    size?: number;
    color?: string;
    label?: string;
  }>;
}

// ============================================================
// SCENE: LABORATORY — research lab with monitors and desks
// ============================================================
function Laboratory({ primary = "#1A1825", accent = "#00ff88", elements }: SceneProps) {
  return (
    <svg viewBox="0 0 800 600" className="w-full h-full" aria-label="Laboratory scene">
      {/* Floor line */}
      <line x1="0" y1="480" x2="800" y2="480" stroke={primary} strokeWidth="2" opacity="0.3" />
      {/* Desk */}
      <rect x="100" y="380" width="250" height="100" fill="none" stroke={primary} strokeWidth="1.5" opacity="0.4" />
      <rect x="450" y="400" width="200" height="80" fill="none" stroke={primary} strokeWidth="1.5" opacity="0.3" />
      {/* Monitor 1 */}
      <rect x="130" y="280" width="120" height="90" rx="3" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.6" />
      <rect x="140" y="290" width="100" height="60" fill={accent} opacity="0.06" />
      {/* Code lines on monitor */}
      {[0, 1, 2, 3, 4].map(i => (
        <line key={i} x1="145" y1={298 + i * 10} x2={195 + (i % 3) * 15} y2={298 + i * 10}
          stroke={accent} strokeWidth="1" opacity={0.3 - i * 0.04} />
      ))}
      {/* Monitor 2 */}
      <rect x="480" y="300" width="100" height="70" rx="3" fill="none" stroke={accent} strokeWidth="1" opacity="0.4" />
      {/* Floating data particles */}
      {[0, 1, 2, 3, 4, 5].map(i => (
        <circle key={`p${i}`}
          cx={150 + i * 100 + (i * 37) % 50}
          cy={150 + (i * 73) % 200}
          r={1.5 + (i % 3)} fill={accent} opacity={0.15 + (i % 3) * 0.05}
        />
      ))}
      {/* Custom elements */}
      {elements?.map((el, i) => (
        <SceneElement key={i} {...el} defaultColor={accent} />
      ))}
    </svg>
  );
}

// ============================================================
// SCENE: DIGITAL REALM — abstract code landscape
// =======================================================
function DigitalRealm({ primary = "#0F0E17", accent = "#00aaff", elements }: SceneProps) {
  return (
    <svg viewBox="0 0 800 600" className="w-full h-full" aria-label="Digital realm scene">
      {/* Grid floor (perspective) */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
        <line key={`h${i}`}
          x1="0" y1={400 + i * 25}
          x2="800" y2={400 + i * 25}
          stroke={accent} strokeWidth="0.5" opacity={0.1 + i * 0.02}
        />
      ))}
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
        <line key={`v${i}`}
          x1={400 + (i - 5) * 20} y1="400"
          x2={400 + (i - 5) * 80} y2="600"
          stroke={accent} strokeWidth="0.5" opacity={0.08}
        />
      ))}
      {/* Floating code blocks */}
      {[0, 1, 2].map(i => (
        <g key={`block${i}`} transform={`translate(${150 + i * 220}, ${100 + (i * 47) % 120})`}>
          <rect width="120" height="80" rx="4" fill="none" stroke={accent} strokeWidth="1" opacity="0.3" />
          {[0, 1, 2, 3].map(j => (
            <line key={j} x1="10" y1={15 + j * 15} x2={50 + (j * 17) % 60} y2={15 + j * 15}
              stroke={accent} strokeWidth="0.8" opacity={0.2} />
          ))}
        </g>
      ))}
      {/* Data streams */}
      <path d="M0,300 Q200,250 400,300 Q600,350 800,280" fill="none" stroke={accent} strokeWidth="1" opacity="0.15" />
      <path d="M0,320 Q200,280 400,320 Q600,360 800,310" fill="none" stroke={accent} strokeWidth="0.5" opacity="0.1" />
      {elements?.map((el, i) => <SceneElement key={i} {...el} defaultColor={accent} />)}
    </svg>
  );
}

// ============================================================
// SCENE: BATTLEFIELD — competition/benchmark arena
// ============================================================
function Battlefield({ primary = "#1A1825", accent = "#E8191A", elements }: SceneProps) {
  return (
    <svg viewBox="0 0 800 600" className="w-full h-full" aria-label="Battlefield scene">
      {/* Dramatic ground crack */}
      <path d="M0,500 L200,490 L350,510 L400,480 L500,505 L650,485 L800,500"
        fill="none" stroke={primary} strokeWidth="2" opacity="0.4" />
      {/* Impact lines radiating from center */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
        const angle = (i / 8) * Math.PI * 2;
        const innerR = 40;
        const outerR = 150 + (i * 31) % 80;
        return (
          <line key={i}
            x1={400 + Math.cos(angle) * innerR}
            y1={300 + Math.sin(angle) * innerR}
            x2={400 + Math.cos(angle) * outerR}
            y2={300 + Math.sin(angle) * outerR}
            stroke={accent} strokeWidth="1" opacity={0.15 + (i % 3) * 0.05}
          />
        );
      })}
      {/* Scattered debris dots */}
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => (
        <circle key={i}
          cx={100 + (i * 97) % 600} cy={350 + (i * 43) % 130}
          r={1 + i % 3} fill={primary} opacity={0.2}
        />
      ))}
      {/* VS divider */}
      <line x1="400" y1="100" x2="400" y2="450" stroke={accent} strokeWidth="1" opacity="0.1" strokeDasharray="8 4" />
      {elements?.map((el, i) => <SceneElement key={i} {...el} defaultColor={accent} />)}
    </svg>
  );
}

// ============================================================
// SCENE: WORKSHOP — crafting/forging/building space
// ============================================================
function Workshop({ primary = "#1A1825", accent = "#ffc220", elements }: SceneProps) {
  return (
    <svg viewBox="0 0 800 600" className="w-full h-full" aria-label="Workshop scene">
      {/* Workbench */}
      <rect x="50" y="380" width="700" height="15" fill="none" stroke={primary} strokeWidth="1.5" opacity="0.3" />
      {/* Legs */}
      <line x1="80" y1="395" x2="80" y2="500" stroke={primary} strokeWidth="1.5" opacity="0.2" />
      <line x1="720" y1="395" x2="720" y2="500" stroke={primary} strokeWidth="1.5" opacity="0.2" />
      {/* Tools hanging */}
      {[0, 1, 2, 3].map(i => (
        <g key={i} transform={`translate(${200 + i * 120}, 120)`}>
          <line x1="0" y1="0" x2="0" y2={30 + i * 10} stroke={primary} strokeWidth="0.8" opacity="0.2" />
          <rect x="-8" y={30 + i * 10} width="16" height={20 + (i % 2) * 10} rx="2"
            fill="none" stroke={accent} strokeWidth="1" opacity="0.3" />
        </g>
      ))}
      {/* Sparks */}
      {[0, 1, 2, 3, 4].map(i => (
        <circle key={`s${i}`}
          cx={350 + (i * 53) % 100} cy={320 + (i * 37) % 60}
          r="1.5" fill={accent} opacity={0.4 - i * 0.06}
        />
      ))}
      {/* Anvil shape */}
      <path d="M370,370 L380,350 L420,350 L430,370 Z" fill="none" stroke={primary} strokeWidth="1.5" opacity="0.3" />
      {elements?.map((el, i) => <SceneElement key={i} {...el} defaultColor={accent} />)}
    </svg>
  );
}

// ============================================================
// SCENE: SUMMIT — mountain/achievement view
// ============================================================
function Summit({ primary = "#1A1825", accent = "#0053e2", elements }: SceneProps) {
  return (
    <svg viewBox="0 0 800 600" className="w-full h-full" aria-label="Summit scene">
      {/* Mountain silhouettes */}
      <path d="M0,500 L150,250 L300,400 L450,200 L600,350 L750,280 L800,500 Z"
        fill="none" stroke={primary} strokeWidth="1.5" opacity="0.2" />
      <path d="M0,520 L200,350 L350,450 L500,300 L700,420 L800,500 Z"
        fill="none" stroke={primary} strokeWidth="1" opacity="0.1" />
      {/* Stars/sparkles */}
      {[0, 1, 2, 3, 4, 5, 6].map(i => (
        <circle key={i}
          cx={100 + (i * 113) % 600} cy={50 + (i * 37) % 150}
          r={0.8 + i % 2} fill={accent} opacity={0.2 + (i % 3) * 0.05}
        />
      ))}
      {/* Horizon glow line */}
      <line x1="0" y1="500" x2="800" y2="500" stroke={accent} strokeWidth="1" opacity="0.15" />
      {elements?.map((el, i) => <SceneElement key={i} {...el} defaultColor={accent} />)}
    </svg>
  );
}

// ============================================================
// SCENE: VOID — empty dark space for dramatic moments
// ============================================================
function Void({ primary = "#0F0E17", accent = "#E8191A", elements }: SceneProps) {
  return (
    <svg viewBox="0 0 800 600" className="w-full h-full" aria-label="Void scene">
      {/* Subtle vortex lines */}
      {[0, 1, 2, 3].map(i => (
        <ellipse key={i}
          cx="400" cy="300"
          rx={80 + i * 60} ry={40 + i * 30}
          fill="none" stroke={accent} strokeWidth="0.5"
          opacity={0.06 + i * 0.02}
          transform={`rotate(${i * 15} 400 300)`}
        />
      ))}
      {/* Center point */}
      <circle cx="400" cy="300" r="3" fill={accent} opacity="0.2" />
      {elements?.map((el, i) => <SceneElement key={i} {...el} defaultColor={accent} />)}
    </svg>
  );
}

// ============================================================
// SCENE: CLASSROOM — learning/discussion setting
// ============================================================
function Classroom({ primary = "#1A1825", accent = "#2a8703", elements }: SceneProps) {
  return (
    <svg viewBox="0 0 800 600" className="w-full h-full" aria-label="Classroom scene">
      {/* Whiteboard */}
      <rect x="150" y="80" width="500" height="300" rx="4" fill="none" stroke={primary} strokeWidth="2" opacity="0.25" />
      {/* Whiteboard content lines */}
      {[0, 1, 2, 3, 4, 5].map(i => (
        <line key={i}
          x1="180" y1={120 + i * 40}
          x2={380 + (i * 31) % 200} y2={120 + i * 40}
          stroke={accent} strokeWidth="1" opacity={0.15}
        />
      ))}
      {/* Floor */}
      <line x1="0" y1="500" x2="800" y2="500" stroke={primary} strokeWidth="1" opacity="0.2" />
      {/* Desks (perspective) */}
      {[0, 1, 2].map(i => (
        <rect key={i}
          x={150 + i * 180} y={440 + i * 8}
          width="120" height="8" rx="1"
          fill="none" stroke={primary} strokeWidth="1" opacity={0.15}
        />
      ))}
      {elements?.map((el, i) => <SceneElement key={i} {...el} defaultColor={accent} />)}
    </svg>
  );
}

// ============================================================
// ELEMENT RENDERER (floating items the LLM can place)
// ============================================================
function SceneElement({
  type, x, y, size = 24, color, label, defaultColor = "#1A1825",
}: {
  type: string;
  x: string;
  y: string;
  size?: number;
  color?: string;
  label?: string;
  defaultColor?: string;
}) {
  const c = color || defaultColor;
  const px = parseFloat(x) / 100 * 800;
  const py = parseFloat(y) / 100 * 600;

  const elementMap: Record<string, React.ReactNode> = {
    node: (
      <g transform={`translate(${px}, ${py})`}>
        <circle r={size / 2} fill="none" stroke={c} strokeWidth="1" opacity="0.4" />
        <circle r={size / 6} fill={c} opacity="0.3" />
        {label && <text y={size / 2 + 12} textAnchor="middle" fill={c} fontSize="8" opacity="0.5">{label}</text>}
      </g>
    ),
    monitor: (
      <g transform={`translate(${px}, ${py})`}>
        <rect x={-size / 2} y={-size / 2} width={size} height={size * 0.7} rx="2"
          fill="none" stroke={c} strokeWidth="1" opacity="0.4" />
        <line x1="0" y1={size * 0.2} x2="0" y2={size * 0.4} stroke={c} strokeWidth="1" opacity="0.2" />
      </g>
    ),
    chart: (
      <g transform={`translate(${px}, ${py})`}>
        {[0, 1, 2, 3].map(i => (
          <rect key={i}
            x={-size / 2 + i * (size / 4)}
            y={-size / 4 - (i * 13) % (size / 2)}
            width={size / 5}
            height={(i * 13) % (size / 2) + size / 4}
            fill={c} opacity="0.2"
          />
        ))}
      </g>
    ),
    spark: (
      <g transform={`translate(${px}, ${py})`}>
        <line x1="0" y1={-size / 3} x2="0" y2={size / 3} stroke={c} strokeWidth="1.5" opacity="0.4" />
        <line x1={-size / 3} y1="0" x2={size / 3} y2="0" stroke={c} strokeWidth="1.5" opacity="0.4" />
        <line x1={-size / 4} y1={-size / 4} x2={size / 4} y2={size / 4} stroke={c} strokeWidth="1" opacity="0.3" />
        <line x1={size / 4} y1={-size / 4} x2={-size / 4} y2={size / 4} stroke={c} strokeWidth="1" opacity="0.3" />
      </g>
    ),
  };

  return <>{elementMap[type] || elementMap.node}</>;
}

// ============================================================
// SCENE REGISTRY — maps scene names to components
// ============================================================
export const SCENE_REGISTRY: Record<string, React.FC<SceneProps>> = {
  laboratory: Laboratory,
  lab: Laboratory,
  "digital-realm": DigitalRealm,
  digital: DigitalRealm,
  battlefield: Battlefield,
  arena: Battlefield,
  workshop: Workshop,
  forge: Workshop,
  summit: Summit,
  mountain: Summit,
  void: Void,
  darkness: Void,
  classroom: Classroom,
  school: Classroom,
};

export type { SceneProps };
