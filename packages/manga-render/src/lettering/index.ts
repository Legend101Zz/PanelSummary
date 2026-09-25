/**
 * Lettering for one panel: balloons, narration boxes, captions and SFX,
 * placed in reading order with tails to the speakers' mouths.
 */
import type { Box, Point, RenderedText, TextSpec, ValidationIssue } from "../contracts.js";
import { mulberry32 } from "../prng.js";
import { countWords } from "./breaking.js";
import { drawBalloon, layoutBalloon } from "./shapes.js";
import { measure } from "./fonts.js";
import {
  placeCandidates,
  placeOne,
  type HeadCircle,
  type Placed,
  type PlacementPanel,
  type PlaceRequest,
  type SpeakerAnchor,
  type TailTarget,
} from "./place.js";
import { KIND_STYLES, SPEAKING_KINDS, minFontSize } from "./styles.js";

export { KIND_STYLES, minFontSize, SPEAKING_KINDS } from "./styles.js";
export { breakBalanced, countWords } from "./breaking.js";
export { measure, metrics } from "./fonts.js";
export { layoutBalloon } from "./shapes.js";
export { readsAfter, speakerTip, offPanelTip, type HeadCircle, type SpeakerAnchor } from "./place.js";

export interface LetterPanelInput {
  panelId: string;
  polygon: Point[];
  bbox: Box;
  texts: readonly TextSpec[];
  /** Figures drawn in this panel, in page space. */
  speakers: readonly SpeakerAnchor[];
  /** Every head circle in the panel (never covered). */
  heads: readonly HeadCircle[];
  /** Figure body boxes (lightly avoided). */
  bodies: readonly Box[];
  /** Key art to keep clear (e.g. the insert prop), avoided strongly. */
  obstacles?: readonly Box[];
  /** Page-space positions of speakers drawn in OTHER panels (for off-panel tails). */
  offPanel?: Readonly<Record<string, Point>>;
  rtl?: boolean;
  seed: number;
}

export interface LetterPanelResult {
  /** Balloons, narration and captions. */
  balloons: string;
  /** Sound effects (drawn last). */
  sfx: string;
  texts: RenderedText[];
  issues: ValidationIssue[];
  /** Placement details (tests, debugging). */
  placed: Placed[];
}

/**
 * Rough page-space area (px²) the balloons/boxes of a panel will need at
 * their preferred size (bounding boxes, SFX excluded). Used by the composer
 * to keep room above close-range figures.
 */
export function estimateTextArea(texts: readonly TextSpec[]): number {
  let area = 0;
  for (const t of texts) {
    if (t.kind === "sfx" || typeof t.text !== "string" || !KIND_STYLES[t.kind]) continue;
    const style = KIND_STYLES[t.kind];
    const size = style.sizes[0];
    const text = t.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const natural = measure(text, style.face, size);
    const longest = Math.max(...text.split(" ").map((w) => measure(w, style.face, size)));
    const width = Math.max(longest + 1, Math.sqrt(natural * size * style.lineHeight * 1.7));
    const layout = layoutBalloon(t.kind, text, size, width);
    if (layout) area += layout.hw * 2 * layout.hh * 2;
  }
  return area;
}

/** Font sizes to try; SFX are capped relative to the panel so they never swamp it. */
function sizesFor(kind: TextSpec["kind"], bbox: Box): readonly number[] {
  const sizes = KIND_STYLES[kind].sizes;
  if (kind !== "sfx") return sizes;
  const cap = Math.max(minFontSize("sfx"), Math.min(bbox.h * 0.2, bbox.w * 0.22));
  const out = sizes.filter((s) => s <= cap);
  return out.length > 0 ? out : [minFontSize("sfx")];
}

function snippet(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 60 ? `${t.slice(0, 57)}...` : t;
}

function targetFor(t: TextSpec, input: LetterPanelInput): TailTarget {
  if (!SPEAKING_KINDS.includes(t.kind) || !t.speaker) return { type: "none" };
  const anchor = input.speakers.find((s) => s.character === t.speaker);
  if (anchor) return { type: "speaker", anchor };
  return { type: "offpanel", toward: input.offPanel?.[t.speaker] };
}

/** Largest word-prefix of `text` that would fit (for the TEXT_DOES_NOT_FIT hint). */
function maxWordsThatFit(req: PlaceRequest, panel: PlacementPanel, placed: readonly Placed[]): number {
  const words = req.text.trim().split(/\s+/).filter(Boolean);
  const min = [minFontSize(req.kind)];
  let lo = 0;
  let hi = words.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const ok = placeOne({ ...req, text: words.slice(0, mid).join(" ") }, panel, placed, min, "strict");
    if (ok) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const BEAM_WIDTH = 4;
const BRANCH = 4;

interface BeamState {
  placed: Placed[];
  cost: number;
  order: number;
}

/** Place a text that failed the strict rules so the preview still shows it in full. */
function relaxedPlacement(req: PlaceRequest, panel: PlacementPanel, placed: readonly Placed[], bbox: Box): Placed | undefined {
  const min = [minFontSize(req.kind)];
  const r =
    placeOne(req, panel, placed, min, "no_order") ??
    placeOne(req, panel, placed, min, "no_heads") ??
    placeOne(req, panel, placed, min, "loose");
  if (r) return r;
  // Even the whole panel is too small: centre it so the preview shows the overflow.
  const pad = 400;
  return placeOne(
    req,
    {
      ...panel,
      polygon: [
        { x: bbox.x - pad, y: bbox.y - pad },
        { x: bbox.x + bbox.w + pad, y: bbox.y - pad },
        { x: bbox.x + bbox.w + pad, y: bbox.y + bbox.h + pad },
        { x: bbox.x - pad, y: bbox.y + bbox.h + pad },
      ],
      bbox: { x: bbox.x - pad, y: bbox.y - pad, w: bbox.w + pad * 2, h: bbox.h + pad * 2 },
    },
    [],
    min,
    "loose",
  );
}

function overflowIssue(panelId: string, index: number, t: TextSpec, text: string, fitWords: number): ValidationIssue {
  const words = countWords(text);
  return {
    code: "TEXT_DOES_NOT_FIT",
    severity: "error",
    path: `panel ${panelId} text ${index}`,
    message:
      `${t.kind} "${snippet(text)}" (${words} words) does not fit in panel ${panelId} at the minimum ${minFontSize(t.kind)}px size ` +
      `without covering a face or another balloon. ` +
      (fitWords > 0
        ? `Max ~${fitWords} words fit here; shorten it, move part of it to another panel, `
        : `Nothing of this length fits here; drop a balloon from this panel, `) +
      `or give this panel more room (larger layout slot, a wider shot, or fewer figures).`,
  };
}

/**
 * Letter one panel. Balloons and boxes are placed in reading order with a
 * small beam search (so an early balloon does not grab the space a later one
 * needs); SFX are placed afterwards as free lettering.
 */
export function letterPanel(input: LetterPanelInput): LetterPanelResult {
  const panel: PlacementPanel = {
    polygon: input.polygon,
    bbox: input.bbox,
    heads: input.heads,
    bodies: input.bodies,
    obstacles: input.obstacles ?? [],
    rtl: input.rtl === true,
  };
  const issues: ValidationIssue[] = [];
  const rand = mulberry32(input.seed);
  const usable = (t: TextSpec) => typeof t.text === "string" && t.text.trim().length > 0 && KIND_STYLES[t.kind] !== undefined;
  const clean = (t: TextSpec) => t.text.replace(/\s+/g, " ").trim();

  // --- balloons and boxes: beam search in reading order -------------------
  const order = input.texts.map((t, i) => ({ t, i })).filter(({ t }) => t.kind !== "sfx" && usable(t));
  const isBox = (t: TextSpec) => t.kind === "narration" || t.kind === "caption";
  /** Box anchoring: open the panel from the start corner, close it from the end corner, otherwise flow. */
  const anchorFor = (k: number, flowOnly: boolean): PlaceRequest["boxAnchor"] => {
    if (order.slice(0, k).every(({ t }) => isBox(t))) return "start";
    if (!flowOnly && k === order.length - 1) return "end";
    return "flow";
  };
  const runBeam = (width: number, branch: number, flowOnly: boolean, allSizes: boolean) => {
    let beam: BeamState[] = [{ placed: [], cost: 0, order: 0 }];
    const failures: ValidationIssue[] = [];
    order.forEach(({ t, i }, k) => {
      const text = clean(t);
      const target = targetFor(t, input);
      const sizes = sizesFor(t.kind, input.bbox);
      const boxAnchor = anchorFor(k, flowOnly);
      const next: BeamState[] = [];
      for (const state of beam) {
        const req: PlaceRequest = { index: i, kind: t.kind, text, target, order: state.order, boxAnchor };
        if (!allSizes) {
          for (const c of placeCandidates(req, panel, state.placed, sizes, "strict", branch)) {
            next.push({ placed: [...state.placed, c], cost: state.cost + c.cost, order: state.order + 1 });
          }
          continue;
        }
        // Tight panel: let earlier texts step down in size (never below the
        // kind's minimum) so later ones fit; each step costs a little.
        sizes.forEach((size, step) => {
          for (const c of placeCandidates(req, panel, state.placed, [size], "strict", branch)) {
            next.push({ placed: [...state.placed, c], cost: state.cost + c.cost + 6 * step, order: state.order + 1 });
          }
        });
      }
      if (next.length > 0) {
        next.sort((a, b) => a.cost - b.cost);
        beam = next.slice(0, width);
        return;
      }
      // Nothing fits in any partial layout: report it, then draw it relaxed.
      const state = beam[0];
      const req: PlaceRequest = { index: i, kind: t.kind, text, target, order: state.order, boxAnchor };
      failures.push(overflowIssue(input.panelId, i, t, text, maxWordsThatFit(req, panel, state.placed)));
      const relaxed = relaxedPlacement(req, panel, state.placed, input.bbox);
      beam = [{ placed: relaxed ? [...state.placed, relaxed] : state.placed, cost: state.cost + 1e6, order: state.order + 1 }];
    });
    return { placed: beam[0].placed, failures };
  };
  let attempt = runBeam(BEAM_WIDTH, BRANCH, false, false);
  if (attempt.failures.length > 0) {
    // A tight panel: search wider, let boxes flow and sizes step down before giving up.
    const wide = runBeam(BEAM_WIDTH * 2, BRANCH, true, true);
    if (wide.failures.length < attempt.failures.length) attempt = wide;
  }
  issues.push(...attempt.failures);
  const placed = [...attempt.placed];

  // --- SFX: free lettering, placed after the balloons ----------------------
  input.texts.forEach((t, i) => {
    if (t.kind !== "sfx" || !usable(t)) return;
    const text = clean(t);
    const rotate = (rand() < 0.5 ? -1 : 1) * (6 + rand() * 7);
    const req: PlaceRequest = { index: i, kind: "sfx", text, target: { type: "none" }, order: 0, rotate };
    let result = placeOne(req, panel, placed, sizesFor("sfx", input.bbox), "strict");
    if (!result) {
      issues.push(overflowIssue(input.panelId, i, t, text, maxWordsThatFit(req, panel, placed)));
      result = relaxedPlacement(req, panel, placed, input.bbox);
    }
    if (result) placed.push(result);
  });

  const texts: RenderedText[] = placed.map((p) => {
    const t = input.texts[p.index];
    return {
      panel: input.panelId,
      index: p.index,
      kind: t.kind,
      ...(t.speaker ? { speaker: t.speaker } : {}),
      text: t.text,
      fidelity: t.fidelity,
      ...(t.source ? { source: t.source } : {}),
      bbox: roundBox(p.box),
      font_px: p.layout.fontSize,
      lines: p.layout.block.lines,
    };
  });
  texts.sort((a, b) => a.index - b.index);
  issues.sort((a, b) => a.path.localeCompare(b.path));

  const balloons: string[] = [];
  const sfx: string[] = [];
  for (const p of placed) {
    const drawRand = mulberry32((input.seed ^ Math.imul(p.index + 1, 0x9e3779b1)) >>> 0);
    const svg = drawBalloon(p.layout, p.center, p.tail, drawRand);
    if (p.kind === "sfx") sfx.push(svg);
    else balloons.push(svg);
  }
  return { balloons: balloons.join(""), sfx: sfx.join(""), texts, issues, placed };
}

function roundBox(b: Box): Box {
  const r = (v: number) => Math.round(v * 100) / 100;
  return { x: r(b.x), y: r(b.y), w: r(b.w), h: r(b.h) };
}
