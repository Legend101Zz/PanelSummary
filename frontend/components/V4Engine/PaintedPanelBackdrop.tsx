"use client";

/**
 * PaintedPanelBackdrop — the painted panel art layer (Phase 4)
 * ============================================================
 * When a V4Panel has an ``image_path`` (set by the multimodal panel
 * renderer in the backend), this component lays the actual painted art
 * down as the panel's backdrop. The mood-driven palette becomes a fallback
 * for panels the renderer didn't paint (e.g. transitions, montages).
 *
 * Two design rules:
 *
 * 1. **Overlay, don't replace.** Sub-renderers still paint dialogue boxes,
 *    narration captions, and effects ON TOP of the image, the way real
 *    manga puts speech bubbles on the art. We don't yank the existing
 *    SVG renderers; we just put a real image behind them.
 * 2. **Fail invisibly.** If the image 404s (e.g. a stale page from before
 *    the project enabled image gen), the synthetic background shows
 *    through and the panel still reads. No broken image icon.
 */
import { useState } from "react";

import { getImageUrl } from "@/lib/api";

interface PaintedPanelBackdropProps {
  imagePath: string;
}

export function PaintedPanelBackdrop({ imagePath }: PaintedPanelBackdropProps) {
  const [failed, setFailed] = useState(false);
  const src = getImageUrl(imagePath);
  if (!src || failed) {
    return null;
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      onError={() => setFailed(true)}
      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      // Render the painted art behind every other panel layer; the panel
      // wrapper supplies the ink border and screentone overlays.
      style={{ zIndex: 0 }}
    />
  );
}
