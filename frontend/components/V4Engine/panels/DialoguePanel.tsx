"use client";

/**
 * DialoguePanel — Character conversation
 * ========================================
 * Speech bubbles with character identifiers.
 * The bread-and-butter of manga storytelling.
 */

import { motion } from "motion/react";
import type { V4CharacterAsset, V4Panel, V4DialogueLine } from "../types";
import { DEFAULT_PALETTE } from "../types";
import { findAssetForCharacter } from "../assetLookup";
import { SpeechBubble, type SpeechBubbleVariant } from "../SpeechBubble";

interface DialoguePanelProps {
  panel: V4Panel;
  palette: typeof DEFAULT_PALETTE;
  assets?: V4CharacterAsset[];
  /**
   * Phase 4: when true, the dialogue bubbles render WITHOUT the avatar disc
   * because the painted backdrop already shows the speakers. Bubbles still
   * keep the small name tag so the reader knows who's talking; that's
   * exactly what real manga letterers do over painted panels.
   */
  hasPaintedBackdrop?: boolean;
}

function findLineAsset(line: V4DialogueLine, assets: V4CharacterAsset[]): V4CharacterAsset | null {
  return findAssetForCharacter(line.who, line.emotion, assets);
}

/**
 * Pick a bubble variant from the line's emotion. Most lines are plain
 * speech; ``shocked`` gets the spiky shout shape, ``thinking`` gets
 * the cloud. Anything we don't have a strong opinion about falls back
 * to plain speech — that's the YAGNI default.
 */
function variantForEmotion(emotion: string | undefined): SpeechBubbleVariant {
  if (!emotion) return "speech";
  const e = emotion.toLowerCase();
  if (e === "shocked" || e === "angry") return "shout";
  if (e === "thinking" || e === "thought" || e === "melancholy") return "thought";
  return "speech";
}

const EMOTION_STYLES: Record<string, { borderColor: string; fontStyle: string }> = {
  angry:      { borderColor: "#E8191A", fontStyle: "normal" },
  frustrated: { borderColor: "#F5A623", fontStyle: "normal" },
  shocked:    { borderColor: "#9B59B6", fontStyle: "italic" },
  fearful:    { borderColor: "#5E7090", fontStyle: "italic" },
  determined: { borderColor: "#0053E2", fontStyle: "normal" },
  triumphant: { borderColor: "#2A8703", fontStyle: "normal" },
  neutral:    { borderColor: "#666", fontStyle: "normal" },
  smirk:      { borderColor: "#F5A623", fontStyle: "italic" },
};

function SpeechBubbleRow({
  line,
  index,
  isRight,
  palette,
  asset,
  showAvatar,
}: {
  line: V4DialogueLine;
  index: number;
  isRight: boolean;
  palette: typeof DEFAULT_PALETTE;
  asset: V4CharacterAsset | null;
  showAvatar: boolean;
}) {
  const emotionStyle = EMOTION_STYLES[line.emotion || "neutral"] || EMOTION_STYLES.neutral;
  const variant = variantForEmotion(line.emotion);
  // Tail points BACK toward the speaker's avatar / name tag column,
  // so the bubble visually anchors to whoever is talking. When the
  // avatar is hidden (painted backdrop), point the tail down at the
  // bottom edge — the painted character is somewhere below.
  const tailSide: "left" | "right" | "bottom" = !showAvatar
    ? "bottom"
    : isRight
      ? "right"
      : "left";

  return (
    <motion.div
      className={`flex ${isRight ? "flex-row-reverse" : "flex-row"} items-start gap-2 w-full`}
      initial={{ opacity: 0, x: isRight ? 20 : -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: index * 0.3 }}
    >
      {/* Speaker column — avatar disc (when no painted backdrop) plus
          a small name tag. Real manga letterers always identify the
          speaker even on painted pages, so the tag stays. */}
      <div className="shrink-0 flex flex-col items-center gap-1 max-w-20">
        {showAvatar && (
          <div
            className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center"
            style={{
              color: emotionStyle.borderColor,
              background: `${emotionStyle.borderColor}15`,
              border: `1px solid ${emotionStyle.borderColor}40`,
            }}
          >
            {asset?.image_url ? (
              <img
                src={asset.image_url}
                alt={`${line.who} ${line.emotion || "neutral"}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <span
                style={{
                  fontFamily: "var(--font-label, monospace)",
                  fontSize: "0.62rem",
                }}
              >
                {line.who.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
        )}
        <div
          className="px-1.5 py-0.5 rounded text-xs font-bold tracking-wider uppercase max-w-full"
          style={{
            color: emotionStyle.borderColor,
            background: `${emotionStyle.borderColor}15`,
            fontFamily: "var(--font-label, monospace)",
            fontSize: "0.52rem",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {line.who}
        </div>
      </div>

      {/* SVG speech bubble. Width set in CSS so the SVG scales
          responsively; height auto-grows with text inside. */}
      <div style={{ flex: 1, minWidth: 0, maxWidth: "75%" }}>
        <SpeechBubble
          tailSide={tailSide}
          tailOffset={0.5}
          variant={variant}
          strokeColor={emotionStyle.borderColor}
          fillColor={
            variant === "thought"
              ? `${palette.text}10`
              : isRight
                ? `${palette.accent}18`
                : `${palette.text}0d`
          }
          strokeWidth={variant === "shout" ? 3 : 2}
          ariaLabel={`${line.who} says ${line.says}`}
          style={{
            width: "100%",
            minHeight: 56,
          }}
        >
          <p
            style={{
              color: palette.text,
              fontFamily: "var(--font-body, sans-serif)",
              fontSize: "clamp(0.7rem, 1.3vw, 0.85rem)",
              fontStyle: emotionStyle.fontStyle,
              fontWeight: variant === "shout" ? 700 : 400,
              lineHeight: 1.4,
              margin: 0,
              textAlign: "center",
            }}
          >
            {line.says}
          </p>
        </SpeechBubble>
      </div>
    </motion.div>
  );
}

export function DialoguePanel({ panel, palette, assets = [], hasPaintedBackdrop = false }: DialoguePanelProps) {
  const lines = panel.lines || [];

  return (
    <div className="w-full h-full flex flex-col justify-center gap-3 px-4 py-3 overflow-hidden">
      {/* Scene indicator */}
      {panel.scene && (
        <div
          className="text-center mb-1"
          style={{
            color: `${palette.text}40`,
            fontFamily: "var(--font-label, monospace)",
            fontSize: "0.55rem",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
          }}
        >
          {panel.scene.replace("-", " ")}
        </div>
      )}

      {/* Dialogue lines */}
      {lines.map((line, i) => (
        <SpeechBubbleRow
          key={`${line.who}-${i}`}
          line={line}
          index={i}
          isRight={i % 2 === 1}
          palette={palette}
          asset={findLineAsset(line, assets)}
          showAvatar={!hasPaintedBackdrop}
        />
      ))}

      {/* Narration (if any, shown as small caption) */}
      {panel.narration && (
        <motion.p
          className="text-center mt-2"
          style={{
            color: `${palette.text}70`,
            fontFamily: "var(--font-body, sans-serif)",
            fontSize: "0.7rem",
            fontStyle: "italic",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: lines.length * 0.3 + 0.2 }}
        >
          {panel.narration}
        </motion.p>
      )}
    </div>
  );
}
