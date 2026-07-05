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
