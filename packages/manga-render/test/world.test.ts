import { describe, expect, it } from "vitest";
import { ANGLES, ENV_FEATURES, ENVIRONMENTS, FX, PROPS, SHOTS, TIMES, WEATHERS, type Box, type Environment, type FxId } from "../src/contracts.js";
import type { DrawContext, EnvironmentRequest, FxRequest } from "../src/internal.js";
import { environments, PATTERN_BUDGET } from "../src/env/index.js";
import { props, SEAT_KINDS, SEAT_Y } from "../src/props/index.js";
import { compactPathD, cullOutside, pathAreaIn, pathPoints } from "../src/env/compact.js";
import { seatContact } from "../src/rig/index.js";
import type { HumanLook } from "../src/contracts.js";
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
  // shared definitions (<use>) only point at prefixed ids defined in the same fragment
  const ids = new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of svg.matchAll(/href="#([^"]+)"/g)) {
    expect(m[1].startsWith(PREFIX)).toBe(true);
    expect(ids.has(m[1]), `href #${m[1]} resolves`).toBe(true);
  }
  expect(svg).not.toMatch(/xlink:href|href="(?!#)/);
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

  it("every shot x angle renders for every environment", { timeout: 60_000 }, () => {
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

  it("every feature renders indoors and outdoors", { timeout: 30_000 }, () => {
    for (const env of ["city_square", "meadow", "room_poor", "garret", "palace_hall"] as Environment[]) {
      for (const f of ENV_FEATURES) {
        const d = environments.draw(envReq(env, { features: [f] }), ctx());
        checkSvg(d.svg);
      }
      const all = environments.draw(envReq(env, { features: [...ENV_FEATURES] }), ctx());
      checkSvg(all.svg);
    }
  });

  it("every time x weather renders", { timeout: 30_000 }, () => {
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

  it("handles tall, wide and offset panels", { timeout: 30_000 }, () => {
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

  it("rasterises inside a clipped panel without crashing resvg", { timeout: 60_000 }, () => {
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
    if (layer === "both") {
      expect(a.under).not.toBe("");
      expect(a.over).not.toBe("");
    } else {
      expect(layer === "under" ? a.under : a.over).not.toBe("");
      expect(layer === "under" ? a.over : a.under).toBe("");
    }
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

// ---------------------------------------------------------------------------
// Pass 2: staging anchors, seats, prop tones, tone discipline, efficiency, fx caps
// ---------------------------------------------------------------------------

const ADULT: HumanLook = {
  kind: "human",
  age: "adult",
  build: "average",
  height: "average",
  frame: "fem",
  hair: "bun",
  hair_tone: "dark",
  facial_hair: "none",
  outfit: "dress",
  outfit_tone: "mid",
  headwear: "none",
  accessories: [],
  skin: "light",
  material: "flesh",
};

const PATTERNS = ["dots", "dense_dots", "stripes", "check", "flowers", "gold", "stone"];

/** Estimated page area covered by screentone patterns in an environment fragment. */
function patternArea(svg: string, box: Box): number {
  let area = 0;
  for (const m of svg.matchAll(/<path d="([^"]*)"([^>]*)>/g)) {
    const t = /fill="url\(#[^)]*tone-([a-z_]+)\)"/.exec(m[2]);
    if (t && PATTERNS.includes(t[1])) area += pathAreaIn(m[1], box);
  }
  return area;
}

describe("props: seats and tone variants", () => {
  it.each(SEAT_KINDS)("%s seat stands on the ground at the sitting height", (kind) => {
    const d = props.seat(kind, 1, ctx());
    checkSvg(d.svg);
    expect(d.seatY).toBe(SEAT_Y);
    expect(d.width).toBeGreaterThan(15);
    expect(d.height).toBeGreaterThanOrEqual(-d.seatY);
    expect(props.seat(kind, 1, ctx()).svg).toBe(d.svg);
  });

  it("seat height matches the human rig's sitting contact (adult) and scales for a child", () => {
    for (const facing of ["right", "front"] as const) {
      const adult = seatContact(ADULT, "sit", facing, 3);
      expect(Math.abs(adult.y - SEAT_Y)).toBeLessThan(2.5);
    }
    const child = seatContact({ ...ADULT, age: "child", height: "short" }, "sit", "right", 3);
    expect(child.y).toBeGreaterThan(SEAT_Y * 0.75);
    expect(seatContact(ADULT, "stand", "right", 3)).toEqual({ x: 0, y: 0 });
  });

  it("tone recolours a prop's main body: ruby (dark) and sapphire (mid) never match", () => {
    const plain = props.draw("gem", 0.5, ctx()).svg;
    const ruby = props.draw("gem", 0.5, ctx(), "black").svg;
    const sapphire = props.draw("gem", 0.5, ctx(), "mid").svg;
    expect(new Set([plain, ruby, sapphire]).size).toBe(3);
    expect(ruby).toMatch(/fill="#141414"/);
    expect(sapphire).toMatch(/fill="#9a9a9a"/);
    // the default is unchanged by the new parameter
    expect(props.draw("gem", 0.5, ctx(), undefined).svg).toBe(plain);
    for (const prop of ["coin", "crown", "sword", "bell", "coins_pile"] as const) {
      expect(props.draw(prop, 0.5, ctx(), "dark").svg, prop).not.toBe(props.draw(prop, 0.5, ctx()).svg);
    }
  });
});

describe("environments: staging anchors", () => {
  it("a bed publishes where a lying figure goes, in every interior shot that shows it", () => {
    for (const shot of ["wide", "full", "medium"] as const) {
      const d = environments.draw(envReq("room_poor", { shot, features: ["bed", "table", "window"] }), ctx());
      const a = d.anchors ?? {};
      expect(a.bed, shot).toBeDefined();
      expect(a.bed_head && a.bed_foot, shot).toBeTruthy();
      // head and foot lie on the mattress line, the centre between them
      expect(Math.abs(a.bed_head!.y - a.bed_foot!.y)).toBeLessThan(BOX.h * 0.05);
      expect(Math.abs(a.bed_foot!.x - a.bed_head!.x)).toBeGreaterThan(BOX.w * 0.08);
      expect(a.bed!.x).toBeGreaterThan(Math.min(a.bed_head!.x, a.bed_foot!.x));
      expect(a.bed!.x).toBeLessThan(Math.max(a.bed_head!.x, a.bed_foot!.x));
      // the mattress top is above the floor line of the panel
      expect(a.bed!.y).toBeLessThan(d.groundY + BOX.h * 0.3);
    }
    const wide = environments.draw(envReq("room_poor", { features: ["bed", "table"] }), ctx()).anchors ?? {};
    expect(wide.table).toBeDefined();
    expect(wide.stool).toBeDefined();
    // a bed or table added as a feature outdoors also publishes anchors
    const meadow = environments.draw(envReq("meadow", { features: ["bed", "table"] }), ctx()).anchors ?? {};
    expect(meadow.bed && meadow.table).toBeTruthy();
  });

  it("the city statue column is centred and tall enough to carry a statue", () => {
    for (const shot of ["establishing", "wide"] as const) {
      for (const angle of ["eye", "low"] as const) {
        const d = environments.draw(envReq("city_square", { shot, angle, features: ["statue_column", "lamp_post"] }), ctx());
        const a = d.anchors ?? {};
        expect(a.statue_top, `${shot}/${angle}`).toBeDefined();
        expect(a.statue_crown, `${shot}/${angle}`).toBeDefined();
        expect(Math.abs(a.statue_top!.x - (BOX.x + BOX.w / 2))).toBeLessThan(BOX.w * 0.05);
        // the statue it carries fits in the frame, and the column is tall
        expect(a.statue_crown!.y).toBeGreaterThanOrEqual(BOX.y);
        expect(a.statue_crown!.y).toBeLessThan(a.statue_top!.y);
        expect(d.groundY - a.statue_top!.y).toBeGreaterThan(BOX.h * 0.25);
      }
    }
  });
});

describe("environments: tone discipline and shot simplification", () => {
  it("screentone patterns stay within the shot's budget (at most ~35% of a panel)", { timeout: 120_000 }, () => {
    for (const env of ENVIRONMENTS) {
      for (const shot of ["establishing", "wide", "full", "medium"] as const) {
        for (const time of ["day", "dusk", "night"] as const) {
          const d = environments.draw(envReq(env, { shot, time, features: ["trees", "flowers", "fountain"] }), ctx());
          const frac = patternArea(d.svg, BOX) / (BOX.w * BOX.h);
          expect(frac, `${env}/${shot}/${time}`).toBeLessThanOrEqual(PATTERN_BUDGET[shot] + 0.02);
        }
      }
    }
  });

  it("close and extreme close backgrounds carry no pattern tone; extreme close has no set", { timeout: 60_000 }, () => {
    for (const env of ENVIRONMENTS) {
      for (const time of ["day", "night"] as const) {
        const close = environments.draw(envReq(env, { shot: "close", time }), ctx()).svg;
        expect(patternArea(close, BOX), `${env} close`).toBe(0);
        const xc = environments.draw(envReq(env, { shot: "extreme_close", time }), ctx()).svg;
        expect(patternArea(xc, BOX), `${env} xclose`).toBe(0);
        expect(xc.length, `${env} xclose is a plain backing`).toBeLessThan(9000);
      }
    }
  });

  it("close shots draw the set at a lighter line weight than wide shots", () => {
    const widest = (svg: string) => Math.max(...[...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1])));
    for (const env of ["city_square", "room_poor", "forest"] as Environment[]) {
      const wide = environments.draw(envReq(env, { shot: "wide" }), ctx()).svg;
      const close = environments.draw(envReq(env, { shot: "close" }), ctx()).svg;
      expect(widest(close)).toBeLessThan(widest(wide));
    }
  });

  it("the abstract backdrop is calm and varied (several compositions, never a full-panel pattern)", { timeout: 30_000 }, () => {
    const seen = new Set<string>();
    const boxes: Box[] = [BOX, { x: 40, y: 60, w: 300, h: 600 }, { x: 40, y: 60, w: 900, h: 300 }, { x: 10, y: 10, w: 420, h: 420 }, { x: 0, y: 0, w: 700, h: 500 }];
    for (const box of boxes) {
      for (const shot of ["establishing", "wide", "full", "medium"] as const) {
        const d = environments.draw(envReq("abstract", { box, shot }), ctx());
        checkSvg(d.svg);
        expect(patternArea(d.svg, box) / (box.w * box.h)).toBeLessThanOrEqual(0.37);
        // the composition, not the exact geometry
        seen.add(d.svg.replace(/-?[\d.]+/g, "#").slice(0, 400));
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });
});

describe("environments: efficiency", () => {
  it("culls geometry outside the panel and keeps a wide city panel compact", () => {
    for (const env of ["city_square", "street", "market"] as Environment[]) {
      const d = environments.draw(envReq(env, { shot: "wide" }), ctx());
      expect(cullOutside(d.svg, BOX, 30)).toBe(d.svg);
      expect(d.svg.length, env).toBeLessThan(80_000);
    }
  });

  it("repeated windows on a camera-parallel facade are shared definitions", () => {
    const d = environments.draw(envReq("city_square", { shot: "wide", angle: "eye" }), ctx());
    const uses = (d.svg.match(/<use /g) ?? []).length;
    const defsCount = (d.svg.match(/<g id="/g) ?? []).length;
    expect(uses).toBeGreaterThan(10);
    expect(defsCount).toBeLessThan(uses);
  });

  it("compacted path data keeps the geometry (within half a grid step, no drift)", () => {
    const paths = [
      "M10 20L30 40L30 50H70V10Z",
      "M1.234 5.678C1 2 3 4 5 6S7 8 9 10Q1 1 2 2T3 3A5 5 0 1 0 10 10Z M5 5l1 1 2 2z",
      `M0 0${Array.from({ length: 400 }, (_, i) => `l${(i % 7) * 0.137} ${((i * 3) % 5) * 0.113 - 0.2}`).join("")}`,
    ];
    for (const d of paths) {
      for (const dec of [1, 2]) {
        const a = pathPoints(d);
        const b = pathPoints(compactPathD(d, dec));
        expect(b.length).toBe(a.length);
        const tol = 0.5 * 10 ** -dec + 1e-9;
        a.forEach((p, i) => {
          expect(Math.abs(p.x - b[i].x)).toBeLessThanOrEqual(tol);
          expect(Math.abs(p.y - b[i].y)).toBeLessThanOrEqual(tol);
        });
      }
    }
    expect(compactPathD("not a path")).toBe("not a path");
  });
});

describe("fx: strength caps and face clearance", () => {
  const box: Box = { x: 100, y: 200, w: 420, h: 300 };
  const head = { point: { x: 230, y: 320 }, radius: 34 };
  const req = (id: FxId): FxRequest => ({ fx: id, box, polygon: [], focus: head.point, heads: [head], lineWidth: 1.1, seed: 5 });

  it("light rays and soft glow never exceed a partial paper veil", () => {
    for (const id of ["light_rays", "soft_glow"] as const) {
      const r = fx.draw(req(id), ctx());
      const ops = [...(r.under + r.over).matchAll(/stop-opacity="([\d.]+)"/g)].map((m) => Number(m[1]));
      expect(ops.length).toBeGreaterThan(0);
      for (const o of ops) expect(o, id).toBeLessThanOrEqual(0.6);
      // no full-panel dot veil
      expect(r.under + r.over).not.toMatch(/tone-dots/);
    }
  });

  it("flashback and dark mood tone the background, and flashback's overlay stays at the edges", () => {
    expect(FX_LAYER.dark_mood).toBe("under");
    expect(FX_LAYER.flashback).toBe("both");
    const fb = fx.draw(req("flashback"), ctx());
    // the part over the figures is a frame: nothing reaches the middle 70% of the panel
    for (const m of fb.over.matchAll(/ d="([^"]*)"/g)) {
      const segs = m[1].split(/(?=M)/);
      // outer rectangle + inner wavy edge: the inner edge stays near the border
      const inner = pathPoints(segs[segs.length - 1]);
      for (const p of inner) {
        const dx = Math.min(p.x - box.x, box.x + box.w - p.x);
        const dy = Math.min(p.y - box.y, box.y + box.h - p.y);
        expect(Math.min(dx, dy)).toBeLessThan(Math.min(box.w, box.h) * 0.2);
      }
    }
  });

  it("focus lines leave the subject's head and upper body clear; speed lines never cross a face", () => {
    const focus = fx.draw(req("focus_lines"), ctx()).under;
    for (const p of pathPoints(/ d="([^"]*)"/.exec(focus)![1])) expect(Math.hypot(p.x - head.point.x, p.y - head.point.y)).toBeGreaterThan(head.radius * 2);
    const speed = fx.draw(req("speed_lines"), ctx()).under;
    for (const sub of / d="([^"]*)"/.exec(speed)![1].split(/(?=M)/)) {
      const pts = pathPoints(sub);
      const [a, , b] = pts;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((head.point.x - a.x) * dx + (head.point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      expect(Math.hypot(a.x + dx * t - head.point.x, a.y + dy * t - head.point.y)).toBeGreaterThan(head.radius);
    }
  });
});
