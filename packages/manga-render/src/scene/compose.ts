/**
 * Scene composer: turns one PanelSpec into page-space SVG inside its panel
 * polygon — environment, fx, figures (framed by shot/angle/slot/depth),
 * props — and reports page-space head/mouth anchors for lettering.
 *
 * Rigs and props draw in figure space (ground at y=0, facing right, adult
 * = 100 units). The composer scales them with lineWidth = pageStroke / scale
 * so ink weight is the same in every shot.
 */
import type {
  Angle,
  Box,
  CastMember,
  Depth,
  FigureSpec,
  LocationSpec,
  PanelSpec,
  Point,
  PropId,
  Shot,
  Slot,
} from "../contracts.js";
import type { DrawContext, FigureAnchors, FigureDrawing, PropDrawing } from "../internal.js";
import { rig } from "../rig/index.js";
import { environments } from "../env/index.js";
import { props as propModule } from "../props/index.js";
import { fx as fxModule } from "../fx/index.js";
import { hashString, mulberry32 } from "../prng.js";
import { PAPER, STROKE, toneDefs, toneFill } from "../style.js";
import { n, polyPath } from "../svg.js";
import { adoptFragment, rescaleTones } from "./ids.js";

export interface SceneBook {
  cast: readonly CastMember[];
  locations: readonly LocationSpec[];
}

export interface ComposeInput {
  panel: PanelSpec;
  /** Panel index on the page (0-based), used for unique ids. */
  index: number;
  polygon: Point[];
  bbox: Box;
  book: SceneBook;
  idPrefix: string;
  /** Number of balloons/boxes that will be lettered here. */
  textLoad: number;
  /**
   * Estimated page-space area (px²) the lettering needs. The composer keeps
   * a band this big free above close-range figures. Defaults from textLoad.
   */
  textArea?: number;
  /** Reading direction: slots are mirrored for rtl pages. */
  rtl?: boolean;
}

export interface FigurePlacement {
  character: string;
  figureIndex: number;
  head: Point;
  headRadius: number;
  mouth: Point;
  body: Box;
  scale: number;
}

export interface ComposedPanel {
  /** Content to draw inside the panel clip (page space). */
  content: string;
  /** Defs to hoist into the page <defs> (clip path + module defs). */
  defs: string;
  clipId: string;
  figures: FigurePlacement[];
  focus: Point;
  /** Other things lettering should avoid covering (e.g. the insert prop). */
  obstacles: Box[];
}

export const MAX_FIGURES = 4;
export const MAX_PROPS = 4;
export const MAX_FX = 3;

const SLOT_X: Record<Slot, number> = {
  left: 0.2,
  center_left: 0.36,
  center: 0.5,
  center_right: 0.64,
  right: 0.8,
};

const GROUND_SHOTS: readonly Shot[] = ["establishing", "wide", "full"];
const AIRBORNE_POSES = new Set(["fly", "jump", "fall", "perch", "lie"]);

function depthOf(f: { depth?: Depth }): Depth {
  return f.depth ?? "mid";
}

function slotX(slot: Slot, box: Box, rtl: boolean): number {
  const f = SLOT_X[slot] ?? 0.5;
  return box.x + box.w * (rtl ? 1 - f : f);
}

function ctxFor(prefix: string, seed: number): DrawContext {
  return { idPrefix: prefix, rand: mulberry32(seed) };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function angleScale(angle: Angle, shot: Shot): number {
  if (!GROUND_SHOTS.includes(shot)) return angle === "worms_eye" ? 1.06 : angle === "low" ? 1.03 : 1;
  switch (angle) {
    case "high":
      return 0.9;
    case "birds_eye":
      return 0.78;
    case "low":
      return 1.05;
    case "worms_eye":
      return 1.1;
    default:
      return 1;
  }
}

interface Framing {
  scale: number;
  originX: number;
  originY: number;
}

interface FigureInfo {
  spec: FigureSpec;
  index: number;
  cast: CastMember;
  seed: number;
  probe: FigureAnchors;
}

/**
 * Fraction of the panel height kept clear above close-range figures for
 * lettering: the band needed to hold the estimated balloon area side by side.
 */
function headroomFor(textLoad: number, textArea: number | undefined, box: Box): number {
  if (textLoad <= 0) return 0.08;
  const area = textArea ?? textLoad * 14000;
  const band = area / (box.w * 0.82) + 22;
  return clamp(band / box.h, 0.16, 0.48);
}

/**
 * Vertical placement for a width-bound close-range frame (a tall or narrow
 * panel): keep the lettering band above the head and split the spare height,
 * a little more below; never lift the feet (figure y=0) above the bottom edge.
 */
function bandPlacement(box: Box, headroom: number, visible: number, headTopUnits: number, scale: number): number {
  const band = headroom * box.h;
  const spare = Math.max(0, box.h - visible - band);
  const headTop = box.y + band + spare * 0.4;
  return Math.max(headTop - headTopUnits * scale, box.y + box.h);
}

/**
 * Own framing of a figure for close-range shots (medium / close / extreme
 * close). Frames are built around the HEAD anchor, not the drawing's top, so
 * raised arms, leaves or a bowing pose never push the face out of frame:
 * - medium: from just above the head down to the waist (waist on the bottom edge);
 * - close: from just above the head to below the shoulders;
 * - extreme close: the head circle fills the panel.
 */
function closeFraming(shot: Shot, a: FigureAnchors, box: Box, headroom: number, textLoad: number, x: number, count = 1): Framing {
  // faces share the panel width when several characters are framed together
  const n = Math.max(1, count);
  const r = Math.max(0.5, a.headRadius);
  const bodyW = Math.max(1, a.right - a.left);
  const headTopUnits = a.head.y - r * 1.15;
  if (shot === "medium") {
    const bottom = Math.max(a.waist, a.head.y + r * 2.6);
    const span = Math.max(1, bottom - headTopUnits);
    const heightScale = ((1 - headroom) * box.h) / span;
    // sides may crop in a medium shot, so the body-width limit is loose
    const scale = Math.min(heightScale, (Math.min(0.44, 0.85 / n) * box.w) / (2 * r), (1.4 * box.w) / bodyW);
    if (scale >= heightScale * 0.999) return { scale, originX: x, originY: box.y + box.h - bottom * scale };
    return { scale, originX: x, originY: bandPlacement(box, headroom, span * scale, headTopUnits, scale) };
  }
  if (shot === "close") {
    const bottom = Math.max(a.shoulders, a.head.y + r * 1.4);
    const span = Math.max(1, bottom - headTopUnits);
    const heightScale = ((0.88 - headroom) * box.h) / span;
    const scale = Math.min(heightScale, (Math.min(0.6, 0.88 / n) * box.w) / (2 * r));
    if (scale >= heightScale * 0.999) {
      // height-bound: shoulders near the bottom edge, lettering band above
      return { scale, originX: x, originY: box.y + box.h * 0.9 - bottom * scale };
    }
    return { scale, originX: x, originY: bandPlacement(box, headroom, span * scale * 1.35, headTopUnits, scale) };
  }
  // extreme close: the face fills the panel; leave a corner for lettering when needed
  const fill = textLoad > 0 ? 0.72 : 0.98;
  const scale = (fill * Math.min(box.h, (box.w * (textLoad > 0 ? 0.95 : 1.1)) / Math.sqrt(n))) / (2 * r);
  const headY = box.y + box.h * (textLoad > 0 ? 0.6 : 0.52);
  return { scale, originX: x, originY: headY - a.head.y * scale };
}

export function composePanel(input: ComposeInput): ComposedPanel {
  const { panel, bbox: box, polygon, idPrefix, book, index } = input;
  const rtl = input.rtl === true;
  const clipId = `${idPrefix}clip-${index}`;
  const defs: string[] = [`<clipPath id="${clipId}"><path d="${polyPath(polygon)}"/></clipPath>`];
  const scope = (s: string) => `p${index}${s}`;
  const tones = toneDefs(idPrefix);
  /** Adopt a fragment that will be drawn inside a scale(s) group. */
  const adoptScaled = (svg: string, tag: string, scale: number) => {
    const f = adoptFragment(svg, idPrefix, scope(tag));
    const t = rescaleTones(f.body, idPrefix, scope(tag), scale, tones);
    return { body: t.body, defs: f.defs + t.defs };
  };
  const location = book.locations.find((l) => l.id === panel.location);
  const shot: Shot = panel.shot;
  const angle: Angle = panel.angle;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const textLoad = input.textLoad;
  const headroom = headroomFor(textLoad, input.textArea, box);

  // Dutch angle: rotate the whole scene; draw the environment over a larger box.
  const dutch = angle === "dutch";
  const dutchDeg = dutch ? ((hashString(`${panel.id}|dutch`) & 1) === 0 ? -8 : 8) : 0;
  const envBox: Box = dutch
    ? { x: box.x - box.w * 0.18, y: box.y - box.h * 0.18, w: box.w * 1.36, h: box.h * 1.36 }
    : box;

  // --- environment ---------------------------------------------------------
  const env = environments.draw(
    {
      environment: location?.environment ?? "void",
      features: location?.features ?? [],
      box: envBox,
      shot,
      angle,
      time: panel.time ?? "day",
      weather: panel.weather ?? "clear",
      lineWidth: STROKE.environment,
      seed: hashString(`loc:${location?.id ?? panel.location}`),
    },
    ctxFor(idPrefix, hashString(`loc:${location?.id ?? panel.location}|${panel.id}`)),
  );
  const envFrag = adoptFragment(env.svg, idPrefix, scope("env"));
  defs.push(envFrag.defs);
  const horizonY = Number.isFinite(env.horizonY) ? env.horizonY : box.y + box.h * 0.55;
  const groundY = Number.isFinite(env.groundY) ? env.groundY : box.y + box.h * 0.9;

  // --- figures: probe anchors -----------------------------------------------
  const figureSpecs = shot === "insert" ? [] : panel.figures.slice(0, MAX_FIGURES);
  const infos: FigureInfo[] = [];
  figureSpecs.forEach((spec, i) => {
    const cast = book.cast.find((c) => c.id === spec.character);
    if (!cast) return;
    const seed = hashString(`cast:${cast.id}`);
    const probe = safeDraw(cast, spec, 1, seed, idPrefix);
    if (!probe) return;
    infos.push({ spec, index: i, cast, seed, probe: probe.anchors });
  });

  // --- framing -----------------------------------------------------------
  const aScale = angleScale(angle, shot);
  const framings = new Map<number, Framing>();
  if (infos.length > 0) {
    if (GROUND_SHOTS.includes(shot)) {
      const frac = shot === "full" ? 0.74 : shot === "wide" ? 0.4 : 0.22;
      const refH = Math.max(...infos.map((f) => Math.max(1, -f.probe.top)));
      let world = ((frac * box.h) / refH) * aScale;
      const midFeet =
        shot === "full"
          ? clamp(groundY, box.y + box.h * 0.84, box.y + box.h * 0.96)
          : shot === "wide"
            ? clamp(groundY, box.y + box.h * 0.66, box.y + box.h * 0.94)
            : clamp(groundY, box.y + box.h * 0.7, box.y + box.h * 0.95);
      // keep the tallest head below the lettering band in full shots
      if (shot === "full") world = Math.min(world, (midFeet - (box.y + box.h * headroom)) / refH);
      const horizon = clamp(horizonY, box.y + box.h * 0.15, midFeet - box.h * 0.06);
      for (const f of infos) {
        const d = depthOf(f.spec);
        const mul = d === "fore" ? 1.2 : d === "back" ? 0.62 : 1;
        let scale = world * mul;
        const widthUnits = Math.max(1, f.probe.right - f.probe.left);
        scale = Math.min(scale, (0.95 * box.w) / widthUnits);
        const feet =
          d === "fore"
            ? Math.min(midFeet + box.h * 0.07, box.y + box.h * 1.02)
            : d === "back"
              ? horizon + (midFeet - horizon) * 0.4
              : midFeet;
        framings.set(f.index, { scale, originX: slotX(f.spec.slot, box, rtl), originY: feet });
      }
    } else {
      // One world scale for the panel: the figure that needs the smallest
      // scale to fit its own framing sets it (a bird beside a prince stays
      // bird-sized); smaller characters keep the reference figure's eye line.
      const own = infos.map((f) => closeFraming(shot, f.probe, box, headroom, textLoad, slotX(f.spec.slot, box, rtl), infos.length));
      let ref = 0;
      own.forEach((o, i) => {
        if (o.scale < own[ref].scale) ref = i;
      });
      const refFrame = own[ref];
      const refHeadY = refFrame.originY + infos[ref].probe.head.y * refFrame.scale;
      infos.forEach((f, i) => {
        const d = depthOf(f.spec);
        const mul = d === "fore" ? 1.08 : d === "back" ? 0.78 : 1;
        const x = slotX(f.spec.slot, box, rtl);
        const fr: Framing =
          own[i].scale <= refFrame.scale * 1.0001
            ? own[i]
            : { scale: refFrame.scale, originX: x, originY: refHeadY - f.probe.head.y * refFrame.scale };
        const scale = fr.scale * mul * aScale;
        const headY = fr.originY + f.probe.head.y * fr.scale;
        const originY = headY - f.probe.head.y * scale;
        // In close-range shots the slot places the FACE (a bow or a lean can
        // throw the head far from the feet); keep most of the head inside.
        const hr = f.probe.headRadius * scale;
        const mirror = (f.spec.facing === "left") !== rtl; // rtl pages mirror facings with the slots
        const headOffset = (mirror ? -f.probe.head.x : f.probe.head.x) * scale;
        const headX = clamp(x, box.x + hr * 0.55, box.x + box.w - hr * 0.55);
        framings.set(f.index, { scale, originX: headX - headOffset, originY });
      });
    }
  }

  // --- draw figures + props by depth ----------------------------------------
  const figures: FigurePlacement[] = [];
  const layers: Record<Depth, string[]> = { back: [], mid: [], fore: [] };
  const groundShot = GROUND_SHOTS.includes(shot);
  let worldScale = 0;
  for (const f of infos) {
    const fr = framings.get(f.index);
    if (!fr) continue;
    if (depthOf(f.spec) === "mid" || worldScale === 0) worldScale = worldScale || fr.scale;
    const lw = STROKE.figureOutline / fr.scale;
    const drawing = safeDraw(f.cast, f.spec, lw, f.seed, idPrefix);
    if (!drawing) continue;
    const mirror = (f.spec.facing === "left") !== rtl; // rtl pages mirror facings with the slots
    const frag = adoptScaled(drawing.svg, `f${f.index}`, fr.scale);
    defs.push(frag.defs);
    let held = "";
    if (f.spec.holding) {
      const prop = safeProp(f.spec.holding, lw, hashString(`${panel.id}|held|${f.index}`), idPrefix);
      if (prop) {
        const a = drawing.anchors;
        const hand = a.hand ?? { x: a.right * 0.8, y: a.waist };
        const pf = adoptScaled(prop.svg, `h${f.index}`, fr.scale);
        defs.push(pf.defs);
        held = `<g transform="translate(${n(hand.x - prop.grip.x)} ${n(hand.y - prop.grip.y)})">${pf.body}</g>`;
      }
    }
    const sx = mirror ? -fr.scale : fr.scale;
    const shadow =
      groundShot && !AIRBORNE_POSES.has(f.spec.pose)
        ? castShadow(fr, drawing.anchors, idPrefix)
        : "";
    const transform = `translate(${n(fr.originX)} ${n(fr.originY)}) scale(${n4(sx)} ${n4(fr.scale)})`;
    layers[depthOf(f.spec)].push(`${shadow}<g transform="${transform}">${frag.body}${held}</g>`);
    const a = drawing.anchors;
    const toPage = (p: Point): Point => ({ x: fr.originX + (mirror ? -p.x : p.x) * fr.scale, y: fr.originY + p.y * fr.scale });
    const left = fr.originX + (mirror ? -a.right : a.left) * fr.scale;
    const right = fr.originX + (mirror ? -a.left : a.right) * fr.scale;
    figures.push({
      character: f.cast.id,
      figureIndex: f.index,
      head: toPage(a.head),
      headRadius: a.headRadius * fr.scale,
      mouth: toPage(a.mouth),
      body: { x: left, y: fr.originY + a.top * fr.scale, w: right - left, h: -a.top * fr.scale },
      scale: fr.scale,
    });
  }
  if (worldScale === 0) {
    // no figures: scale of a nominal adult for this shot
    const frac = shot === "full" ? 0.74 : shot === "wide" ? 0.4 : shot === "establishing" ? 0.22 : shot === "medium" ? 1.6 : 3;
    worldScale = (frac * box.h) / 100;
  }

  let focus: Point = figures[0]?.head ?? { x: cx, y: cy };
  let insertSvg = "";
  const obstacles: Box[] = [];
  if (shot === "insert") {
    const propId: PropId | undefined = panel.props[0]?.prop ?? panel.figures.find((f) => f.holding)?.holding;
    if (propId) {
      const probe = safeProp(propId, 1, 1, idPrefix);
      if (probe) {
        const avail = box.h * (1 - (textLoad > 0 ? headroom : 0.1));
        const scale = Math.min((0.8 * avail) / Math.max(1, probe.height), (0.64 * box.w) / Math.max(1, probe.width));
        const drawn = safeProp(propId, STROKE.figureOutline / scale, hashString(`${panel.id}|insert`), idPrefix);
        if (drawn) {
          const pf = adoptScaled(drawn.svg, "ins", scale);
          defs.push(pf.defs);
          const ox = cx;
          const oy = box.y + box.h - avail / 2 + (probe.height * scale) / 2;
          insertSvg = `<g transform="translate(${n(ox)} ${n(oy)}) scale(${n4(scale)})">${pf.body}</g>`;
          focus = { x: ox, y: oy - (probe.height * scale) / 2 };
          const pw = probe.width * scale;
          const ph = probe.height * scale;
          obstacles.push({ x: ox - pw / 2, y: oy - ph, w: pw, h: ph });
        }
      }
    }
  } else {
    panel.props.slice(0, MAX_PROPS).forEach((p, i) => {
      const d = depthOf(p);
      const nominal = safeNominal(p.prop);
      let scale = worldScale * (d === "fore" ? 1.2 : d === "back" ? 0.62 : 1);
      let base: number;
      if (groundShot) {
        const midFeet = clamp(groundY, box.y + box.h * 0.66, box.y + box.h * 0.96);
        const horizon = clamp(horizonY, box.y + box.h * 0.15, midFeet - box.h * 0.06);
        base = d === "fore" ? Math.min(midFeet + box.h * 0.07, box.y + box.h) : d === "back" ? horizon + (midFeet - horizon) * 0.4 : midFeet;
      } else {
        scale = Math.min(scale, (0.36 * box.h) / Math.max(1, nominal));
        base = box.y + box.h * 0.995;
      }
      const drawn = safeProp(p.prop, STROKE.figureOutline / scale, hashString(`${panel.id}|prop|${i}`), idPrefix);
      if (!drawn) return;
      const pf = adoptScaled(drawn.svg, `pr${i}`, scale);
      defs.push(pf.defs);
      layers[d].unshift(`<g transform="translate(${n(slotX(p.slot, box, rtl))} ${n(base)}) scale(${n4(scale)})">${pf.body}</g>`);
    });
  }

  // --- fx -----------------------------------------------------------------
  const heads = figures.map((f) => ({ point: f.head, radius: f.headRadius }));
  const under: string[] = [];
  const over: string[] = [];
  panel.fx.slice(0, MAX_FX).forEach((id, i) => {
    try {
      const out = fxModule.draw(
        {
          fx: id,
          box,
          polygon,
          focus,
          heads,
          lineWidth: STROKE.fx,
          seed: hashString(`${panel.id}|fx|${id}|${i}`),
        },
        ctxFor(idPrefix, hashString(`${panel.id}|fxctx|${id}|${i}`)),
      );
      const u = adoptFragment(out.under, idPrefix, scope(`fu${i}`));
      const o = adoptFragment(out.over, idPrefix, scope(`fo${i}`));
      defs.push(u.defs, o.defs);
      under.push(u.body);
      over.push(o.body);
    } catch {
      // a failing fx never takes the page down; validation reports vocab errors
    }
  });

  let scene = [
    `<path d="${polyPath(polygon)}" fill="${PAPER}"/>`,
    envFrag.body,
    under.join(""),
    layers.back.join(""),
    layers.mid.join(""),
    layers.fore.join(""),
    insertSvg,
  ].join("");
  let overSvg = over.join("");
  let placedFigures = figures;
  if (dutch) {
    const rot = `rotate(${dutchDeg} ${n(cx)} ${n(cy)})`;
    scene = `<path d="${polyPath(polygon)}" fill="${PAPER}"/><g transform="${rot}">${scene}</g>`;
    overSvg = overSvg ? `<g transform="${rot}">${overSvg}</g>` : "";
    const rp = (p: Point) => rotatePoint(p, { x: cx, y: cy }, dutchDeg);
    placedFigures = figures.map((f) => {
      const corners = [
        { x: f.body.x, y: f.body.y },
        { x: f.body.x + f.body.w, y: f.body.y },
        { x: f.body.x + f.body.w, y: f.body.y + f.body.h },
        { x: f.body.x, y: f.body.y + f.body.h },
      ].map(rp);
      const xs = corners.map((c) => c.x);
      const ys = corners.map((c) => c.y);
      return {
        ...f,
        head: rp(f.head),
        mouth: rp(f.mouth),
        body: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) },
      };
    });
    focus = rp(focus);
  }
  return {
    content: scene + overSvg,
    defs: defs.join(""),
    clipId,
    figures: placedFigures,
    focus,
    obstacles,
  };
}

function n4(v: number): string {
  if (!Number.isFinite(v)) throw new Error(`non-finite scale ${v}`);
  const r = Math.round(v * 10000) / 10000;
  return Object.is(r, -0) ? "0" : String(r);
}

function rotatePoint(p: Point, c: Point, deg: number): Point {
  const a = (deg * Math.PI) / 180;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * Math.cos(a) - dy * Math.sin(a), y: c.y + dx * Math.sin(a) + dy * Math.cos(a) };
}

function castShadow(fr: Framing, a: FigureAnchors, idPrefix: string): string {
  const half = Math.max(4, ((a.right - a.left) / 2) * fr.scale * 0.95);
  const ry = Math.max(2, half * 0.16);
  return `<ellipse cx="${n(fr.originX)}" cy="${n(fr.originY)}" rx="${n(half)}" ry="${n(ry)}" fill="${toneFill("dots", idPrefix)}"/>`;
}

function safeDraw(cast: CastMember, spec: FigureSpec, lineWidth: number, seed: number, idPrefix: string): FigureDrawing | undefined {
  try {
    const d = rig.draw(
      { look: cast.look, pose: spec.pose, expression: spec.expression, facing: spec.facing, lineWidth, seed },
      ctxFor(idPrefix, seed),
    );
    if (!validAnchors(d.anchors)) return undefined;
    return d;
  } catch {
    return undefined;
  }
}

function validAnchors(a: FigureAnchors): boolean {
  const nums = [a.head.x, a.head.y, a.headRadius, a.mouth.x, a.mouth.y, a.top, a.left, a.right, a.waist, a.shoulders];
  if (a.hand) nums.push(a.hand.x, a.hand.y);
  return nums.every((v) => Number.isFinite(v)) && a.headRadius > 0 && a.top < 0;
}

function safeProp(prop: PropId, lineWidth: number, seed: number, idPrefix: string): PropDrawing | undefined {
  try {
    const d = propModule.draw(prop, lineWidth, ctxFor(idPrefix, seed));
    if (![d.width, d.height, d.grip.x, d.grip.y].every((v) => Number.isFinite(v))) return undefined;
    return d;
  } catch {
    return undefined;
  }
}

function safeNominal(prop: PropId): number {
  try {
    const v = propModule.nominalHeight(prop);
    return Number.isFinite(v) && v > 0 ? v : 12;
  } catch {
    return 12;
  }
}
