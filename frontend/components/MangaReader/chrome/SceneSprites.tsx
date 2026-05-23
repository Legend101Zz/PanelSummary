"use client";

import type { CSSProperties } from "react";
import type { SpriteLayer, StoryboardPanel } from "@/lib/types";
import {
  findAssetForCharacter,
  type MangaCharacterAsset,
} from "../asset_lookup";

interface SceneSpritesProps {
  panel: StoryboardPanel;
  explicitLayers?: SpriteLayer[];
  assets: MangaCharacterAsset[];
  hasPaintedBackdrop: boolean;
}

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

function SpriteFallback({ characterId }: { characterId: string }) {
  return (
    <div
      className="flex h-full w-full items-end justify-center"
      aria-hidden
    >
      <div
        className="flex aspect-[2/3] h-[88%] items-center justify-center rounded-t-full border-2 bg-white/85 shadow-[0_8px_0_rgba(0,0,0,0.25)]"
        style={{ borderColor: "#1f1f29", color: "#1f1f29" }}
      >
        <span
          style={{
            fontFamily: "var(--font-label, monospace)",
            fontSize: "0.65rem",
            fontWeight: 800,
          }}
        >
          {characterId.slice(0, 2).toUpperCase()}
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
}: SceneSpritesProps) {
  const layers = explicitLayers?.length
    ? explicitLayers
    : hasPaintedBackdrop
      ? []
      : synthesizeSpriteLayers(panel);

  if (!layers.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {layers.map((layer, index) => {
        const asset = findAssetForCharacter(layer.character_id, layer.expression, assets);
        return (
          <div
            key={`${layer.character_id}-${layer.expression ?? "neutral"}-${index}`}
            style={layerStyle(layer)}
          >
            {asset?.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={asset.image_url}
                alt=""
                className="h-full w-full object-contain object-bottom"
                loading="lazy"
                draggable={false}
                style={{
                  filter: "drop-shadow(0 10px 0 rgba(0,0,0,0.28))",
                }}
              />
            ) : (
              <SpriteFallback characterId={layer.character_id} />
            )}
          </div>
        );
      })}
    </div>
  );
}
