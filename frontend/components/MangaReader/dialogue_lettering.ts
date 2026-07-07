interface SplitDialogueOptions {
  maxCharsPerBubble?: number;
  maxBubbles?: number;
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function boundaryIndexes(text: string): number[] {
  const indexes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (/[.!?,;:]/.test(text[i])) {
      indexes.push(i + 1);
    }
  }
  return indexes.filter((index) => index > 0 && index < text.length);
}

function nearestSpaceIndex(text: string, target: number): number {
  const spaces: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === " ") spaces.push(i);
  }
  if (!spaces.length) return -1;
  return spaces.reduce((best, index) =>
    Math.abs(index - target) < Math.abs(best - target) ? index : best,
  );
}

function splitAtBestBoundary(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const target = text.length / 2;
  const punctuation = boundaryIndexes(text);
  const boundary = punctuation.length
    ? punctuation.reduce((best, index) =>
      Math.abs(index - target) < Math.abs(best - target) ? index : best,
    )
    : nearestSpaceIndex(text, target);

  if (boundary <= 0 || boundary >= text.length) return [text];
  return [
    text.slice(0, boundary).trim(),
    text.slice(boundary).trim(),
  ].filter(Boolean);
}

export function splitDialogueForBubbles(
  text: string,
  options: SplitDialogueOptions = {},
): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const maxChars = options.maxCharsPerBubble ?? 44;
  const maxBubbles = Math.min(options.maxBubbles ?? 2, 2);
  if (maxBubbles <= 1) return [normalized];
  return splitAtBestBoundary(normalized, maxChars).slice(0, maxBubbles);
}
