import { buildBubblePath } from "./chrome/SpeechBubble";
import { MANGA_BODY_FONT, MANGA_SFX_FONT } from "./lettering_fonts";

function assertIncludes(actual: string, expected: string, label: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${label}: expected ${actual} to include ${expected}`);
  }
}

const pathA = buildBubblePath("speech", "bottom", 0.5, 11);
const pathB = buildBubblePath("speech", "bottom", 0.5, 29);

if (pathA === pathB) {
  throw new Error("irregular bubble paths should vary by seed");
}

assertIncludes(pathA, "C", "irregular path uses organic curves");
assertIncludes(MANGA_BODY_FONT, "Comic Neue", "body lettering font");
assertIncludes(MANGA_SFX_FONT, "Bangers", "sfx display font");
