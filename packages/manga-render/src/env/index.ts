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
import { PAPER, STROKE, toneFill } from "../style.js";
import { n } from "../svg.js";
import { seeded } from "../prng.js";
import { groundDepthAt, makeCamera } from "./camera.js";
import { LAYER, add, boxRect, compose, palette, pathEl, rectD, type Stage } from "./stage.js";
import { cloudD, drawSky, drawWeather } from "./sky.js";
import { drawFeatures, type Sites } from "./features.js";
import { scallop } from "./nature.js";
import { church, citySquare, cottage, market, mill, rooftops, street, townHall } from "./scenes-town.js";
import { abstractField, countryRoad, forest, garden, meadow, pond, riverbank, seaside, skyScene, voidScene } from "./scenes-nature.js";
import { classroom, courtroom, garret, jailCell, palaceHall, roomPoor, roomRich, study } from "./scenes-interior.js";

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

const INTERIORS: ReadonlySet<Environment> = new Set(["room_poor", "room_rich", "garret", "palace_hall", "jail_cell", "courtroom", "study", "classroom"]);

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
    lw: request.lineWidth > 0 ? request.lineWidth : STROKE.environment,
    zmid,
    rand: seeded(request.seed, request.environment, request.shot, request.angle, n(box.w), n(box.h)),
    p,
    pal: palette(request.time, request.weather, p, lod === 0, interior),
    items: [],
    anchors: {},
    seed: request.seed,
  };
}

/** Close-up finish: soften the scene and lay a tone band so faces read. */
function closeFinish(st: Stage): void {
  const b = st.box;
  let s = boxRect(st, PAPER, st.shot === "extreme_close" ? 0.62 : 0.42);
  if (st.env !== "void" && st.env !== "abstract") {
    // a soft screentone band across the top third (or bottom for night)
    const h = b.h * (st.shot === "extreme_close" ? 0.45 : 0.3);
    s += pathEl(rectD(b.x - 2, b.y - 2, b.w + 4, h), { fill: toneFill("dots", st.p), opacity: 0.55 });
    let d = "";
    for (let i = 0; i < 5; i += 1) {
      const y = b.y + h + i * 3.2;
      d += `M${n(b.x - 2)} ${n(y)}L${n(b.x + b.w * (0.25 + st.rand() * 0.7))} ${n(y)}`;
    }
    s += pathEl(d, { stroke: st.pal.ink, w: 0.6, opacity: 0.5 });
  }
  add(st, LAYER.atmos, -1, s);
}

const URBAN: ReadonlySet<Environment> = new Set(["city_square", "street", "rooftops", "market", "town_hall", "church", "cottage", "mill"]);
const WATERY: ReadonlySet<Environment> = new Set(["riverbank", "pond", "seaside"]);

/**
 * Extreme close-ups drop the set entirely: a screentone gradation field with
 * a single soft hint of the place (a wall corner, window fragments, a foliage
 * band, ripples, a cloud), the way manga backs a face in tight framing.
 */
function extremeField(st: Stage): void {
  const b = st.box;
  const t = (x: Parameters<typeof toneFill>[0]) => toneFill(x, st.p);
  const night = st.pal.night;
  let s = boxRect(st, night ? t("dark") : PAPER);
  // gradation: dense band, lighter band, then thinning hatch lines
  const h = b.h;
  s += pathEl(rectD(b.x - 2, b.y - 2, b.w + 4, h * 0.2 + 2), { fill: night ? t("black") : t("dense_dots") });
  s += pathEl(rectD(b.x - 2, b.y + h * 0.2, b.w + 4, h * 0.2), { fill: night ? t("dense_dots") : t("dots") });
  let hatch = "";
  for (let i = 0; i < 7; i += 1) {
    const y = b.y + h * 0.4 + i * (2.4 + i * 0.9);
    const x1 = b.x + b.w * (0.35 + st.rand() * 0.6);
    hatch += `M${n(b.x - 2)} ${n(y)}L${n(x1)} ${n(y)}`;
  }
  s += pathEl(hatch, { stroke: night ? PAPER : st.pal.ink, w: 0.8, opacity: 0.7 });
  // a soft hint of the place
  const soft = { stroke: night ? "#bdbdbd" : "#8c8c8c", w: st.lw * 0.7 };
  if (INTERIORS.has(st.env)) {
    const x = b.x + b.w * (st.rand() < 0.5 ? 0.16 : 0.84);
    s += pathEl(`M${n(x)} ${n(b.y + h * 0.4)}V${n(b.y + h * 0.8)}M${n(b.x - 2)} ${n(b.y + h * 0.8)}H${n(b.x + b.w + 2)}`, soft);
  } else if (URBAN.has(st.env)) {
    // one tall window cropped by the panel edge: frame, panes, muntins
    const ww = b.w * 0.2;
    const x0 = b.x + b.w * 0.86;
    const y0 = b.y + h * 0.3;
    const wh = h * 0.5;
    let panes = rectD(x0, y0, ww, wh);
    let mullions = `M${n(x0 + ww / 2)} ${n(y0)}V${n(y0 + wh)}M${n(x0)} ${n(y0 + wh * 0.45)}H${n(x0 + ww)}`;
    mullions += `M${n(x0 - ww * 0.12)} ${n(y0 + wh + 4)}H${n(x0 + ww * 1.1)}`;
    s += pathEl(panes, { fill: night ? PAPER : t("light"), stroke: soft.stroke, w: soft.w * 1.4 });
    s += pathEl(mullions, soft);
    panes = "";
  } else if (WATERY.has(st.env)) {
    let d = "";
    for (let i = 0; i < 6; i += 1) {
      const y = b.y + h * (0.66 + i * 0.05);
      const x = b.x + b.w * st.rand() * 0.7;
      d += `M${n(x)} ${n(y)}h${n(b.w * (0.12 + st.rand() * 0.2))}`;
    }
    s += pathEl(d, soft);
  } else if (st.env === "sky") {
    s += pathEl(cloudD(b.x + b.w * 0.7, b.y + h * 0.62, b.w * 0.45, h * 0.2, st.rand), { fill: night ? t("dark") : PAPER, stroke: soft.stroke, w: soft.w });
  } else if (st.env !== "void") {
    // an out-of-focus leaf mass rising from a lower corner
    const left = st.rand() < 0.5;
    const cx = left ? b.x + b.w * 0.08 : b.x + b.w * 0.92;
    s += pathEl(scallop(cx, b.y + h * 0.92, b.w * 0.26, h * 0.34, 11, st.rand), { fill: night ? t("dark") : t("light"), stroke: soft.stroke, w: soft.w });
    s += pathEl(scallop(cx + (left ? 1 : -1) * b.w * 0.2, b.y + h * 1.02, b.w * 0.16, h * 0.2, 8, st.rand), { fill: night ? t("dark") : t("light"), stroke: soft.stroke, w: soft.w });
  }
  add(st, LAYER.sky, 0, s);
}

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
      return withAnchors({ svg: compose(st), horizonY: st.cam.horizonY, groundY: Math.min(request.box.y + request.box.h * 0.985, Math.max(request.box.y + request.box.h * 0.55, gy)) }, st);
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
    const svg = compose(st);
    const groundY = Math.min(request.box.y + request.box.h * 0.985, Math.max(request.box.y + request.box.h * 0.55, groundYFor(st, request)));
    return withAnchors({ svg, horizonY: st.cam.horizonY, groundY }, st);
  },
};

function groundYFor(st: Stage, request: EnvironmentRequest): number {
  const shot = SHOT_CFG[request.shot];
  const ang = ANGLE_CFG[request.angle];
  return request.box.y + request.box.h * Math.min(0.985, Math.max(shot.ground, ang.ground ?? 0));
}

/** Extra named anchors (statue_top, clock, moon...) as a forward-compatible hint. */
function withAnchors(d: EnvironmentDrawing, st: Stage): EnvironmentDrawing & { anchors: Record<string, { x: number; y: number }> } {
  return { ...d, anchors: st.anchors };
}

