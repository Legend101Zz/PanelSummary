"use client";

/**
 * MangaReader/panels/DialoguePanel.tsx — speech-bubble panel
 * ============================================================
 * Renders a ``StoryboardPanel`` whose sub-renderer dispatch landed on
 * ``"dialogue"`` (i.e. has at least one ``StoryboardScriptLine``). Same
 * SVG-bubble + avatar-disc lettering treatment the V4 version shipped
 * — preserved verbatim so 4.5b is a behaviour-preserving cutover. The
 * difference is the consumed shape: ``StoryboardScriptLine`` not
 * ``V4DialogueLine``. ``speaker_id`` is the speaker; ``intent`` is the
 * line's emotional weight (and drives the bubble variant).
 */

import { motion } from "motion/react";
import type { StoryboardPanel, StoryboardScriptLine } from "@/lib/types";
import { SpeechBubble, type SpeechBubbleVariant } from "@/components/V4Engine/SpeechBubble";
import type { MangaPalette } from "../types";
import {
  findAssetForCharacter,
  type V4CharacterAsset,
} from "../asset_lookup";

interface DialoguePanelProps {
  panel: StoryboardPanel;
  palette: MangaPalette;
  assets?: V4CharacterAsset[];
  /**
   * When the panel has painted art behind the lettering, we hide the
   * synthetic avatar disc — the painted character is already on
   * screen. The name tag stays because real manga letterers always
   * identify the speaker even on painted pages.
   */
  hasPaintedBackdrop?: boolean;
}

/**
 * Map a line's ``intent`` to the SVG bubble variant. Plain speech is
 * the YAGNI default. Loud beats (``shocked``, ``angry``) get the
 * spiky shout shape; reflective ones (``thinking``, ``melancholy``)
 * get the cloud bubble.
 */
function variantForIntent(intent: string | undefined): SpeechBubbleVariant {
  if (!intent) return "speech";
  const i = intent.toLowerCase();
  if (i === "shocked" || i === "angry") return "shout";
  if (i === "thinking" || i === "thought" || i === "melancholy") return "thought";
  return "speech";
}

const INTENT_STYLES: Record<string, { borderColor: string; fontStyle: string }> = {
  angry:      { borderColor: "#E8191A", fontStyle: "normal" },
  frustrated: { borderColor: "#F5A623", fontStyle: "normal" },
  shocked:    { borderColor: "#9B59B6", fontStyle: "italic" },
  fearful:    { borderColor: "#5E7090", fontStyle: "italic" },
  determined: { borderColor: "#0053E2", fontStyle: "normal" },
  triumphant: { borderColor: "#2A8703", fontStyle: "normal" },
  neutral:    { borderColor: "#666", fontStyle: "normal" },
  smirk:      { borderColor: "#F5A623", fontStyle: "italic" },
};

function findLineAsset(
  line: StoryboardScriptLine,
  assets: V4CharacterAsset[],
): V4CharacterAsset | null {
  return findAssetForCharacter(line.speaker_id, line.intent, assets);
}

interface SpeechBubbleRowProps {
  line: StoryboardScriptLine;
  index: number;
  isRight: boolean;
  palette: MangaPalette;
  asset: V4CharacterAsset | null;
  showAvatar: boolean;
}

function SpeechBubbleRow({
  line,
  index,
  isRight,
  palette,
  asset,
  showAvatar,
}: SpeechBubbleRowProps) {
  const intentStyle = INTENT_STYLES[line.intent || "neutral"] || INTENT_STYLES.neutral;
  const variant = variantForIntent(line.intent);
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
      <div className="shrink-0 flex flex-col items-center gap-1 max-w-20">
        {showAvatar && (
          <div
            className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center"
            style={{
              color: intentStyle.borderColor,
              background: `${intentStyle.borderColor}15`,
              border: `1px solid ${intentStyle.borderColor}40`,
            }}
          >
            {asset?.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={asset.image_url}
                alt={`${line.speaker_id} ${line.intent || "neutral"}`}
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
                {line.speaker_id.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
        )}
        <div
          className="px-1.5 py-0.5 rounded text-xs font-bold tracking-wider uppercase max-w-full"
          style={{
            color: intentStyle.borderColor,
            background: `${intentStyle.borderColor}15`,
            fontFamily: "var(--font-label, monospace)",
            fontSize: "0.52rem",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {line.speaker_id}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, maxWidth: "75%" }}>
        <SpeechBubble
          tailSide={tailSide}
          tailOffset={0.5}
          variant={variant}
          strokeColor={intentStyle.borderColor}
          fillColor={
            variant === "thought"
              ? `${palette.text}10`
              : isRight
                ? `${palette.accent}18`
                : `${palette.text}0d`
          }
          strokeWidth={variant === "shout" ? 3 : 2}
          ariaLabel={`${line.speaker_id} says ${line.text}`}
          style={{ width: "100%", minHeight: 56 }}
        >
          <p
            style={{
              color: palette.text,
              fontFamily: "var(--font-body, sans-serif)",
              fontSize: "clamp(0.7rem, 1.3vw, 0.85rem)",
              fontStyle: intentStyle.fontStyle,
              fontWeight: variant === "shout" ? 700 : 400,
              lineHeight: 1.4,
              margin: 0,
              textAlign: "center",
            }}
          >
            {line.text}
          </p>
        </SpeechBubble>
      </div>
    </motion.div>
  );
}

export function DialoguePanel({
  panel,
  palette,
  assets = [],
  hasPaintedBackdrop = false,
}: DialoguePanelProps) {
  const lines = panel.dialogue ?? [];

  return (
    <div className="w-full h-full flex flex-col justify-center gap-3 px-4 py-3 overflow-hidden">
      {panel.scene_id && (
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
          {panel.scene_id.replace(/[-_]/g, " ")}
        </div>
      )}

      {lines.map((line, i) => (
        <SpeechBubbleRow
          key={`${line.speaker_id}-${i}`}
          line={line}
          index={i}
          isRight={i % 2 === 1}
          palette={palette}
          asset={findLineAsset(line, assets)}
          showAvatar={!hasPaintedBackdrop}
        />
      ))}

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
