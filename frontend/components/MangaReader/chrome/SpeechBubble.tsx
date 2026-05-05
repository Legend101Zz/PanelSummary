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
function buildBubblePath(
  variant: SpeechBubbleVariant,
  tailSide: SpeechBubbleProps["tailSide"],
  tailOffset: number,
): string {
  const inset = 6;
  const left = inset;
  const right = 100 - inset;
  const top = inset;
  const bottom = 100 - inset;
  const r = variant === "shout" ? 4 : variant === "thought" ? 16 : 10;

  // Rounded rectangle body, drawn clockwise from the top-left corner.
  // Sweep-flag 1 on the corner arcs so fill-rule:nonzero treats the
  // inside as filled.
  const body = [
    `M ${left + r} ${top}`,
    `L ${right - r} ${top}`,
    `A ${r} ${r} 0 0 1 ${right} ${top + r}`,
    `L ${right} ${bottom - r}`,
    `A ${r} ${r} 0 0 1 ${right - r} ${bottom}`,
    `L ${left + r} ${bottom}`,
    `A ${r} ${r} 0 0 1 ${left} ${bottom - r}`,
    `L ${left} ${top + r}`,
    `A ${r} ${r} 0 0 1 ${left + r} ${top}`,
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
      tail = `M ${left} ${y - tailHalfBase} L ${left - tailLen} ${y} L ${left} ${y + tailHalfBase} Z`;
    } else {
      tail = `M ${right} ${y - tailHalfBase} L ${right + tailLen} ${y} L ${right} ${y + tailHalfBase} Z`;
    }
  } else {
    const x = left + (right - left) * o;
    if (tailSide === "top") {
      tail = `M ${x - tailHalfBase} ${top} L ${x} ${top - tailLen} L ${x + tailHalfBase} ${top} Z`;
    } else {
      tail = `M ${x - tailHalfBase} ${bottom} L ${x} ${bottom + tailLen} L ${x + tailHalfBase} ${bottom} Z`;
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
  style,
  children,
  ariaLabel,
}: SpeechBubbleProps) {
  const path = buildBubblePath(variant, tailSide, tailOffset);

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
          padding: "10% 12%",
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </div>
  );
}
