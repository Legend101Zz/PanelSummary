/**
 * Named page templates. Leaves are numbered "0".."n-1" in reading order
 * (depth-first order of the split tree), so panels fill slots in the order
 * they are listed in the page spec. Descriptions are shown to the LLM.
 *
 * Slant convention: rows gutters with a positive slant descend to the right;
 * cols gutters with a positive slant lean right going down.
 */
import type { LayoutNode } from "../contracts.js";

export interface LayoutTemplate {
  id: string;
  slots: number;
  description: string;
  tree: LayoutNode;
}

const P = (i: number): LayoutNode => ({ panel: String(i) });
const rows = (sizes: number[], children: LayoutNode[], slant?: number): LayoutNode =>
  slant === undefined ? { split: "rows", sizes, children } : { split: "rows", sizes, children, slant };
const cols = (sizes: number[], children: LayoutNode[], slant?: number): LayoutNode =>
  slant === undefined ? { split: "cols", sizes, children } : { split: "cols", sizes, children, slant };

export const TEMPLATES: readonly LayoutTemplate[] = [
  // --- 1 panel -------------------------------------------------------------
  {
    id: "splash",
    slots: 1,
    description: "Full-page splash: one overwhelming moment — a reveal, a climax, or a chapter opener. Keep text to one line.",
    tree: P(0),
  },
  // --- 2 panels ------------------------------------------------------------
  {
    id: "splash_tail",
    slots: 2,
    description: "Near-splash on top with a thin strip below: a big image, then one quiet beat or line that lands after it.",
    tree: rows([0.78, 0.22], [P(0), P(1)]),
  },
  {
    id: "stack_2",
    slots: 2,
    description: "Two wide panels stacked, the first larger: cause then effect, or a scene then a character's reaction.",
    tree: rows([0.58, 0.42], [P(0), P(1)]),
  },
  {
    id: "diagonal_2",
    slots: 2,
    description: "Two panels split by a steep slanted gutter: a clash, a sudden change, or before/after in tension.",
    tree: rows([0.5, 0.5], [P(0), P(1)], -9),
  },
  {
    id: "columns_2",
    slots: 2,
    description: "Two tall side-by-side panels: two characters apart, two parallel lives, or a contrast held in balance.",
    tree: cols([0.5, 0.5], [P(0), P(1)]),
  },
  // --- 3 panels ------------------------------------------------------------
  {
    id: "establish_3",
    slots: 3,
    description: "Wide establishing panel on top, two panels below: set the place, then show who is there and what they do.",
    tree: rows([0.44, 0.56], [P(0), cols([0.55, 0.45], [P(1), P(2)])]),
  },
  {
    id: "l_shape_3",
    slots: 3,
    description: "Tall panel beside two stacked panels: a full figure or a long look, then two beats that follow from it.",
    tree: cols([0.56, 0.44], [P(0), rows([0.5, 0.5], [P(1), P(2)])]),
  },
  {
    id: "stacked_to_tall_3",
    slots: 3,
    description: "Two stacked beats on the left lead into a tall payoff panel on the right: build-up, then the reveal.",
    tree: cols([0.42, 0.58], [rows([0.5, 0.5], [P(0), P(1)]), P(2)]),
  },
  {
    id: "beat_strip_3",
    slots: 3,
    description: "Three wide thin strips: slowed time, a pause, a repeated action, or a silent beat-by-beat moment.",
    tree: rows([1, 1, 1], [P(0), P(1), P(2)]),
  },
  {
    id: "setup_payoff_3",
    slots: 3,
    description: "Two small setup panels on top, one big impact panel below: tension, then the moment everything lands.",
    tree: rows([0.34, 0.66], [cols([0.5, 0.5], [P(0), P(1)]), P(2)]),
  },
  {
    id: "diagonal_3",
    slots: 3,
    description: "Three bands with zig-zag slanted gutters: motion, flight, a chase or a fall across the page.",
    tree: rows([0.3, 0.7], [P(0), rows([0.52, 0.48], [P(1), P(2)], -7)], 7),
  },
  // --- 4 panels ------------------------------------------------------------
  {
    id: "establish_4",
    slots: 4,
    description: "Wide establishing panel on top, three tall narrow panels below: the place, then three quick character beats.",
    tree: rows([0.42, 0.58], [P(0), cols([1, 1, 1], [P(1), P(2), P(3)])]),
  },
  {
    id: "staggered_4",
    slots: 4,
    description: "Two rows with offset wide/narrow panels: a steady back-and-forth conversation with natural rhythm.",
    tree: rows([0.5, 0.5], [cols([0.62, 0.38], [P(0), P(1)]), cols([0.38, 0.62], [P(2), P(3)])]),
  },
  {
    id: "impact_reactions_4",
    slots: 4,
    description: "One big impact panel, then three small reaction panels below: an event and how each witness takes it.",
    tree: rows([0.64, 0.36], [P(0), cols([1, 1, 1], [P(1), P(2), P(3)])]),
  },
  {
    id: "l_shape_4",
    slots: 4,
    description: "Tall panel on the left beside three stacked beats: a figure holds the page while events unfold beside them.",
    tree: cols([0.56, 0.44], [P(0), rows([1, 1, 1], [P(1), P(2), P(3)])]),
  },
  {
    id: "beats_then_impact_4",
    slots: 4,
    description: "Three thin quick beats across the top, then one large panel: a countdown or build-up into a decisive image.",
    tree: rows([0.3, 0.7], [cols([1, 1, 1], [P(0), P(1), P(2)]), P(3)]),
  },
  {
    id: "diagonal_4",
    slots: 4,
    description: "Slanted bands with a split middle: action, struggle or chaos — the page itself feels tilted.",
    tree: rows([0.3, 0.4, 0.3], [P(0), cols([0.5, 0.5], [P(1), P(2)], 8), P(3)], -6),
  },
  // --- 5 panels ------------------------------------------------------------
  {
    id: "staggered_5",
    slots: 5,
    description: "Wide/narrow row, a full-width middle panel, narrow/wide row: an exchange with one central moment.",
    tree: rows([0.34, 0.32, 0.34], [cols([0.6, 0.4], [P(0), P(1)]), P(2), cols([0.4, 0.6], [P(3), P(4)])]),
  },
  {
    id: "establish_5",
    slots: 5,
    description: "Establishing strip on top, then two offset rows: set the place, then a four-beat sequence inside it.",
    tree: rows([0.3, 0.35, 0.35], [P(0), cols([0.4, 0.6], [P(1), P(2)]), cols([0.6, 0.4], [P(3), P(4)])]),
  },
  {
    id: "l_shape_5",
    slots: 5,
    description: "Big panel with two stacked beats beside it on top, two panels below: a scene with asides, then its outcome.",
    tree: rows([0.6, 0.4], [cols([0.6, 0.4], [P(0), rows([0.5, 0.5], [P(1), P(2)])]), cols([0.45, 0.55], [P(3), P(4)])]),
  },
  {
    id: "diagonal_5",
    slots: 5,
    description: "Five panels in slanted bands: a fast action sequence or a journey told in quick cuts.",
    tree: rows([0.36, 0.34, 0.3], [cols([0.55, 0.45], [P(0), P(1)], 6), cols([0.42, 0.58], [P(2), P(3)], -6), P(4)], 6),
  },
  // --- 6 panels ------------------------------------------------------------
  {
    id: "staggered_6",
    slots: 6,
    description: "Three rows of offset panel pairs: a dense dialogue scene or a step-by-step process, still with rhythm.",
    tree: rows([0.33, 0.34, 0.33], [
      cols([0.62, 0.38], [P(0), P(1)]),
      cols([0.4, 0.6], [P(2), P(3)]),
      cols([0.55, 0.45], [P(4), P(5)]),
    ]),
  },
  {
    id: "establish_6",
    slots: 6,
    description: "Establishing strip, a row of three beats, and a closing pair: place, rapid exchange, then the conclusion.",
    tree: rows([0.3, 0.33, 0.37], [P(0), cols([0.34, 0.32, 0.34], [P(1), P(2), P(3)]), cols([0.58, 0.42], [P(4), P(5)])]),
  },
  // --- 7 panels ------------------------------------------------------------
  {
    id: "dense_7",
    slots: 7,
    description: "Seven panels: wide opener, a pair, three quick beats, and a wide closer. Use for montage; keep text very short.",
    tree: rows([0.26, 0.25, 0.23, 0.26], [
      P(0),
      cols([0.55, 0.45], [P(1), P(2)]),
      cols([1, 1, 1], [P(3), P(4), P(5)]),
      P(6),
    ]),
  },
  {
    id: "staggered_7",
    slots: 7,
    description: "Seven panels in offset rows ending on a wide panel: a long conversation or a sequence of small events.",
    tree: rows([0.26, 0.25, 0.25, 0.24], [
      cols([0.6, 0.4], [P(0), P(1)]),
      cols([0.4, 0.6], [P(2), P(3)]),
      cols([0.62, 0.38], [P(4), P(5)]),
      P(6),
    ]),
  },
];

const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));

export function findTemplate(id: string): LayoutTemplate | undefined {
  return BY_ID.get(id);
}

export function templatesWithSlots(count: number): LayoutTemplate[] {
  return TEMPLATES.filter((t) => t.slots === count);
}
