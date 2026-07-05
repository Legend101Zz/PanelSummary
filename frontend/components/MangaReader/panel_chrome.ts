import type { CSSProperties } from "react";
import type { StoryboardPanel } from "@/lib/types";
import type { Emphasis } from "./types";

interface PanelChromeOptions {
  emphasis: Emphasis;
  isPageTurn?: boolean;
}

const PURPOSE_CHROME: Record<
  StoryboardPanel["purpose"],
  Pick<CSSProperties, "borderStyle" | "borderWidth" | "borderColor" | "boxShadow">
> = {
  setup: {
    borderStyle: "solid",
    borderWidth: 3,
    borderColor: "#1f1f29",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.35)",
  },
  explanation: {
    borderStyle: "solid",
    borderWidth: 3,
    borderColor: "#242330",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.32)",
  },
  emotional_turn: {
    borderStyle: "solid",
    borderWidth: 4,
    borderColor: "#1f1f29",
    boxShadow: "0 8px 0 rgba(31,31,41,0.22), inset 0 0 0 1px rgba(255,255,255,0.35)",
  },
  reveal: {
    borderStyle: "double",
    borderWidth: 5,
    borderColor: "#111118",
    boxShadow: "0 10px 0 rgba(31,31,41,0.25), inset 0 0 0 1px rgba(255,255,255,0.38)",
  },
  transition: {
    borderStyle: "dashed",
    borderWidth: 2,
    borderColor: "#33313f",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.25)",
  },
  recap: {
    borderStyle: "dotted",
    borderWidth: 3,
    borderColor: "#242330",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.32)",
  },
  to_be_continued: {
    borderStyle: "double",
    borderWidth: 6,
    borderColor: "#0f0e17",
    boxShadow: "0 0 0 3px #fffaf0, 0 0 0 8px #0f0e17, 0 16px 0 rgba(15,14,23,0.34)",
  },
};

export function panelChromeFor(
  panel: StoryboardPanel,
  { emphasis, isPageTurn = false }: PanelChromeOptions,
): CSSProperties {
  const base = PURPOSE_CHROME[panel.purpose] ?? PURPOSE_CHROME.setup;
  const emphasisLift =
    emphasis === "high"
      ? "0 12px 0 rgba(31,31,41,0.26)"
      : emphasis === "low"
        ? "inset 0 0 0 1px rgba(255,255,255,0.25)"
        : base.boxShadow;

  if (isPageTurn) {
    return {
      ...base,
      borderStyle: "double",
      borderWidth: Math.max(Number(base.borderWidth ?? 3), 7),
      borderColor: "#0f0e17",
      borderRadius: 1,
      boxShadow:
        "0 0 0 3px #fffaf0, 0 0 0 9px #0f0e17, 0 18px 0 rgba(15,14,23,0.38), inset 0 0 0 2px rgba(255,255,255,0.42)",
      filter: "contrast(1.08)",
      overflow: "visible",
    };
  }

  return {
    ...base,
    borderRadius: panel.purpose === "transition" ? 0 : 2,
    boxShadow: emphasisLift,
    overflow: "visible",
  };
}
