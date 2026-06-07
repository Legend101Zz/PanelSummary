import type { StoryboardPanel } from "@/lib/types";
import { planPanelPresentation } from "./panel_presentation";

const basePanel: StoryboardPanel = {
  panel_id: "p-test",
  scene_id: "scene",
  purpose: "setup",
  shot_type: "wide",
  composition: "wide classroom panel",
};

const manyMissingCharacters: StoryboardPanel = {
  ...basePanel,
  action: "The group chats, then falls into a contemplative silence.",
  character_ids: ["anna", "nathan", "caje", "jess", "michael"],
};

const denseDialogue: StoryboardPanel = {
  ...basePanel,
  dialogue: [
    {
      speaker_id: "nathan",
      text: "We are all trying to cope with unexpected changes, and honestly none of us know how to say that out loud.",
    },
  ],
  character_ids: ["nathan"],
};

const shortDialogue: StoryboardPanel = {
  ...basePanel,
  dialogue: [{ speaker_id: "nathan", text: "It has." }],
  character_ids: ["nathan"],
};

const missingGroupPlan = planPanelPresentation(manyMissingCharacters, {
  hasPaintedBackdrop: false,
  characterAssets: [],
});

const denseDialoguePlan = planPanelPresentation(denseDialogue, {
  hasPaintedBackdrop: false,
  characterAssets: [],
});

const shortDialoguePlan = planPanelPresentation(shortDialogue, {
  hasPaintedBackdrop: false,
  characterAssets: [
    {
      character_id: "nathan",
      expression: "neutral",
      image_url: "/nathan.png",
    },
  ],
});

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

assertEqual(missingGroupPlan.variant, "caption-strip", "missing group variant");
assertEqual(
  missingGroupPlan.shouldRenderSyntheticSprites,
  false,
  "missing group synthesized sprites",
);
assertEqual(missingGroupPlan.missingSpriteFallback, "omit", "missing sprite fallback");

assertEqual(denseDialoguePlan.variant, "text-card", "dense dialogue variant");
assertEqual(denseDialoguePlan.preferCaptionLettering, true, "dense dialogue caption");

assertEqual(shortDialoguePlan.variant, "dialogue-over-scene", "short dialogue variant");
assertEqual(
  shortDialoguePlan.shouldRenderSyntheticSprites,
  true,
  "short dialogue synthesized sprites",
);
