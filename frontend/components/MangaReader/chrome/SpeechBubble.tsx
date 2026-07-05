"use client";

/**
 * MangaReader/chrome/SpeechBubble.tsx — SVG speech bubble with a real tail
 * =========================================================================
 *
 * Folded into the MangaReader tree by Phase 4.5c (was
 * `V4Engine/SpeechBubble.tsx`). Verbatim port — the lettering treatment
 * is correct and worth preserving across the V4 deletion. Lives under
 * `chrome/` because it is a presentational primitive shared by every
 * panel sub-renderer; "chrome" matches the intent the way the legacy
 * `V4Engine/` namespace did, but tied to MangaReader's lifecycle.
 *
 * No behaviour changes — same SVG path math, same accessibility
 * scaffolding (children render in real DOM so screen readers + CSS
 * inheritance keep working). 4.5c moves it; 4.5d / future polish can
 * iterate on the shape.
 */

import type { CSSProperties, ReactNode } from "react";

export type SpeechBubbleVariant = "speech" | "thought" | "shout";

export interface SpeechBubbleProps {
  /** Which side of the bubble the tail sticks out of. */
  tailSide: "left" | "right" | "bottom" | "top";
  /**
   * Position along the chosen side, ``0..1``. ``0.5`` is centered.
   * Lets the parent line the tail up with the speaker's mouth/avatar
   * without re-rendering the bubble path from scratch.
   */
  tailOffset?: number;
  variant?: SpeechBubbleVariant;
  /** Stroke colour. Use the emotion's accent so palette-driven UI works. */
  strokeColor: string;
  /** Fill colour. Usually a tinted version of ``strokeColor``. */
  fillColor: string;
  /** Stroke width in SVG user units (the SVG is 100×100). */
  strokeWidth?: number;
  /** Seed for the hand-drawn outline wobble. Same seed => stable shape. */
  irregularitySeed?: number;
  /** Optional inline CSS so the parent can absolutely-position the bubble. */
  style?: CSSProperties;
  /** Lettering content. Rendered in real DOM (not foreignObject) so
   *  screen readers, CSS inheritance, and selection all work. */
  children?: ReactNode;
  /** Used as the SVG title for accessibility tooling. */
  ariaLabel?: string;
}

/**
 * Build the SVG path for the bubble body + tail in a 100×100 viewbox.
 *
 * The body is a rounded rectangle inset by 6 units on each side so
 * stroke width up to 4 doesn't clip. The tail is a triangle attached
 * to the chosen side at ``tailOffset`` along that side.
 */
function seedWobble(seed: number, index: number, amount: number): number {
  if (!seed) return 0;
  const raw = Math.sin((seed + 1) * (index + 11) * 12.9898) * 43758.5453;
  return (raw - Math.floor(raw) - 0.5) * amount * 2;
}

export function buildBubblePath(
  variant: SpeechBubbleVariant,
  tailSide: SpeechBubbleProps["tailSide"],
  tailOffset: number,
  irregularitySeed = 0,
): string {
  const inset = 6;
  const left = inset + seedWobble(irregularitySeed, 1, 1.6);
  const right = 100 - inset + seedWobble(irregularitySeed, 2, 1.4);
  const top = inset + seedWobble(irregularitySeed, 3, 1.4);
  const bottom = 100 - inset + seedWobble(irregularitySeed, 4, 1.8);
  const r = variant === "shout" ? 5 : variant === "thought" ? 17 : 11;
  const rtl = Math.max(variant === "shout" ? 3 : 8, r + seedWobble(irregularitySeed, 5, 2.5));
  const rtr = Math.max(variant === "shout" ? 3 : 8, r + seedWobble(irregularitySeed, 6, 2.2));
  const rbr = Math.max(variant === "shout" ? 3 : 8, r + seedWobble(irregularitySeed, 7, 2.5));
  const rbl = Math.max(variant === "shout" ? 3 : 8, r + seedWobble(irregularitySeed, 8, 2.2));

  // Organic rounded rectangle body, drawn clockwise. Cubic/quad curves
  // let each bubble feel inked by hand while remaining deterministic.
  const body = [
    `M ${left + rtl} ${top}`,
    `C ${left + 32} ${top + seedWobble(irregularitySeed, 9, 1.4)} ${right - 34} ${top + seedWobble(irregularitySeed, 10, 1.2)} ${right - rtr} ${top}`,
    `Q ${right + seedWobble(irregularitySeed, 11, 1.5)} ${top + seedWobble(irregularitySeed, 12, 1.5)} ${right} ${top + rtr}`,
    `L ${right + seedWobble(irregularitySeed, 13, 0.9)} ${bottom - rbr}`,
    `Q ${right + seedWobble(irregularitySeed, 14, 1.4)} ${bottom + seedWobble(irregularitySeed, 15, 1.4)} ${right - rbr} ${bottom}`,
    `C ${right - 30} ${bottom + seedWobble(irregularitySeed, 16, 1.3)} ${left + 31} ${bottom + seedWobble(irregularitySeed, 17, 1.4)} ${left + rbl} ${bottom}`,
    `Q ${left + seedWobble(irregularitySeed, 18, 1.4)} ${bottom + seedWobble(irregularitySeed, 19, 1.4)} ${left} ${bottom - rbl}`,
    `L ${left + seedWobble(irregularitySeed, 20, 0.9)} ${top + rtl}`,
    `Q ${left + seedWobble(irregularitySeed, 21, 1.5)} ${top + seedWobble(irregularitySeed, 22, 1.5)} ${left + rtl} ${top}`,
    "Z",
  ].join(" ");

  // Tail. Clamp the offset away from the corners so the tail never
  // fights the corner radius.
  const o = Math.min(0.85, Math.max(0.15, tailOffset));
  const tailLen = variant === "shout" ? 14 : 10;
  const tailHalfBase = variant === "shout" ? 8 : 6;

  let tail = "";
  if (tailSide === "left" || tailSide === "right") {
    const y = top + (bottom - top) * o;
    if (tailSide === "left") {
      tail = `M ${left + 1} ${y - tailHalfBase} L ${left - tailLen} ${y + seedWobble(irregularitySeed, 23, 1.2)} L ${left + 1} ${y + tailHalfBase} Z`;
    } else {
      tail = `M ${right - 1} ${y - tailHalfBase} L ${right + tailLen} ${y + seedWobble(irregularitySeed, 24, 1.2)} L ${right - 1} ${y + tailHalfBase} Z`;
    }
  } else {
    const x = left + (right - left) * o;
    if (tailSide === "top") {
      tail = `M ${x - tailHalfBase} ${top + 1} L ${x + seedWobble(irregularitySeed, 25, 1.2)} ${top - tailLen} L ${x + tailHalfBase} ${top + 1} Z`;
    } else {
      tail = `M ${x - tailHalfBase} ${bottom - 1} L ${x + seedWobble(irregularitySeed, 26, 1.2)} ${bottom + tailLen} L ${x + tailHalfBase} ${bottom - 1} Z`;
    }
  }

  return `${body} ${tail}`;
}

/**
 * Thought-bubble extras: small "puff" circles between speaker and
 * bubble. Only rendered when ``variant === "thought"``.
 */
function ThoughtPuffs({
  tailSide,
  tailOffset,
  strokeColor,
  fillColor,
  strokeWidth,
}: {
  tailSide: SpeechBubbleProps["tailSide"];
  tailOffset: number;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
}) {
  const o = Math.min(0.85, Math.max(0.15, tailOffset));
  const inset = 6;
  const positions: { cx: number; cy: number; r: number }[] = [];
  if (tailSide === "left") {
    const y = inset + (100 - 2 * inset) * o;
    positions.push({ cx: inset - 6, cy: y, r: 3 });
    positions.push({ cx: inset - 14, cy: y + 4, r: 2 });
  } else if (tailSide === "right") {
    const y = inset + (100 - 2 * inset) * o;
    positions.push({ cx: 100 - inset + 6, cy: y, r: 3 });
    positions.push({ cx: 100 - inset + 14, cy: y + 4, r: 2 });
  } else if (tailSide === "top") {
    const x = inset + (100 - 2 * inset) * o;
    positions.push({ cx: x, cy: inset - 6, r: 3 });
    positions.push({ cx: x + 4, cy: inset - 14, r: 2 });
  } else {
    const x = inset + (100 - 2 * inset) * o;
    positions.push({ cx: x, cy: 100 - inset + 6, r: 3 });
    positions.push({ cx: x + 4, cy: 100 - inset + 14, r: 2 });
  }
  return (
    <>
      {positions.map((p, i) => (
        <circle
          key={i}
          cx={p.cx}
          cy={p.cy}
          r={p.r}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={strokeWidth * 0.75}
        />
      ))}
    </>
  );
}

export function SpeechBubble({
  tailSide,
  tailOffset = 0.5,
  variant = "speech",
  strokeColor,
  fillColor,
  strokeWidth = 2,
  irregularitySeed = 0,
  style,
  children,
  ariaLabel,
}: SpeechBubbleProps) {
  const path = buildBubblePath(variant, tailSide, tailOffset, irregularitySeed);

  return (
    <div
      style={{
        position: "relative",
        // Default sizing; parent should override via ``style``.
        width: 200,
        height: 100,
        ...style,
      }}
      role="figure"
      aria-label={ariaLabel}
    >
      <svg
        viewBox="-20 -20 140 140"
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          // ``overflow:visible`` so the tail and thought puffs sit
          // outside the bubble bounding box without being clipped.
          overflow: "visible",
        }}
        aria-hidden={ariaLabel ? undefined : true}
      >
        <path
          d={path}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
        {variant === "thought" && (
          <ThoughtPuffs
            tailSide={tailSide}
            tailOffset={tailOffset}
            strokeColor={strokeColor}
            fillColor={fillColor}
            strokeWidth={strokeWidth}
          />
        )}
      </svg>
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          padding: "clamp(8px, 1.2vw, 18px) 21%",
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </div>
  );
}
