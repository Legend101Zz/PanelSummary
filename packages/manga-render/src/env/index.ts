/**
 * Environment module: procedural manga backgrounds in page space.
 *
 * A pinhole camera (see camera.ts) is set up from the shot and angle; each
 * environment builds its scene in world metres, features are placed on a
 * scene-provided site plan, and a painter's list composes the result. Close
 * shots reuse the same scene through a telephoto lens at low detail with
 * softened ink, so close-ups keep the location's identity without clutter.
 */
import type { Environment, EnvFeature, Shot } from "../contracts.js";
import type { DrawContext, EnvironmentDrawing, EnvironmentModule, EnvironmentRequest } from "../internal.js";
import { INK, PAPER, STROKE, toneFill } from "../style.js";
import { n } from "../svg.js";
import { hashString, seeded } from "../prng.js";
import { groundDepthAt, makeCamera } from "./camera.js";
import { LAYER, add, boxRect, compose, palette, pathEl, type Stage } from "./stage.js";
import { compactSvg, cullOutside } from "./compact.js";
import { drawSky, drawWeather } from "./sky.js";
import { drawFeatures, type Sites } from "./features.js";
import { church, citySquare, cottage, market, mill, rooftops, street, townHall } from "./scenes-town.js";
import { abstractField, countryRoad, ditch, moor, forest, garden, meadow, pond, riverbank, seaside, skyScene, voidScene } from "./scenes-nature.js";
import { dustheap, paradise } from "./scenes-story.js";
import { classroom, courtroom, forge, foundry, garret, jailCell, palaceHall, roomPoor, roomRich, study } from "./scenes-interior.js";

interface ShotCfg {
  fov: number;
  lod: number;
  ground: number;
  camH: number;
}

const SHOT_CFG: Record<Shot, ShotCfg> = {
  establishing: { fov: 80, lod: 3, ground: 0.9, camH: 6 },
  wide: { fov: 70, lod: 3, ground: 0.88, camH: 2.4 },
  full: { fov: 60, lod: 2, ground: 0.93, camH: 1.45 },
  medium: { fov: 50, lod: 1, ground: 0.97, camH: 1.5 },
  close: { fov: 38, lod: 0, ground: 0.97, camH: 1.6 },
  extreme_close: { fov: 28, lod: 0, ground: 0.98, camH: 1.6 },
  insert: { fov: 40, lod: 0, ground: 0.92, camH: 1.2 },
};

interface AngleCfg {
  theta: number;
  /** Horizon as a fraction of box height (null: optical axis at centre). */
  horizon: number | null;
  hMul: number;
  ground?: number;
}

const ANGLE_CFG: Record<EnvironmentRequest["angle"], AngleCfg> = {
  eye: { theta: 0, horizon: 0.5, hMul: 1 },
  dutch: { theta: 0, horizon: 0.5, hMul: 1 },
  low: { theta: 10, horizon: 0.78, hMul: 0.4, ground: 0.95 },
  worms_eye: { theta: 28, horizon: 0.95, hMul: 0.14, ground: 0.99 },
  high: { theta: -24, horizon: 0.12, hMul: 2.6, ground: 0.82 },
  birds_eye: { theta: -68, horizon: null, hMul: 6.5, ground: 0.64 },
};

const INTERIORS: ReadonlySet<Environment> = new Set(["forge", "foundry", "room_poor", "room_rich", "garret", "palace_hall", "jail_cell", "courtroom", "study", "classroom"]);

type Scene = (st: Stage) => Sites;

const SCENES: Record<Environment, Scene> = {
  city_square: citySquare,
  street,
  rooftops,
  room_poor: roomPoor,
  room_rich: roomRich,
  garret,
  palace_hall: palaceHall,
  garden,
  forest,
  meadow,
  riverbank,
  pond,
  seaside,
  sky: skyScene,
  church,
  cottage,
  mill,
  market,
  jail_cell: jailCell,
  courtroom,
  study,
  classroom,
  country_road: countryRoad,
  town_hall: townHall,
  moor,
  ditch,
  forge,
  foundry,
  dustheap,
  paradise,
  abstract: abstractField,
  void: voidScene,
};

const INTERIOR_CAM_H: Record<Shot, number> = {
  establishing: 2.1,
  wide: 1.6,
  full: 1.35,
  medium: 1.45,
  close: 1.5,
  extreme_close: 1.5,
  insert: 1.2,
};

/** Interior ceilings cap the camera height. */
const ROOM_HEIGHT: Partial<Record<Environment, number>> = {
  room_poor: 2.8,
  room_rich: 3.6,
  garret: 3.1,
  palace_hall: 9,
  jail_cell: 3,
  courtroom: 4.6,
  study: 3,
  classroom: 3.4,
  forge: 4.4,
  foundry: 4.4,
};

export function buildStage(request: EnvironmentRequest, ctx: DrawContext): Stage {
  const { box } = request;
  const shot = SHOT_CFG[request.shot];
  const ang = ANGLE_CFG[request.angle];
  const interior = INTERIORS.has(request.environment);
  let camH = shot.camH * ang.hMul;
  let fov = shot.fov;
  if (interior) {
    // rooms: a wider lens from nearer the back of the room, at standing eye height
    const roomH = ROOM_HEIGHT[request.environment] ?? 3;
    const big = request.environment === "palace_hall";
    camH = Math.min(big ? camH : INTERIOR_CAM_H[request.shot] * ang.hMul, roomH - 0.35);
    // birds-eye interiors are a dollhouse cutaway: camera above the ceiling line
    if (request.angle === "birds_eye") camH = roomH + (big ? 6 : 3.2);
    fov = Math.min(88, fov + 12);
  }
  if (request.environment === "sky") camH = Math.max(camH, 1.5);
  camH = Math.max(0.12, camH);
  const cam = makeCamera(box, fov, ang.theta, camH, ang.horizon);
  const groundFrac = Math.max(shot.ground, ang.ground ?? 0);
  const groundY = box.y + box.h * Math.min(0.985, groundFrac);
  const zSolved = groundDepthAt(cam, groundY);
  const zmid = zSolved && zSolved > 0.5 ? Math.min(zSolved, 60) : 4;
  const lod = shot.lod;
  const p = ctx.idPrefix;
  const snow = request.weather === "snow" || request.features.includes("snow_ground");
  // Background line weight by shot: close-range backgrounds recede behind the
  // figures (about half weight in close shots, one step down in medium).
  const baseLw = request.lineWidth > 0 ? request.lineWidth : STROKE.environment;
  const shotLw = request.shot === "close" || request.shot === "extreme_close" ? 0.62 : request.shot === "medium" ? 0.85 : 1;
  return {
    env: request.environment,
    features: new Set<EnvFeature>(request.features),
    cam,
    box,
    shot: request.shot,
    lod,
    soft: lod === 0,
    time: request.time,
    weather: request.weather,
    snow,
    treeScale: request.treeScale ?? 1,
    lw: baseLw * shotLw,
    zmid,
    rand: seeded(request.seed, request.environment, request.shot, request.angle, n(box.w), n(box.h)),
    p,
    pal: palette(request.time, request.weather, p, lod === 0, interior),
    items: [],
    anchors: {},
    seed: request.seed,
  };
}

/**
 * Close-up finish: a paper veil softens the (already thin, grey) set so faces
 * read against it. No screentone: close shots carry no pattern tone at all.
 */
function closeFinish(st: Stage): void {
  add(st, LAYER.atmos, -1, boxRect(st, st.pal.night ? INK : PAPER, st.pal.night ? 0.3 : 0.4));
}


/**
 * Extreme close-ups drop the set entirely (no architecture): one of a few
 * calm manga backings, chosen from the location seed and the time of day so
 * a location keeps its look — plain paper, a flat light tone with a soft edge
 * gradation, or a focus-line field that leaves the centre clear. Night uses
 * the dark versions.
 */
function extremeField(st: Stage): void {
  const b = st.box;
  const night = st.pal.night;
  const pick = hashString(`${st.seed}|${st.env}|${st.time}|xc`) % 3;
  let s = boxRect(st, night ? toneFill("dark", st.p) : PAPER);
  if (pick === 1) {
    // flat tone field with a paper core, stepping lighter toward the centre
    s = boxRect(st, night ? INK : toneFill("light", st.p));
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h * 0.48;
    for (const [k, o] of [
      [0.62, 0.35],
      [0.48, 0.6],
    ] as const) {
      const rx = b.w * k;
      const ry = b.h * k;
      s += pathEl(`M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(rx * 2)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-rx * 2)} 0Z`, { fill: night ? toneFill("dark", st.p) : PAPER, opacity: o });
    }
  } else if (pick === 2) {
    // focus-line field: thin wedges from the edges, a wide clear centre
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h * 0.48;
    const rx = b.w * 0.42;
    const ry = b.h * 0.42;
    const r = seeded(st.seed, st.env, "xc-lines");
    const count = Math.round((b.w + b.h) / 9);
    let d = "";
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + (r() - 0.5) * 0.08;
      const reach = Math.hypot(b.w, b.h);
      const ox = cx + Math.cos(a) * reach;
      const oy = cy + Math.sin(a) * reach;
      const k = 1 + r() * 0.35;
      const tx = cx + Math.cos(a) * rx * k;
      const ty = cy + Math.sin(a) * ry * k;
      const w = (0.6 + r() * 1.6) * st.lw * 1.4;
      const nx = -Math.sin(a) * w;
      const ny = Math.cos(a) * w;
      d += `M${n(ox + nx)} ${n(oy + ny)}L${n(tx)} ${n(ty)}L${n(ox - nx)} ${n(oy - ny)}Z`;
    }
    s += pathEl(d, { fill: night ? PAPER : "#6e6e6e" });
  } else {
    // plain paper with a few soft hatch strokes along one edge
    const top = hashString(`${st.seed}|edge`) % 2 === 0;
    let hatch = "";
    for (let i = 0; i < 6; i += 1) {
      const y = top ? b.y + 4 + i * (3 + i * 1.2) : b.y + b.h - 4 - i * (3 + i * 1.2);
      const x1 = b.x + b.w * (0.3 + st.rand() * 0.5);
      hatch += `M${n(b.x - 2)} ${n(y)}L${n(x1)} ${n(y)}`;
    }
    s += pathEl(hatch, { stroke: night ? "#bdbdbd" : "#8c8c8c", w: 0.8 });
  }
  add(st, LAYER.sky, 0, s);
}

/** Fraction of the panel that pattern tone may cover, by shot (craft rule: at most ~35%). */
export const PATTERN_BUDGET: Record<Shot, number> = {
  establishing: 0.35,
  wide: 0.35,
  full: 0.3,
  medium: 0.2,
  close: 0,
  extreme_close: 0,
  insert: 0.15,
};

export const environments: EnvironmentModule = {
  draw(request: EnvironmentRequest, ctx: DrawContext): EnvironmentDrawing {
    const st = buildStage(request, ctx);
    const scene = SCENES[request.environment];
    if (!scene) throw new Error(`unknown environment ${String(request.environment)}`);
    const skyLess = request.environment === "void" || request.environment === "abstract";
    if (request.shot === "extreme_close" && !skyLess) {
      extremeField(st);
      if (st.weather !== "clear") drawWeather(st);
      const gy = groundYFor(st, request);
      return withAnchors({ svg: finish(st, request), horizonY: st.cam.horizonY, groundY: Math.min(request.box.y + request.box.h * 0.985, Math.max(request.box.y + request.box.h * 0.55, gy)) }, st);
    }
    if (INTERIORS.has(request.environment)) add(st, LAYER.sky, 0, boxRect(st, st.pal.night ? toneFill("black", st.p) : PAPER));
    else if (!skyLess && request.environment !== "sky") drawSky(st);
    const sites = scene(st);
    if (!skyLess) {
      drawFeatures(st, request.features, sites);
      if (st.weather === "fog") {
        for (const f of [2.2, 4.5]) add(st, LAYER.stand, st.zmid * f, boxRect(st, PAPER, 0.38));
      }
      drawWeather(st);
      if (st.lod === 0) closeFinish(st);
    }
    const svg = finish(st, request);
    const groundY = Math.min(request.box.y + request.box.h * 0.985, Math.max(request.box.y + request.box.h * 0.55, groundYFor(st, request)));
    return withAnchors({ svg, horizonY: st.cam.horizonY, groundY }, st);
  },
};

/**
 * Serialise the stage: pattern tone limited to the shot's budget (the largest
 * patterned areas fall back to flat greys), geometry wholly outside the panel
 * culled, path data compacted (0.1-unit grid in page space).
 */
function finish(st: Stage, request: EnvironmentRequest): string {
  const svg = compose(st, PATTERN_BUDGET[request.shot] ?? 0.35);
  return compactSvg(cullOutside(svg, st.box, 24), 1);
}

function groundYFor(st: Stage, request: EnvironmentRequest): number {
  const shot = SHOT_CFG[request.shot];
  const ang = ANGLE_CFG[request.angle];
  return request.box.y + request.box.h * Math.min(0.985, Math.max(shot.ground, ang.ground ?? 0));
}

/** Extra named anchors (statue_top, clock, moon...) as a forward-compatible hint. */
function withAnchors(d: EnvironmentDrawing, st: Stage): EnvironmentDrawing & { anchors: Record<string, { x: number; y: number }> } {
  return { ...d, anchors: st.anchors };
}

