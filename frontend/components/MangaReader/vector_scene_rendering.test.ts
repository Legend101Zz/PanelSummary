import type { StoryboardPanel, VectorScene } from "@/lib/types";
import { fallbackVectorSceneForPanel, vectorSceneHasVisibleInk } from "./chrome/VectorSceneLayer";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const scene: VectorScene = {
  background: { fill: "#fff8e7", gradient_to: "#eadfca" },
  tone: { pattern: "dots", opacity: 0.22, scale: 5 },
  linework: [{ kind: "horizon", x1: 5, y1: 60, x2: 95, y2: 58 }],
  sfx: [{ text: "SHH", x: 70, y: 24, size: 16, rotation: -8 }],
};

assertEqual(vectorSceneHasVisibleInk(scene), true, "authored scene visible ink");
assertEqual(vectorSceneHasVisibleInk({}), false, "empty scene visible ink");

const fallbackPanel: StoryboardPanel = {
  panel_id: "p1",
  scene_id: "s1",
  purpose: "reveal",
  shot_type: "wide",
  composition: "wide room",
  action: "Kai looks across the room.",
};

const fallback = fallbackVectorSceneForPanel(fallbackPanel);

assertEqual(Boolean(fallback.tone), true, "fallback tone");
assertEqual(Boolean(fallback.linework?.length), true, "fallback linework");
