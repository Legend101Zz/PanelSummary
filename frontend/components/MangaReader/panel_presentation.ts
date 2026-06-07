import type { BubblePlacement, SpriteLayer, StoryboardPanel } from "@/lib/types";
import {
  findAssetForCharacter,
  type MangaCharacterAsset,
} from "./asset_lookup";

export type PanelPresentationVariant =
  | "dialogue-over-scene"
  | "caption-strip"
  | "text-card"
  | "scene-only";

export type CaptionZone = "top" | "bottom" | "center" | "none";
export type MissingSpriteFallback = "omit" | "marker";

export interface PanelPresentationPlan {
  variant: PanelPresentationVariant;
  captionZone: CaptionZone;
  shouldRenderSyntheticSprites: boolean;
  shouldRenderExplicitSprites: boolean;
  missingSpriteFallback: MissingSpriteFallback;
  preferCaptionLettering: boolean;
  maxVisibleCaptionChars: number;
  maxBubbleChars: number;
  isVisualDirectionOnly: boolean;
}

interface PanelPresentationInput {
  hasPaintedBackdrop: boolean;
  characterAssets: MangaCharacterAsset[];
  explicitSpriteLayers?: SpriteLayer[];
  explicitBubblePlacements?: BubblePlacement[];
}

function uniqueCharacterIds(panel: StoryboardPanel): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of panel.character_ids ?? []) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    ids.push(trimmed);
    seen.add(trimmed);
  }
  return ids;
}

function textLength(value: string | undefined): number {
  return value?.trim().length ?? 0;
}

function dialogueStats(panel: StoryboardPanel): {
  lineCount: number;
  totalChars: number;
  longestLine: number;
} {
  const lines = panel.dialogue ?? [];
  return {
    lineCount: lines.length,
    totalChars: lines.reduce((sum, line) => sum + textLength(line.text), 0),
    longestLine: lines.reduce((max, line) => Math.max(max, textLength(line.text)), 0),
  };
}

function hasRenderableSprite(
  characterId: string,
  panel: StoryboardPanel,
  assets: MangaCharacterAsset[],
): boolean {
  const expression = panel.dialogue?.find((line) => line.speaker_id === characterId)?.intent;
  const asset = findAssetForCharacter(characterId, expression, assets);
  return Boolean(asset?.image_url && asset.asset_type !== "reference_sheet");
}

function visualDirectionOnly(panel: StoryboardPanel): boolean {
  return Boolean(
    textLength(panel.action) &&
      !textLength(panel.narration) &&
      !(panel.dialogue?.length),
  );
}

export function clampVisibleText(text: string, maxChars: number): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxChars) return trimmed;
  const sliced = trimmed.slice(0, Math.max(0, maxChars - 1)).trimEnd();
  return `${sliced}...`;
}

export function planPanelPresentation(
  panel: StoryboardPanel,
  input: PanelPresentationInput,
): PanelPresentationPlan {
  const characterIds = uniqueCharacterIds(panel);
  const renderableSpriteCount = characterIds.filter((id) =>
    hasRenderableSprite(id, panel, input.characterAssets),
  ).length;
  const explicitSprites = input.explicitSpriteLayers?.length ?? 0;
  const dialogue = dialogueStats(panel);
  const hasDialogue = dialogue.lineCount > 0;
  const hasNarration = textLength(panel.narration) > 0;
  const actionChars = textLength(panel.action);
  const isVisualDirectionOnly = visualDirectionOnly(panel);
  const manyCharacters = characterIds.length >= 4;
  const denseDialogue = dialogue.longestLine > 58 || dialogue.totalChars > 96 || dialogue.lineCount > 2;
  const denseCaption =
    textLength(panel.narration) > 130 ||
    actionChars > 130 ||
    (hasNarration && actionChars > 64);

  const shouldRenderExplicitSprites = explicitSprites > 0;
  const shouldRenderSyntheticSprites = Boolean(
    !input.hasPaintedBackdrop &&
      !shouldRenderExplicitSprites &&
      renderableSpriteCount > 0 &&
      !manyCharacters,
  );

  if (hasDialogue && denseDialogue) {
    return {
      variant: "text-card",
      captionZone: "center",
      shouldRenderSyntheticSprites: false,
      shouldRenderExplicitSprites,
      missingSpriteFallback: "omit",
      preferCaptionLettering: true,
      maxVisibleCaptionChars: 210,
      maxBubbleChars: 44,
      isVisualDirectionOnly,
    };
  }

  if (hasDialogue) {
    return {
      variant: "dialogue-over-scene",
      captionZone: hasNarration ? "bottom" : "none",
      shouldRenderSyntheticSprites,
      shouldRenderExplicitSprites,
      missingSpriteFallback: "omit",
      preferCaptionLettering: false,
      maxVisibleCaptionChars: 150,
      maxBubbleChars: 34,
      isVisualDirectionOnly,
    };
  }

  if (denseCaption) {
    return {
      variant: "text-card",
      captionZone: "center",
      shouldRenderSyntheticSprites: false,
      shouldRenderExplicitSprites: false,
      missingSpriteFallback: "omit",
      preferCaptionLettering: true,
      maxVisibleCaptionChars: 220,
      maxBubbleChars: 0,
      isVisualDirectionOnly,
    };
  }

  if (isVisualDirectionOnly || manyCharacters) {
    return {
      variant: actionChars > 0 ? "caption-strip" : "scene-only",
      captionZone: "bottom",
      shouldRenderSyntheticSprites: shouldRenderSyntheticSprites && !manyCharacters,
      shouldRenderExplicitSprites: shouldRenderExplicitSprites && !manyCharacters,
      missingSpriteFallback: "omit",
      preferCaptionLettering: true,
      maxVisibleCaptionChars: 116,
      maxBubbleChars: 0,
      isVisualDirectionOnly,
    };
  }

  if (hasNarration || actionChars > 0) {
    return {
      variant: "caption-strip",
      captionZone: "bottom",
      shouldRenderSyntheticSprites,
      shouldRenderExplicitSprites,
      missingSpriteFallback: "omit",
      preferCaptionLettering: true,
      maxVisibleCaptionChars: 150,
      maxBubbleChars: 0,
      isVisualDirectionOnly,
    };
  }

  return {
    variant: "scene-only",
    captionZone: "none",
    shouldRenderSyntheticSprites,
    shouldRenderExplicitSprites,
    missingSpriteFallback: "omit",
    preferCaptionLettering: false,
    maxVisibleCaptionChars: 0,
    maxBubbleChars: 0,
    isVisualDirectionOnly,
  };
}
