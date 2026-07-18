import { splitDialogueForBubbles } from "./dialogue_lettering";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const longLine =
  "We are all trying to cope with unexpected changes, and none of us know how to say that out loud.";

const chunks = splitDialogueForBubbles(longLine, { maxCharsPerBubble: 44, maxBubbles: 2 });

assertEqual(chunks.length, 2, "long dialogue chunk count");
assertEqual(chunks.join(" "), longLine, "long dialogue preserves exact words");
if (chunks.some((chunk) => chunk.includes("...") || chunk.includes("…"))) {
  throw new Error("long dialogue must split into bubbles, not ellipsize");
}
if (chunks.some((chunk) => /-\s*$/.test(chunk))) {
  throw new Error(`bubble chunk must not end with mid-word hyphenation: ${JSON.stringify(chunks)}`);
}

const clauseLine = "I found the cheese, but the maze changed before we could celebrate.";
const clauseChunks = splitDialogueForBubbles(clauseLine, {
  maxCharsPerBubble: 34,
  maxBubbles: 2,
});

assertEqual(clauseChunks.length, 2, "clause dialogue chunk count");
assertEqual(clauseChunks[0], "I found the cheese,", "clause split keeps comma boundary");
assertEqual(clauseChunks.join(" "), clauseLine, "clause split preserves exact words");

const sentenceLine = "The station is empty. We still have to move.";
const sentenceChunks = splitDialogueForBubbles(sentenceLine, {
  maxCharsPerBubble: 28,
  maxBubbles: 2,
});

assertEqual(sentenceChunks[0], "The station is empty.", "sentence split keeps sentence boundary");
if (sentenceChunks.length > 2) {
  throw new Error(`dialogue line split into more than two bubbles: ${JSON.stringify(sentenceChunks)}`);
}
