"use client";

import type { CSSProperties } from "react";
import type { LayoutBoxPct, SpriteLayer, StoryboardPanel } from "@/lib/types";
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

function clampRange(value: number, min: number, max: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
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

function targetSpriteHeightForShot(panel: StoryboardPanel): number {
  switch (panel.shot_type) {
    case "extreme_wide":
      return 44;
    case "wide":
      return 58;
    case "medium":
      return 72;
    case "close_up":
      return 88;
    case "extreme_close_up":
      return 96;
    case "insert":
      return 54;
    case "symbolic":
      return 62;
  }
}

export function groundedSpriteBoxForPanel(
  panel: StoryboardPanel,
  box: LayoutBoxPct,
): LayoutBoxPct {
  const targetHeight = targetSpriteHeightForShot(panel);
  const originalHeight = clampRange(box.height_pct, 24, 96);
  const height = clampRange(Math.max(originalHeight, targetHeight), 28, 96);
  const scale = height / originalHeight;
  const width = clampRange(box.width_pct * scale, 18, 88);
  const centerX = box.x_pct + box.width_pct / 2;
  return {
    x_pct: clampRange(centerX - width / 2, 0, 100 - width),
    y_pct: 100 - height,
    width_pct: width,
    height_pct: height,
  };
}

function synthesizeSpriteLayers(panel: StoryboardPanel): SpriteLayer[] {
  const ids = uniqueCharacterIds(panel).slice(0, 5);
  if (!ids.length) return [];

  const count = ids.length;
  const width = count === 1 ? 54 : count === 2 ? 42 : count === 3 ? 32 : 26;
  const height = targetSpriteHeightForShot(panel);
  const usable = 88 - width;
  const step = count <= 1 ? 0 : usable / (count - 1);

  return ids.map((characterId, index) => ({
    character_id: characterId,
    expression: expressionFor(panel, characterId),
    bbox_pct: {
      x_pct: count === 1 ? 23 : 6 + step * index,
      y_pct: 100 - height,
      width_pct: width,
      height_pct: height,
    },
    z_index: 18 + index,
    opacity: 0.96,
    flip_x: index % 2 === 1,
  }));
}

function layerStyle(panel: StoryboardPanel, layer: SpriteLayer): CSSProperties {
  const box = groundedSpriteBoxForPanel(panel, layer.bbox_pct);
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

export function assetCropFrameStyle(asset: MangaCharacterAsset | null): CSSProperties {
  const isReferenceSheet = asset?.asset_type === "reference_sheet";
  return {
    width: "100%",
    height: "100%",
    marginLeft: "auto",
    marginRight: "auto",
  };
}

export function assetImageObjectStyle(asset: MangaCharacterAsset | null): CSSProperties {
  const isReferenceSheet = asset?.asset_type === "reference_sheet";
  return {
    objectFit: isReferenceSheet ? "cover" : "contain",
    objectPosition: isReferenceSheet ? "28% 72%" : "center bottom",
    filter: "drop-shadow(0 10px 0 rgba(0,0,0,0.28))",
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
        return (
          <div
            key={`${layer.character_id}-${layer.expression ?? "neutral"}-${index}`}
            style={layerStyle(panel, layer)}
          >
            {asset?.image_url ? (
              <div
                className="h-full overflow-hidden"
                style={assetCropFrameStyle(asset)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.image_url}
                  alt=""
                  className="h-full w-full"
                  loading="lazy"
                  draggable={false}
                  style={assetImageObjectStyle(asset)}
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
