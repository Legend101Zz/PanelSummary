import { splitDialogueForBubbles } from "./dialogue_lettering";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const longLine =
  "We are all trying to cope with unexpected changes, and none of us know how to say that out loud.";

const chunks = splitDialogueForBubbles(longLine, { maxCharsPerBubble: 44, maxBubbles: 3 });

assertEqual(chunks.length, 3, "long dialogue chunk count");
assertEqual(chunks.join(" "), longLine, "long dialogue preserves exact words");
if (chunks.some((chunk) => chunk.includes("...") || chunk.includes("…"))) {
  throw new Error("long dialogue must split into bubbles, not ellipsize");
}
if (chunks.some((chunk) => chunk.length > 44)) {
  throw new Error(`bubble chunk exceeds 44 chars: ${JSON.stringify(chunks)}`);
}
