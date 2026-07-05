interface SplitDialogueOptions {
  maxCharsPerBubble?: number;
  maxBubbles?: number;
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function splitWordsIntoChunks(words: string[], maxChars: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || !current) {
      current = next;
      continue;
    }
    chunks.push(current);
    current = word;
  }
  if (current) chunks.push(current);
  return chunks;
}

function rebalanceChunks(chunks: string[], maxBubbles: number, maxChars: number): string[] {
  if (chunks.length <= maxBubbles) return chunks;
  const words = chunks.join(" ").split(" ");
  const target = Math.ceil(words.length / maxBubbles);
  const balanced: string[] = [];
  for (let i = 0; i < maxBubbles; i += 1) {
    const remainingSlots = maxBubbles - i;
    const remainingWords = words.length;
    const take = i === maxBubbles - 1
      ? remainingWords
      : Math.max(1, Math.min(target, remainingWords - remainingSlots + 1));
    balanced.push(words.splice(0, take).join(" "));
  }
  return balanced.map((chunk) => {
    if (chunk.length <= maxChars) return chunk;
    return chunk.replace(/\s+/g, " ").trim();
  });
}

export function splitDialogueForBubbles(
  text: string,
  options: SplitDialogueOptions = {},
): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const maxChars = options.maxCharsPerBubble ?? 44;
  const maxBubbles = options.maxBubbles ?? 3;
  const chunks = splitWordsIntoChunks(normalized.split(" "), maxChars);
  return rebalanceChunks(chunks, maxBubbles, maxChars);
}
