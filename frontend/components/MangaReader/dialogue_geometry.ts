import type { CSSProperties } from "react";
import type { BubblePlacement, SpriteLayer, StoryboardScriptLine } from "@/lib/types";

export type BubbleTailSide = "left" | "right" | "bottom" | "top";

export interface ResolvedBubbleTail {
  tailSide: BubbleTailSide;
  tailOffsetPct: number;
}

function clamp(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function normalizedTailSide(value: string | undefined): BubbleTailSide {
  if (value === "left" || value === "right" || value === "top" || value === "bottom") {
    return value;
  }
  return "bottom";
}

export function bubbleBoxStyle(placement: BubblePlacement): CSSProperties {
  const box = placement.bbox_pct;
  const width = clamp(box.width_pct, 44, 28, 96);
  const height = clamp(box.height_pct, 32, 22, 68);
  return {
    position: "absolute",
    left: `${clamp(box.x_pct, 3, -10, 110 - width)}%`,
    top: `${clamp(box.y_pct, 3, -10, 110 - height)}%`,
    width: `${width}%`,
    height: `${height}%`,
    zIndex: placement.z_index ?? 40,
  };
}

function speakerTarget(
  speakerId: string,
  spriteLayers: SpriteLayer[] | undefined,
): { x: number; y: number } | null {
  const layer = spriteLayers?.find((item) => item.character_id === speakerId);
  if (!layer) return null;
  const box = layer.bbox_pct;
  return {
    x: box.x_pct + box.width_pct / 2,
    y: box.y_pct + box.height_pct * 0.32,
  };
}

function rectsOverlap(
  a: { x_pct: number; y_pct: number; width_pct: number; height_pct: number },
  b: { x_pct: number; y_pct: number; width_pct: number; height_pct: number },
): boolean {
  return (
    a.x_pct < b.x_pct + b.width_pct &&
    a.x_pct + a.width_pct > b.x_pct &&
    a.y_pct < b.y_pct + b.height_pct &&
    a.y_pct + a.height_pct > b.y_pct
  );
}

function spriteFaceZone(layer: SpriteLayer) {
  const box = layer.bbox_pct;
  return {
    x_pct: box.x_pct,
    y_pct: box.y_pct,
    width_pct: box.width_pct,
    height_pct: box.height_pct / 3,
  };
}

export function bubbleOverlapsSpriteFace(
  placement: BubblePlacement,
  spriteLayers: SpriteLayer[] | undefined,
): boolean {
  return Boolean(spriteLayers?.some((layer) =>
    rectsOverlap(placement.bbox_pct, spriteFaceZone(layer)),
  ));
}

export function avoidSpriteFaceZones(
  placement: BubblePlacement,
  spriteLayers: SpriteLayer[] | undefined,
): BubblePlacement {
  if (!bubbleOverlapsSpriteFace(placement, spriteLayers)) return placement;
  const box = placement.bbox_pct;
  const width = clamp(box.width_pct, 44, 28, 96);
  const height = clamp(box.height_pct, 32, 22, 68);
  const candidates = [
    { ...box, y_pct: 4 },
    { ...box, y_pct: 100 - height - 4 },
    { ...box, x_pct: 4 },
    { ...box, x_pct: 100 - width - 4 },
    { ...box, x_pct: 50 - width / 2, y_pct: 6 },
  ].map((candidate) => ({
    x_pct: clamp(candidate.x_pct, box.x_pct, 0, 100 - width),
    y_pct: clamp(candidate.y_pct, box.y_pct, 0, 100 - height),
    width_pct: width,
    height_pct: height,
  }));

  const safe = candidates.find((candidate) =>
    !bubbleOverlapsSpriteFace({ ...placement, bbox_pct: candidate }, spriteLayers),
  );
  return safe ? { ...placement, bbox_pct: safe } : placement;
}

export function resolveBubbleTail({
  placement,
  line,
  spriteLayers,
}: {
  placement: BubblePlacement;
  line: StoryboardScriptLine;
  spriteLayers?: SpriteLayer[];
}): ResolvedBubbleTail {
  const target = speakerTarget(line.speaker_id || placement.speaker_id || "", spriteLayers);
  if (!target) {
    return {
      tailSide: normalizedTailSide(placement.tail_side),
      tailOffsetPct: clamp(placement.tail_offset_pct, 50, 15, 85),
    };
  }

  const box = placement.bbox_pct;
  const left = box.x_pct;
  const right = box.x_pct + box.width_pct;
  const top = box.y_pct;
  const bottom = box.y_pct + box.height_pct;

  let tailSide: BubbleTailSide;
  if (target.y > bottom) {
    tailSide = "bottom";
  } else if (target.y < top) {
    tailSide = "top";
  } else if (target.x < left) {
    tailSide = "left";
  } else if (target.x > right) {
    tailSide = "right";
  } else {
    tailSide = normalizedTailSide(placement.tail_side);
  }

  const rawOffset =
    tailSide === "left" || tailSide === "right"
      ? ((target.y - top) / Math.max(box.height_pct, 1)) * 100
      : ((target.x - left) / Math.max(box.width_pct, 1)) * 100;

  return {
    tailSide,
    tailOffsetPct: clamp(rawOffset, placement.tail_offset_pct ?? 50, 15, 85),
  };
}
