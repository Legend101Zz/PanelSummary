"use client";

import type { CSSProperties } from "react";
import type { SpriteLayer, StoryboardPanel } from "@/lib/types";
import {
  findAssetForCharacter,
  type MangaCharacterAsset,
} from "../asset_lookup";
import type { PanelPresentationPlan } from "../panel_presentation";

interface SceneSpritesProps {
  panel: StoryboardPanel;
  explicitLayers?: SpriteLayer[];
  assets: MangaCharacterAsset[];
  hasPaintedBackdrop: boolean;
  presentation: PanelPresentationPlan;
}

const EMPTY_PRESENTATION: PanelPresentationPlan = {
  variant: "scene-only",
  captionZone: "none",
  shouldRenderSyntheticSprites: false,
  shouldRenderExplicitSprites: false,
  missingSpriteFallback: "omit",
  preferCaptionLettering: false,
  maxVisibleCaptionChars: 0,
  maxBubbleChars: 0,
  isVisualDirectionOnly: false,
};

function clampPct(value: number, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(100, value));
}

function uniqueCharacterIds(panel: StoryboardPanel): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of panel.character_ids ?? []) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    ids.push(trimmed);
    seen.add(trimmed);
  }
  return ids;
}

function expressionFor(panel: StoryboardPanel, characterId: string): string {
  const line = panel.dialogue?.find((entry) => entry.speaker_id === characterId);
  return line?.intent || "neutral";
}

function synthesizeSpriteLayers(panel: StoryboardPanel): SpriteLayer[] {
  const ids = uniqueCharacterIds(panel).slice(0, 5);
  if (!ids.length) return [];

  const count = ids.length;
  const width = count === 1 ? 54 : count === 2 ? 42 : count === 3 ? 32 : 26;
  const height = panel.shot_type.includes("close_up") ? 74 : 68;
  const usable = 88 - width;
  const step = count <= 1 ? 0 : usable / (count - 1);

  return ids.map((characterId, index) => ({
    character_id: characterId,
    expression: expressionFor(panel, characterId),
    bbox_pct: {
      x_pct: count === 1 ? 23 : 6 + step * index,
      y_pct: panel.shot_type === "extreme_wide" ? 34 : 26 + (index % 2) * 5,
      width_pct: width,
      height_pct: height,
    },
    z_index: 18 + index,
    opacity: 0.96,
    flip_x: index % 2 === 1,
  }));
}

function layerStyle(layer: SpriteLayer): CSSProperties {
  const box = layer.bbox_pct;
  return {
    position: "absolute",
    left: `${clampPct(box.x_pct, 0)}%`,
    top: `${clampPct(box.y_pct, 0)}%`,
    width: `${clampPct(box.width_pct, 24)}%`,
    height: `${clampPct(box.height_pct, 60)}%`,
    zIndex: layer.z_index ?? 20,
    opacity: layer.opacity ?? 1,
    transform: layer.flip_x ? "scaleX(-1)" : undefined,
    transformOrigin: "center bottom",
    pointerEvents: "none",
  };
}

function MissingSpriteMarker({ characterId }: { characterId: string }) {
  return (
    <div
      className="flex h-full w-full items-end justify-center pb-1"
      aria-hidden
    >
      <div
        className="max-w-full truncate rounded-sm border bg-white/85 px-1.5 py-0.5 uppercase"
        style={{
          borderColor: "rgba(31,31,41,0.4)",
          color: "#1f1f29",
          boxShadow: "0 3px 0 rgba(31,31,41,0.16)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-label, monospace)",
            fontSize: "0.5rem",
            fontWeight: 800,
          }}
        >
          {characterId}
        </span>
      </div>
    </div>
  );
}

export function SceneSprites({
  panel,
  explicitLayers,
  assets,
  hasPaintedBackdrop,
  presentation = EMPTY_PRESENTATION,
}: SceneSpritesProps) {
  const useExplicit = Boolean(explicitLayers?.length && presentation.shouldRenderExplicitSprites);
  const layers = useExplicit
    ? explicitLayers ?? []
    : hasPaintedBackdrop || !presentation.shouldRenderSyntheticSprites
      ? []
      : synthesizeSpriteLayers(panel);

  if (!layers.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {layers.map((layer, index) => {
        const asset = findAssetForCharacter(layer.character_id, layer.expression, assets);
        if (!asset?.image_url && presentation.missingSpriteFallback === "omit") {
          return null;
        }
        if (asset?.asset_type === "reference_sheet") {
          return null;
        }
        const isReferenceSheet = asset?.asset_type === "reference_sheet";
        return (
          <div
            key={`${layer.character_id}-${layer.expression ?? "neutral"}-${index}`}
            style={layerStyle(layer)}
          >
            {asset?.image_url ? (
              <div
                className="h-full overflow-hidden"
                style={{
                  width: isReferenceSheet ? "36%" : "100%",
                  marginLeft: "auto",
                  marginRight: "auto",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.image_url}
                  alt=""
                  className="h-full w-full"
                  loading="lazy"
                  draggable={false}
                  style={{
                    objectFit: isReferenceSheet ? "cover" : "contain",
                    objectPosition: isReferenceSheet ? "62% bottom" : "center bottom",
                    filter: "drop-shadow(0 10px 0 rgba(0,0,0,0.28))",
                  }}
                />
              </div>
            ) : (
              <MissingSpriteMarker characterId={layer.character_id} />
            )}
          </div>
        );
      })}
    </div>
  );
}
