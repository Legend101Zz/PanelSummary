import type { BubblePlacement, SpriteLayer, StoryboardScriptLine } from "@/lib/types";
import { bubbleBoxStyle, resolveBubbleTail } from "./dialogue_geometry";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const line: StoryboardScriptLine = {
  speaker_id: "michael",
  text: "I used to be terrified of change too.",
};

const placement: BubblePlacement = {
  line_index: 0,
  speaker_id: "michael",
  bbox_pct: { x_pct: 40, y_pct: 8, width_pct: 42, height_pct: 28 },
  tail_side: "bottom",
  tail_offset_pct: 50,
};

const layers: SpriteLayer[] = [
  {
    character_id: "michael",
    expression: "neutral",
    bbox_pct: { x_pct: 8, y_pct: 44, width_pct: 28, height_pct: 52 },
  },
];

const tail = resolveBubbleTail({ placement, line, spriteLayers: layers });

assertEqual(tail.tailSide, "bottom", "tail side points down toward grounded speaker");
assertEqual(tail.tailOffsetPct, 15, "tail offset clamps toward speaker x");

const bleedPlacement: BubblePlacement = {
  ...placement,
  bbox_pct: { x_pct: -6, y_pct: -4, width_pct: 54, height_pct: 32 },
};
const style = bubbleBoxStyle(bleedPlacement);

assertEqual(style.left, "-6%", "bubble box can bleed past left border");
assertEqual(style.top, "-4%", "bubble box can bleed past top border");
