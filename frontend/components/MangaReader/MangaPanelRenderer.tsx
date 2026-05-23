"use client";

/**
 * MangaReader/MangaPanelRenderer.tsx — per-panel dispatcher
 * ===========================================================
 * Renders one ``StoryboardPanel`` with the painted-art backdrop layer,
 * SFX overlay, and the right sub-renderer for the panel's editorial
 * intent. Direct successor to ``V4PanelRenderer`` — same visual
 * treatment, new shape input.
 *
 * Pure derivations (palette, kind, emphasis, effects) live in
 * ``derived_visuals.ts`` so this file stays focused on JSX +
 * accessibility. The dispatch table is intentionally exhaustive on
 * ``PanelKind`` so a future kind addition surfaces as a tsc error
 * here, never a silent fall-through.
 */

import { useMemo } from "react";
import { motion } from "motion/react";
import type {
  BubblePlacement,
  PanelRenderArtifact,
  SpriteLayer,
  StoryboardPanel,
} from "@/lib/types";
import {
  derivePanelKind,
  derivePaletteKey,
  deriveEmphasis,
  deriveEffects,
} from "./derived_visuals";
import {
  EMPHASIS_WEIGHTS,
  MANGA_PALETTES,
  type PanelKind,
} from "./types";
import type { MangaCharacterAsset } from "./asset_lookup";
import { PaintedPanelBackdrop } from "./chrome/PaintedPanelBackdrop";
import { SfxLayer } from "./chrome/SfxLayer";
import { SceneSprites } from "./chrome/SceneSprites";
import { DialoguePanel } from "./panels/DialoguePanel";
import { NarrationPanel } from "./panels/NarrationPanel";
import { ConceptPanel } from "./panels/ConceptPanel";
import { TransitionPanel } from "./panels/TransitionPanel";

interface MangaPanelRendererProps {
  panel: StoryboardPanel;
  artifact: PanelRenderArtifact;
  /** Composition's emphasis override for this panel id (if any). */
  emphasisOverride?: string;
  /** Stagger delay for the entry animation. */
  staggerDelay?: number;
  /** Character reference assets keyed by id+expression. */
  characterAssets?: MangaCharacterAsset[];
  /** Optional explicit panel-local scene sprite layers from the render contract. */
  spriteLayers?: SpriteLayer[];
  /** Optional explicit panel-local speech bubble placements from the render contract. */
  bubblePlacements?: BubblePlacement[];
}

/**
 * Render one storyboard panel. The artifact carries painted art (when
 * present); when absent, the synthetic mood-driven backdrop shows
 * through.
 */
export function MangaPanelRenderer({
  panel,
  artifact,
  emphasisOverride,
  staggerDelay = 0,
  characterAssets = [],
  spriteLayers,
  bubblePlacements,
}: MangaPanelRendererProps) {
  const palette = useMemo(
    () => MANGA_PALETTES[derivePaletteKey(panel)],
    [panel],
  );
  const emphasis = deriveEmphasis(panel, emphasisOverride);
  const weight = EMPHASIS_WEIGHTS[emphasis];
  const kind: PanelKind = derivePanelKind(panel);
  const effects = useMemo(() => deriveEffects(panel), [panel]);

  // Painted backdrop short-circuit: when the renderer wrote an
  // ``image_path`` (and the panel did NOT error), we layer the painted
  // art behind everything and tell the dialogue sub-renderer to skip
  // its avatar disc.
  const hasPaintedBackdrop = Boolean(artifact.image_path && !artifact.error);

  const content = useMemo(() => {
    switch (kind) {
      case "dialogue":
        return (
          <DialoguePanel
            panel={panel}
            palette={palette}
            hasPaintedBackdrop={hasPaintedBackdrop}
            bubblePlacements={bubblePlacements}
          />
        );
      case "transition":
        return <TransitionPanel panel={panel} palette={palette} />;
      case "concept":
        return <ConceptPanel panel={panel} palette={palette} />;
      case "narration":
        return <NarrationPanel panel={panel} palette={palette} effects={effects} />;
    }
  }, [kind, panel, palette, hasPaintedBackdrop, effects, bubblePlacements]);

  return (
    <motion.div
      className="relative h-full w-full overflow-hidden"
      style={{
        background: hasPaintedBackdrop
          ? palette.bg
          : "linear-gradient(135deg, #fffaf0 0%, #f8f3e7 58%, #ede1c6 100%)",
        border: "3px solid #1f1f29",
        borderRadius: 2,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.35)",
        flex: weight,
        minHeight: emphasis === "high" ? 200 : emphasis === "low" ? 80 : 120,
      }}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.4,
        delay: staggerDelay,
        ease: [0.4, 0, 0.2, 1],
      }}
      role="img"
      aria-label={buildAriaLabel(panel)}
    >
      {hasPaintedBackdrop && artifact.image_path && (
        <PaintedPanelBackdrop imagePath={artifact.image_path} />
      )}

      {hasPaintedBackdrop && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
          style={{
            background: `linear-gradient(to top, ${palette.bg}cc 0%, ${palette.bg}66 50%, transparent 100%)`,
            zIndex: 1,
          }}
          aria-hidden
        />
      )}

      {effects.includes("screentone") && (
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.08]"
          style={{
            backgroundImage: "radial-gradient(circle, #1f1f29 0.55px, transparent 0.55px)",
            backgroundSize: "5px 5px",
            zIndex: 2,
          }}
        />
      )}

      {!hasPaintedBackdrop && (
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.12]"
          style={{
            backgroundImage:
              "linear-gradient(115deg, transparent 0 44%, #0053e2 44% 45%, transparent 45% 100%)",
            backgroundSize: "28px 100%",
            zIndex: 2,
          }}
        />
      )}

      <SceneSprites
        panel={panel}
        explicitLayers={spriteLayers}
        assets={characterAssets}
        hasPaintedBackdrop={hasPaintedBackdrop}
      />

      <div className="absolute inset-0" style={{ zIndex: 35 }}>
        {content}
      </div>

      <SfxLayer effects={effects} accent={palette.accent} baseDelay={staggerDelay + 0.2} />
    </motion.div>
  );
}

/**
 * Compose an accessible label from the panel's textual content. Same
 * structure as the V4 version so screen readers experience identical
 * navigation through the new reader.
 */
function buildAriaLabel(panel: StoryboardPanel): string {
  const parts: string[] = [`${panel.purpose} panel`];
  if (panel.action) parts.push(panel.action);
  if (panel.narration) parts.push(panel.narration);
  if (panel.dialogue?.length) {
    parts.push(
      panel.dialogue.map((l) => `${l.speaker_id} says: ${l.text}`).join(". "),
    );
  }
  return parts.join(". ");
}
