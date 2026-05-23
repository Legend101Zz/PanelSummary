"use client";

/**
 * MangaReader/panels/DialoguePanel.tsx — placed speech lettering
 * =================================================================
 * Dialogue bubbles are panel lettering, not chat rows. Character art now
 * lives in `SceneSprites`; this component only places readable bubbles and
 * speaker tags over the panel scene.
 */

import type { CSSProperties } from "react";
import { motion } from "motion/react";
import type {
  BubblePlacement,
  StoryboardPanel,
  StoryboardScriptLine,
} from "@/lib/types";
import { SpeechBubble, type SpeechBubbleVariant } from "../chrome/SpeechBubble";
import type { MangaPalette } from "../types";

interface DialoguePanelProps {
  panel: StoryboardPanel;
  palette: MangaPalette;
  hasPaintedBackdrop?: boolean;
  bubblePlacements?: BubblePlacement[];
}

function variantForIntent(intent: string | undefined): SpeechBubbleVariant {
  if (!intent) return "speech";
  const i = intent.toLowerCase();
  if (i === "shocked" || i === "angry") return "shout";
  if (i === "thinking" || i === "thought" || i === "melancholy") return "thought";
  return "speech";
}

const INTENT_STYLES: Record<string, { borderColor: string; fontStyle: string }> = {
  angry: { borderColor: "#ea1100", fontStyle: "normal" },
  frustrated: { borderColor: "#995213", fontStyle: "normal" },
  shocked: { borderColor: "#0053e2", fontStyle: "italic" },
  fearful: { borderColor: "#4b5563", fontStyle: "italic" },
  determined: { borderColor: "#0053e2", fontStyle: "normal" },
  triumphant: { borderColor: "#2a8703", fontStyle: "normal" },
  neutral: { borderColor: "#1f1f29", fontStyle: "normal" },
  smirk: { borderColor: "#995213", fontStyle: "italic" },
};

function clamp(value: number, min: number, max: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function placementForLine(
  line: StoryboardScriptLine,
  index: number,
  total: number,
  explicit: BubblePlacement | undefined,
): BubblePlacement {
  if (explicit) return explicit;
  const layouts: BubblePlacement[] = [
    {
      line_index: index,
      speaker_id: line.speaker_id,
      bbox_pct: { x_pct: 50, y_pct: 6, width_pct: 44, height_pct: 27 },
      tail_side: "bottom",
      tail_offset_pct: 72,
      variant: variantForIntent(line.intent),
      z_index: 42,
    },
    {
      line_index: index,
      speaker_id: line.speaker_id,
      bbox_pct: { x_pct: 6, y_pct: total > 2 ? 35 : 48, width_pct: 45, height_pct: 28 },
      tail_side: "bottom",
      tail_offset_pct: 30,
      variant: variantForIntent(line.intent),
      z_index: 43,
    },
    {
      line_index: index,
      speaker_id: line.speaker_id,
      bbox_pct: { x_pct: 46, y_pct: 63, width_pct: 48, height_pct: 29 },
      tail_side: "top",
      tail_offset_pct: 62,
      variant: variantForIntent(line.intent),
      z_index: 44,
    },
  ];
  return layouts[index % layouts.length];
}

function bubbleBoxStyle(placement: BubblePlacement): CSSProperties {
  const box = placement.bbox_pct;
  return {
    position: "absolute",
    left: `${clamp(box.x_pct, 0, 100)}%`,
    top: `${clamp(box.y_pct, 0, 100)}%`,
    width: `${clamp(box.width_pct, 18, 100)}%`,
    height: `${clamp(box.height_pct, 18, 100)}%`,
    zIndex: placement.z_index ?? 40,
  };
}

function normalizedTailSide(value: string | undefined): "left" | "right" | "bottom" | "top" {
  if (value === "left" || value === "right" || value === "top" || value === "bottom") {
    return value;
  }
  return "bottom";
}

function normalizedVariant(
  placement: BubblePlacement,
  line: StoryboardScriptLine,
): SpeechBubbleVariant {
  const variant = placement.variant;
  if (variant === "speech" || variant === "thought" || variant === "shout") {
    return variant;
  }
  return variantForIntent(line.intent);
}

function BubbleLettering({
  line,
  index,
  placement,
  palette,
  hasPaintedBackdrop,
}: {
  line: StoryboardScriptLine;
  index: number;
  placement: BubblePlacement;
  palette: MangaPalette;
  hasPaintedBackdrop: boolean;
}) {
  const intentStyle = INTENT_STYLES[line.intent || "neutral"] || INTENT_STYLES.neutral;
  const variant = normalizedVariant(placement, line);
  const fill = hasPaintedBackdrop ? "rgba(255,250,240,0.94)" : "rgba(255,255,255,0.95)";

  return (
    <motion.div
      style={bubbleBoxStyle(placement)}
      initial={{ opacity: 0, y: 8, rotate: index % 2 === 0 ? -1.5 : 1.5 }}
      animate={{ opacity: 1, y: 0, rotate: index % 2 === 0 ? -1.5 : 1.5 }}
      transition={{ duration: 0.35, delay: index * 0.18 }}
    >
      <SpeechBubble
        tailSide={normalizedTailSide(placement.tail_side)}
        tailOffset={clamp(placement.tail_offset_pct ?? 50, 15, 85) / 100}
        variant={variant}
        strokeColor={intentStyle.borderColor}
        fillColor={fill}
        strokeWidth={variant === "shout" ? 3 : 2.2}
        ariaLabel={`${line.speaker_id} says ${line.text}`}
        style={{ width: "100%", height: "100%" }}
      >
        <div className="flex h-full w-full flex-col items-center justify-center gap-1">
          <span
            className="max-w-full truncate rounded-full border bg-white px-2 py-0.5 uppercase tracking-[0.14em]"
            style={{
              borderColor: `${intentStyle.borderColor}66`,
              color: intentStyle.borderColor,
              fontFamily: "var(--font-label, monospace)",
              fontSize: "clamp(0.48rem, 0.9vw, 0.62rem)",
              fontWeight: 800,
            }}
          >
            {line.speaker_id}
          </span>
          <p
            style={{
              color: "#1f1f29",
              fontFamily: "var(--font-body, sans-serif)",
              fontSize: "clamp(0.62rem, 1.15vw, 0.86rem)",
              fontStyle: intentStyle.fontStyle,
              fontWeight: variant === "shout" ? 800 : 600,
              lineHeight: 1.22,
              margin: 0,
              textAlign: "center",
              textWrap: "balance",
            }}
          >
            {line.text}
          </p>
        </div>
      </SpeechBubble>
      <div
        className="pointer-events-none absolute inset-0 rounded-[24px]"
        style={{ boxShadow: `0 7px 0 ${palette.border}55` }}
        aria-hidden
      />
    </motion.div>
  );
}

export function DialoguePanel({
  panel,
  palette,
  hasPaintedBackdrop = false,
  bubblePlacements = [],
}: DialoguePanelProps) {
  const lines = panel.dialogue ?? [];
  const explicitByLine = new Map(bubblePlacements.map((placement) => [placement.line_index, placement]));

  return (
    <div className="relative h-full w-full overflow-hidden">
      {panel.scene_id && (
        <div
          className="absolute left-2 top-2 rounded-sm border bg-white/80 px-1.5 py-0.5 uppercase tracking-[0.18em]"
          style={{
            borderColor: "#1f1f29",
            color: "#1f1f29",
            fontFamily: "var(--font-label, monospace)",
            fontSize: "0.5rem",
            fontWeight: 800,
            zIndex: 45,
          }}
        >
          {panel.scene_id.replace(/[-_]/g, " ")}
        </div>
      )}

      {lines.map((line, index) => (
        <BubbleLettering
          key={`${line.speaker_id}-${index}`}
          line={line}
          index={index}
          placement={placementForLine(line, index, lines.length, explicitByLine.get(index))}
          palette={palette}
          hasPaintedBackdrop={hasPaintedBackdrop}
        />
      ))}

      {panel.narration && (
        <motion.p
          className="absolute inset-x-4 bottom-3 border bg-white/90 px-3 py-2 text-center"
          style={{
            borderColor: "#1f1f29",
            color: "#1f1f29",
            fontFamily: "var(--font-body, sans-serif)",
            fontSize: "clamp(0.62rem, 1vw, 0.78rem)",
            fontStyle: "italic",
            zIndex: 46,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: lines.length * 0.18 + 0.2 }}
        >
          {panel.narration}
        </motion.p>
      )}
    </div>
  );
}
