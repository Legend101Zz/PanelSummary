import type { StoryboardPanel } from "@/lib/types";
import { panelChromeFor } from "./panel_chrome";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertIncludes(actual: string | undefined, expected: string, label: string): void {
  if (!actual?.includes(expected)) {
    throw new Error(`${label}: expected ${String(actual)} to include ${expected}`);
  }
}

const basePanel: StoryboardPanel = {
  panel_id: "p1",
  scene_id: "s1",
  purpose: "setup",
  shot_type: "wide",
  composition: "wide room",
};

const normal = panelChromeFor(basePanel, { emphasis: "medium", isPageTurn: false });
const pageTurn = panelChromeFor(basePanel, { emphasis: "medium", isPageTurn: true });
const reveal = panelChromeFor({ ...basePanel, purpose: "reveal" }, { emphasis: "high", isPageTurn: false });
const transition = panelChromeFor({ ...basePanel, purpose: "transition" }, { emphasis: "low", isPageTurn: false });

if (Number(pageTurn.borderWidth) <= Number(normal.borderWidth)) {
  throw new Error("page turn border should be heavier than normal panels");
}

assertEqual(pageTurn.overflow, "visible", "page turn overflow");
assertIncludes(String(pageTurn.boxShadow), "0 0 0", "page turn ring");
assertEqual(reveal.borderStyle, "double", "reveal border style");
assertEqual(transition.borderStyle, "dashed", "transition border style");
