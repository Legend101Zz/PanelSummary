/**
 * Hand-made state table for acceptance run 8 (the model's understanding had no
 * state data). Written from the source text of "The Happy Prince", "The
 * Nightingale and the Rose", "The Selfish Giant" and "The Devoted Friend".
 *
 * `eyes: "one_empty"` stands for the "one eye given" look. The renderer has no
 * such eye state at the time of writing (EYE_STATES: open, closed, blind, dead);
 * the value follows the renderer track's final name. The check compares strings,
 * so the fixture works with any name.
 */
import type { StateChange } from "../../src/goals/continuity.js";

export const RUN8_STATES: Record<string, StateChange[]> = {
  c_prince: [
    { at: "s1u5", claim: "k14", set: { eyes: "one_empty" }, note: "plucks out one sapphire for the student" },
    { at: "s1u6", claim: "k16", set: { eyes: "blind" }, note: "gives the second sapphire to the match-girl" },
    { at: "s1u7", claim: "k19", set: { material: "stone" }, note: "the Swallow strips the gold; dull and grey" },
  ],
  c_swallow: [{ at: "s1u7", claim: "k21", set: { eyes: "dead" }, note: "dies at the Prince's feet" }],
  c_nightingale: [{ at: "s2u4", claim: "k36", set: { eyes: "dead" }, note: "dies on the thorn" }],
  c_giant: [{ at: "s3u4", claim: "k48", set: { eyes: "dead" }, note: "found dead under the tree" }],
  c_hans: [{ at: "s4u8", claim: "k58", set: { eyes: "dead" }, note: "drowned on the moor" }],
};
