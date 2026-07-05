import type { LayoutBoxPct, StoryboardPanel } from "@/lib/types";
import type { MangaCharacterAsset } from "./asset_lookup";
import {
  assetCropFrameStyle,
  assetImageObjectStyle,
  groundedSpriteBoxForPanel,
} from "./chrome/SceneSprites";
import { planPanelPresentation } from "./panel_presentation";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const widePanel: StoryboardPanel = {
  panel_id: "p-wide",
  scene_id: "s1",
  purpose: "setup",
  shot_type: "wide",
  composition: "wide room",
};

const closePanel: StoryboardPanel = {
  ...widePanel,
  panel_id: "p-close",
  shot_type: "close_up",
};

const box: LayoutBoxPct = {
  x_pct: 20,
  y_pct: 20,
  width_pct: 30,
  height_pct: 40,
};

const wideBox = groundedSpriteBoxForPanel(widePanel, box);
const closeBox = groundedSpriteBoxForPanel(closePanel, box);

assertEqual(Math.round(wideBox.y_pct + wideBox.height_pct), 100, "wide sprite grounded");
assertEqual(Math.round(closeBox.y_pct + closeBox.height_pct), 100, "close sprite grounded");

if (closeBox.height_pct <= wideBox.height_pct) {
  throw new Error("close-up sprite should scale taller than wide sprite");
}

const referenceAsset: MangaCharacterAsset = {
  character_id: "kai",
  expression: "front",
  asset_type: "reference_sheet",
  image_url: "/kai.png",
};

assertEqual(assetCropFrameStyle(referenceAsset).width, "100%", "reference sheet crop width");
assertEqual(assetImageObjectStyle(referenceAsset).objectFit, "cover", "reference sheet object fit");
assertEqual(
  assetImageObjectStyle(referenceAsset).objectPosition,
  "28% 72%",
  "reference sheet object position",
);

const referenceOnlyPanel: StoryboardPanel = {
  ...widePanel,
  panel_id: "p-reference-only",
  dialogue: [{ speaker_id: "kai", text: "We move." }],
  character_ids: ["kai"],
};

const referenceOnlyPlan = planPanelPresentation(referenceOnlyPanel, {
  hasPaintedBackdrop: false,
  characterAssets: [referenceAsset],
});

assertEqual(
  referenceOnlyPlan.shouldRenderSyntheticSprites,
  true,
  "reference sheet should count as renderable for derived crop sprites",
);
