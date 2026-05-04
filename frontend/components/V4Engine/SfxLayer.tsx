"use client";

/**
 * SfxLayer \u2014 Sound-effect overlay for a panel (Phase C5).
 * ========================================================
 *
 * Real manga uses big, hand-lettered sound effects (BOOM, CRACK,
 * SHHH...) as part of the art. Our backend currently emits a flat
 * ``effects: string[]`` per panel for visual treatments
 * (``screentone``, ``sparkle``, ``impact``...). This component reads
 * the same field but treats *recognised SFX tokens* as text overlays
 * to render on top of the panel art.
 *
 * Keeping this client-side has two virtues:
 *
 * 1. The backend stays untouched. The same V4 schema that already
 *    drives mood and screentones now drives SFX too \u2014 no new field,
 *    no new validator, no new migration.
 * 2. We can iterate on visual treatment (rotation, jitter, font) without
 *    a backend roundtrip. Storyboard authors only need to learn one
 *    rule: "if you want a SFX, add the token to ``effects``".
 *
 * Tokens we recognise as SFX (everything else is treated as a visual
 * effect, same as before):
 *
 *   ``boom``, ``bang``, ``crack``, ``crash``, ``slam``, ``thud``,
 *   ``pow``, ``zap``, ``whoosh``, ``shhh``, ``hush``, ``tap``,
 *   ``ding``, ``clang``, ``swoosh``, ``rumble``, ``flash``.
 *
 * The token-to-display mapping uppercases the word and adds an
 * exclamation point for impact tokens; quiet tokens (``shhh``,
 * ``hush``, ``tap``) get an ellipsis instead.
 */

import { motion } from "motion/react";
import type { CSSProperties } from "react";

const IMPACT_TOKENS = new Set([
  "boom",
  "bang",
  "crack",
  "crash",
  "slam",
  "thud",
  "pow",
  "zap",
  "clang",
  "rumble",
  "flash",
]);

const SOFT_TOKENS = new Set(["shhh", "hush", "tap", "ding"]);

const MOTION_TOKENS = new Set(["whoosh", "swoosh"]);

const ALL_SFX_TOKENS = new Set<string>([
  ...IMPACT_TOKENS,
  ...SOFT_TOKENS,
  ...MOTION_TOKENS,
]);

/**
 * Recognise SFX tokens from a panel's ``effects`` array. Returns the
 * lowercase tokens in original order. Anything not in our vocabulary
 * is dropped here \u2014 the panel renderer keeps consuming the full list
 * for screentone/sparkle/impact treatments, so non-SFX tokens still
 * flow through it.
 */
export function extractSfxTokens(effects: string[] | undefined): string[] {
  if (!effects) return [];
  return effects
    .map((e) => e.toLowerCase())
    .filter((e) => ALL_SFX_TOKENS.has(e));
}

interface SfxStyle {
  text: string;
  rotation: number;
  fontSize: string;
  color: string;
  stroke: string;
  position: { top: string; left: string } | { bottom: string; right: string };
  weight: number;
}

/**
 * Decide how a single SFX token renders. We pseudo-randomise on the
 * token text + index so the same token always looks the same on a
 * reload, but two SFX on one panel get different rotations.
 */
function styleForToken(token: string, index: number, accent: string): SfxStyle {
  // Tiny stable hash so identical tokens look identical across reloads.
  let h = 0;
  for (const ch of token + String(index)) {
    h = (h * 31 + ch.charCodeAt(0)) | 0;
  }
  const rotation = ((h % 21) - 10); // \u00b110\u00b0
  const xPick = ((h >> 5) % 60) + 5; // 5..65%

  const isImpact = IMPACT_TOKENS.has(token);
  const isMotion = MOTION_TOKENS.has(token);
  const isSoft = SOFT_TOKENS.has(token);

  const text = isImpact
    ? `${token.toUpperCase()}!`
    : isSoft
      ? `${token.toUpperCase()}\u2026`
      : token.toUpperCase();

  return {
    text,
    rotation,
    fontSize: isImpact ? "clamp(2rem, 6vw, 3.5rem)" : "clamp(1.2rem, 3.5vw, 2rem)",
    color: isImpact ? accent : "#F0EEE8",
    stroke: isImpact ? "#0F0E17" : "#2E2C3F",
    weight: isImpact ? 900 : 700,
    position:
      index % 2 === 0
        ? { top: `${10 + ((h >> 8) % 30)}%`, left: `${xPick}%` }
        : { bottom: `${10 + ((h >> 8) % 30)}%`, right: `${xPick}%` },
    // ``isMotion`` is currently styled identically to non-impact tokens
    // but kept distinct so future iterations can add a slant or trail.
    ...(isMotion ? {} : {}),
  };
}

interface SfxLayerProps {
  /** Pass the panel's full ``effects`` list \u2014 we'll pick the SFX tokens. */
  effects: string[] | undefined;
  /** Used as the impact-token colour. Pass the panel's mood accent. */
  accent: string;
  /** Stagger delay so SFX pops after the panel itself fades in. */
  baseDelay?: number;
}

const SHARED_TEXT_STYLE: CSSProperties = {
  position: "absolute",
  fontFamily: "var(--font-display, 'Bangers', 'Impact', sans-serif)",
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  pointerEvents: "none",
  whiteSpace: "nowrap",
  // ``paint-order: stroke fill`` makes the stroke render BEHIND the fill
  // so the text stays readable against busy painted backdrops without
  // turning into a sticker outline.
  paintOrder: "stroke fill",
  WebkitTextStroke: "1px transparent", // overridden per-token below
};

export function SfxLayer({ effects, accent, baseDelay = 0 }: SfxLayerProps) {
  const tokens = extractSfxTokens(effects);
  if (tokens.length === 0) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      // SFX sits above the dark scrim and dialogue so it reads as part
      // of the art. zIndex matches the dialogue layer's expectations.
      style={{ zIndex: 4 }}
      aria-hidden
    >
      {tokens.map((token, i) => {
        const style = styleForToken(token, i, accent);
        return (
          <motion.span
            key={`${token}-${i}`}
            style={{
              ...SHARED_TEXT_STYLE,
              ...style.position,
              transform: `rotate(${style.rotation}deg)`,
              fontSize: style.fontSize,
              color: style.color,
              fontWeight: style.weight,
              WebkitTextStroke: `2px ${style.stroke}`,
              textShadow: `0 2px 6px ${style.stroke}`,
            }}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 0.35,
              delay: baseDelay + i * 0.08,
              ease: [0.34, 1.56, 0.64, 1], // overshoot for snap
            }}
          >
            {style.text}
          </motion.span>
        );
      })}
    </div>
  );
}
