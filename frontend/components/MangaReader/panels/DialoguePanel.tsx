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
import {
  clampVisibleText,
  type PanelPresentationPlan,
} from "../panel_presentation";
import type { MangaPalette } from "../types";

interface DialoguePanelProps {
  panel: StoryboardPanel;
  palette: MangaPalette;
  hasPaintedBackdrop?: boolean;
  bubblePlacements?: BubblePlacement[];
  presentation: PanelPresentationPlan;
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
      bbox_pct: { x_pct: 34, y_pct: 5, width_pct: 63, height_pct: 38 },
      tail_side: "bottom",
      tail_offset_pct: 72,
      variant: variantForIntent(line.intent),
      z_index: 42,
    },
    {
      line_index: index,
      speaker_id: line.speaker_id,
      bbox_pct: { x_pct: 4, y_pct: total > 2 ? 38 : 50, width_pct: 60, height_pct: 38 },
      tail_side: "bottom",
      tail_offset_pct: 30,
      variant: variantForIntent(line.intent),
      z_index: 43,
    },
    {
      line_index: index,
      speaker_id: line.speaker_id,
      bbox_pct: { x_pct: 34, y_pct: 58, width_pct: 63, height_pct: 38 },
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
  const width = clamp(box.width_pct, 34, 92);
  const height = clamp(box.height_pct, 28, 62);
  return {
    position: "absolute",
    left: `${clamp(box.x_pct, 3, 97 - width)}%`,
    top: `${clamp(box.y_pct, 3, 97 - height)}%`,
    width: `${width}%`,
    height: `${height}%`,
    zIndex: placement.z_index ?? 40,
  };
}

function shouldUseCaption(
  line: StoryboardScriptLine,
  index: number,
  total: number,
  presentation: PanelPresentationPlan,
): boolean {
  if (presentation.preferCaptionLettering) return true;
  const length = line.text.trim().length;
  return length > presentation.maxBubbleChars || (total > 2 && index > 1 && length > 34);
}

function letteringFontSize(text: string): string {
  if (text.length > 40) return "clamp(0.5rem, 0.72vw, 0.66rem)";
  if (text.length > 28) return "clamp(0.55rem, 0.82vw, 0.72rem)";
  return "clamp(0.62rem, 1vw, 0.84rem)";
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
  const showSpeakerTag = false;
  const visibleText = clampVisibleText(line.text, 54);

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
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-0.5 overflow-hidden"
          style={{ minHeight: 0 }}
        >
          {showSpeakerTag && (
            <span
              className="max-w-full truncate rounded-full border bg-white px-1.5 py-0.5 uppercase tracking-[0.12em]"
              style={{
                borderColor: `${intentStyle.borderColor}66`,
                color: intentStyle.borderColor,
                fontFamily: "var(--font-label, monospace)",
                fontSize: "clamp(0.42rem, 0.62vw, 0.56rem)",
                fontWeight: 800,
              }}
            >
              {line.speaker_id}
            </span>
          )}
          <p
            style={{
              color: "#1f1f29",
              fontFamily: "var(--font-body, sans-serif)",
              fontSize: letteringFontSize(visibleText),
              fontStyle: intentStyle.fontStyle,
              fontWeight: variant === "shout" ? 800 : 600,
              hyphens: "auto",
              display: "block",
              flexShrink: 0,
              lineHeight: 1.12,
              margin: 0,
              maxWidth: "100%",
              overflow: "hidden",
              overflowWrap: "anywhere",
              textAlign: "center",
              textWrap: "pretty",
            }}
          >
            {visibleText}
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

function CaptionBox({
  lines,
  panelNarration,
  presentation,
}: {
  lines: StoryboardScriptLine[];
  panelNarration?: string;
  presentation: PanelPresentationPlan;
}) {
  const rawCaptionText = [
    ...lines.map((line) => `${line.speaker_id}: ${line.text}`),
    panelNarration,
  ].filter(Boolean).join(" ");
  const captionText = clampVisibleText(rawCaptionText, presentation.maxVisibleCaptionChars);

  if (!captionText) return null;
  const isTextCard = presentation.variant === "text-card";
  const zoneClass =
    presentation.captionZone === "top"
      ? "absolute inset-x-3 top-3"
      : presentation.captionZone === "center" || isTextCard
        ? "absolute left-3 right-3 top-1/2 -translate-y-1/2"
        : "absolute inset-x-3 bottom-3";

  return (
    <motion.div
      className={`${zoneClass} border bg-white px-3 py-2`}
      style={{
        borderColor: "#1f1f29",
        boxShadow: "0 6px 0 rgba(31,31,41,0.22)",
        color: "#1f1f29",
        fontFamily: "var(--font-body, sans-serif)",
        fontSize: isTextCard
          ? "clamp(0.58rem, 0.9vw, 0.76rem)"
          : "clamp(0.52rem, 0.78vw, 0.68rem)",
        fontStyle: panelNarration ? "italic" : "normal",
        fontWeight: 650,
        lineHeight: isTextCard ? 1.26 : 1.18,
        overflowWrap: "anywhere",
        textAlign: "center",
        zIndex: 46,
      }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.max(lines.length, 1) * 0.16 + 0.15 }}
    >
      {captionText}
    </motion.div>
  );
}

export function DialoguePanel({
  panel,
  palette,
  hasPaintedBackdrop = false,
  bubblePlacements = [],
  presentation,
}: DialoguePanelProps) {
  const lines = panel.dialogue ?? [];
  const explicitByLine = new Map(bubblePlacements.map((placement) => [placement.line_index, placement]));
  const bubbleLines = lines.filter((line, index) =>
    !shouldUseCaption(line, index, lines.length, presentation),
  );
  const captionLines = lines.filter((line, index) =>
    shouldUseCaption(line, index, lines.length, presentation),
  );

  return (
    <div className="relative h-full w-full overflow-hidden">
      {panel.scene_id && presentation.variant !== "text-card" && (
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

      {bubbleLines.map((line, index) => {
        const originalIndex = lines.indexOf(line);
        return (
        <BubbleLettering
          key={`${line.speaker_id}-${index}`}
          line={line}
          index={index}
          placement={placementForLine(line, index, bubbleLines.length, explicitByLine.get(originalIndex))}
          palette={palette}
          hasPaintedBackdrop={hasPaintedBackdrop}
        />
        );
      })}

      <CaptionBox
        lines={captionLines}
        panelNarration={panel.narration}
        presentation={presentation}
      />
    </div>
  );
}
