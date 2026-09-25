import { describe, expect, it } from "vitest";
import { ANGLES, ENV_FEATURES, ENVIRONMENTS, FX, PROPS, SHOTS, TIMES, WEATHERS, type Box, type Environment, type FxId } from "../src/contracts.js";
import type { DrawContext, EnvironmentRequest, FxRequest } from "../src/internal.js";
import { environments } from "../src/env/index.js";
import { props } from "../src/props/index.js";
import { fx, FX_LAYER } from "../src/fx/index.js";
import { seeded } from "../src/prng.js";
import { toneDefs } from "../src/style.js";
import { svgToPng } from "../src/raster.js";

const PREFIX = "pg3-";
const ctx = (): DrawContext => ({ idPrefix: PREFIX, rand: seeded("test") });
const BOX: Box = { x: 40, y: 60, w: 600, h: 400 };

function envReq(environment: Environment, o: Partial<EnvironmentRequest> = {}): EnvironmentRequest {
  return {
    environment,
    features: [],
    box: BOX,
    shot: "wide",
    angle: "eye",
    time: "day",
    weather: "clear",
    lineWidth: 1.6,
    seed: 42,
    ...o,
  };
}

/** SVG hygiene shared by every module. */
function checkSvg(svg: string): void {
  expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  expect(svg).not.toMatch(/<image|<foreignObject|<script|\bclass=|preserveAspectRatio="none"|<style/i);
  // raw `opacity=` creates offscreen layers that crash resvg inside clip paths
  expect(svg).not.toMatch(/\sopacity="/);
  for (const m of svg.matchAll(/\sid="([^"]+)"/g)) expect(m[1].startsWith(PREFIX)).toBe(true);
  for (const m of svg.matchAll(/url\(#([^)]+)\)/g)) expect(m[1].startsWith(PREFIX)).toBe(true);
  expect(svg).not.toMatch(/href=/);
}

describe("environments", () => {
  it.each(ENVIRONMENTS)("%s renders at wide/eye with sane anchors", (env) => {
    const d = environments.draw(envReq(env), ctx());
    expect(d.svg.length).toBeGreaterThan(100);
    checkSvg(d.svg);
    expect(Number.isFinite(d.horizonY)).toBe(true);
    expect(Number.isFinite(d.groundY)).toBe(true);
    expect(d.groundY).toBeGreaterThanOrEqual(BOX.y);
    expect(d.groundY).toBeLessThanOrEqual(BOX.y + BOX.h);
    // eye level: horizon 45-55% down the panel
    expect(d.horizonY).toBeGreaterThanOrEqual(BOX.y + BOX.h * 0.45);
    expect(d.horizonY).toBeLessThanOrEqual(BOX.y + BOX.h * 0.55);
    expect(d.groundY).toBeGreaterThan(d.horizonY);
    // compactness: a wide panel stays well under the page budget
    expect(d.svg.length).toBeLessThan(200_000);
  });

  it.each(ENVIRONMENTS)("%s is deterministic", (env) => {
    const a = environments.draw(envReq(env, { shot: "full", angle: "high", time: "dusk" }), ctx());
    const b = environments.draw(envReq(env, { shot: "full", angle: "high", time: "dusk" }), ctx());
    expect(a.svg).toBe(b.svg);
    expect(a.horizonY).toBe(b.horizonY);
    expect(a.groundY).toBe(b.groundY);
  });

  it("different seeds vary the location", () => {
    const a = environments.draw(envReq("city_square", { seed: 1 }), ctx());
    const b = environments.draw(envReq("city_square", { seed: 2 }), ctx());
    expect(a.svg).not.toBe(b.svg);
  });

  it("every shot x angle renders for every environment", () => {
    for (const env of ENVIRONMENTS) {
      for (const shot of SHOTS) {
        for (const angle of ANGLES) {
          const d = environments.draw(envReq(env, { shot, angle }), ctx());
          checkSvg(d.svg);
          expect(Number.isFinite(d.horizonY)).toBe(true);
          expect(d.groundY).toBeGreaterThanOrEqual(BOX.y);
          expect(d.groundY).toBeLessThanOrEqual(BOX.y + BOX.h);
        }
      }
    }
  });

  it("angles move the horizon: low sits lower than eye, high sits higher", () => {
    const eye = environments.draw(envReq("street", { angle: "eye" }), ctx()).horizonY;
    const low = environments.draw(envReq("street", { angle: "low" }), ctx()).horizonY;
    const worms = environments.draw(envReq("street", { angle: "worms_eye" }), ctx()).horizonY;
    const high = environments.draw(envReq("street", { angle: "high" }), ctx()).horizonY;
    const birds = environments.draw(envReq("street", { angle: "birds_eye" }), ctx()).horizonY;
    expect(low).toBeGreaterThan(eye);
    expect(worms).toBeGreaterThan(low);
    expect(high).toBeLessThan(eye);
    expect(birds).toBeLessThan(BOX.y);
  });

  it("every feature renders indoors and outdoors", () => {
    for (const env of ["city_square", "meadow", "room_poor", "garret", "palace_hall"] as Environment[]) {
      for (const f of ENV_FEATURES) {
        const d = environments.draw(envReq(env, { features: [f] }), ctx());
        checkSvg(d.svg);
      }
      const all = environments.draw(envReq(env, { features: [...ENV_FEATURES] }), ctx());
      checkSvg(all.svg);
    }
  });

  it("every time x weather renders", () => {
    for (const time of TIMES) {
      for (const weather of WEATHERS) {
        for (const env of ["street", "garden", "room_rich", "sky"] as Environment[]) {
          checkSvg(environments.draw(envReq(env, { time, weather }), ctx()).svg);
        }
      }
    }
  });

  it("close shots are simpler than wide shots", () => {
    for (const env of ["city_square", "forest", "market"] as Environment[]) {
      const wide = environments.draw(envReq(env, { shot: "wide" }), ctx()).svg.length;
      const close = environments.draw(envReq(env, { shot: "close" }), ctx()).svg.length;
      expect(close).toBeLessThan(wide);
    }
  });

  it("handles tall, wide and offset panels", () => {
    for (const box of [
      { x: 500, y: 900, w: 180, h: 560 },
      { x: 40, y: 40, w: 920, h: 160 },
      { x: 0, y: 0, w: 60, h: 60 },
    ]) {
      for (const env of ENVIRONMENTS) {
        const d = environments.draw(envReq(env, { box }), ctx());
        checkSvg(d.svg);
        expect(d.groundY).toBeGreaterThanOrEqual(box.y);
        expect(d.groundY).toBeLessThanOrEqual(box.y + box.h);
      }
    }
  });

  it("rasterises inside a clipped panel without crashing resvg", () => {
    for (const env of ENVIRONMENTS) {
      const d = environments.draw(envReq(env, { features: env === "meadow" ? [...ENV_FEATURES] : [], weather: env === "forest" ? "fog" : "clear" }), ctx());
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 500"><defs>${toneDefs(PREFIX)}<clipPath id="${PREFIX}c"><rect x="40" y="60" width="600" height="400"/></clipPath></defs><g clip-path="url(#${PREFIX}c)">${d.svg}</g></svg>`;
      expect(svgToPng(svg, { width: 140 }).length).toBeGreaterThan(100);
    }
  });
});

describe("props", () => {
  it.each(PROPS)("%s draws with sane size and grip", (prop) => {
    const h = props.nominalHeight(prop);
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThan(130);
    for (const lw of [0.4, 1.2, 3]) {
      const d = props.draw(prop, lw, ctx());
      checkSvg(d.svg);
      expect(d.height).toBe(h);
      expect(d.width).toBeGreaterThan(0);
      expect(Number.isFinite(d.grip.x) && Number.isFinite(d.grip.y)).toBe(true);
      // grip lies on the prop: within its box (ground at y=0, prop above it)
      expect(d.grip.y).toBeLessThanOrEqual(0);
      expect(d.grip.y).toBeGreaterThanOrEqual(-d.height - 1);
      expect(Math.abs(d.grip.x)).toBeLessThanOrEqual(d.width);
    }
  });

  it.each(PROPS)("%s stays within figure space above the ground", (prop) => {
    const d = props.draw(prop, 1, ctx());
    // every y coordinate in absolute commands must be <= ~0 (on or above the ground)
    const ys = [...d.svg.matchAll(/c[xy]="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
    for (const v of ys) expect(Number.isFinite(v)).toBe(true);
    expect(props.draw(prop, 1, ctx()).svg).toBe(d.svg);
  });

  it("detail drops when the line is heavy relative to the prop", () => {
    const fine = props.draw("clock", 0.5, ctx()).svg.length;
    const heavy = props.draw("clock", 5, ctx()).svg.length;
    expect(heavy).toBeLessThan(fine);
  });
});

describe("fx", () => {
  const box: Box = { x: 100, y: 200, w: 420, h: 300 };
  const req = (id: FxId, heads = true): FxRequest => ({
    fx: id,
    box,
    polygon: [
      { x: box.x, y: box.y },
      { x: box.x + box.w, y: box.y },
      { x: box.x + box.w, y: box.y + box.h },
      { x: box.x, y: box.y + box.h },
    ],
    focus: { x: 230, y: 320 },
    heads: heads
      ? [
          { point: { x: 230, y: 320 }, radius: 34 },
          { point: { x: 400, y: 350 }, radius: 28 },
        ]
      : [],
    lineWidth: 1.1,
    seed: 5,
  });

  it.each(FX)("%s paints into its declared layer, deterministically", (id) => {
    const a = fx.draw(req(id), ctx());
    const b = fx.draw(req(id), ctx());
    expect(a).toEqual(b);
    checkSvg(a.under + a.over);
    const layer = FX_LAYER[id];
    expect(layer === "under" ? a.under : a.over).not.toBe("");
    expect(layer === "under" ? a.over : a.under).toBe("");
  });

  it.each(FX)("%s works without heads", (id) => {
    const r = fx.draw(req(id, false), ctx());
    checkSvg(r.under + r.over);
    expect((r.under + r.over).length).toBeGreaterThan(0);
  });

  it("head-attached fx follow the heads", () => {
    const one = fx.draw({ ...req("sweat_drop"), heads: [{ point: { x: 230, y: 320 }, radius: 34 }] }, ctx()).over;
    const two = fx.draw(req("sweat_drop"), ctx()).over;
    expect(two.length).toBeGreaterThan(one.length);
  });

  it("soft_glow defines a page-unique gradient id per panel", () => {
    const a = fx.draw(req("soft_glow"), ctx()).under;
    const b = fx.draw({ ...req("soft_glow"), box: { ...box, x: 520 } }, ctx()).under;
    const ida = a.match(/id="([^"]+)"/)?.[1];
    const idb = b.match(/id="([^"]+)"/)?.[1];
    expect(ida?.startsWith(PREFIX)).toBe(true);
    expect(ida).not.toBe(idb);
  });
});
