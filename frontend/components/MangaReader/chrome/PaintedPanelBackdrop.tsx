"use client";

/**
 * MangaReader/chrome/PaintedPanelBackdrop.tsx — painted panel art layer
 * =======================================================================
 *
 * Folded in by Phase 4.5c (was `V4Engine/PaintedPanelBackdrop.tsx`).
 * When a storyboard panel has a ``PanelRenderArtifact.image_path``
 * (set by the multimodal panel renderer in the backend), this
 * component lays the painted art down as the panel's backdrop. The
 * mood-driven palette becomes a fallback for panels the renderer
 * didn't paint (transitions, montages, error fallbacks).
 *
 * Two design rules are non-negotiable:
 *
 * 1. **Overlay, don't replace.** Sub-renderers paint dialogue boxes,
 *    narration captions, and SFX ON TOP of the image — that's how
 *    real manga works. We only put a real image *behind* them.
 * 2. **Fail invisibly.** If the image 404s (a stale page from before
 *    the project enabled image gen, say), the synthetic background
 *    shows through and the panel still reads. No broken-image icon.
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
