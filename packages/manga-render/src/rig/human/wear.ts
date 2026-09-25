/**
 * Headwear and head accessories in head-local space (see face.ts).
 * `back` parts go behind the head (hood/bonnet backs), `front` parts over
 * the hair.
 */
import type { HumanLook } from "../../contracts.js";
import { INK, PAPER, toneFill } from "../../style.js";
import { add, ellipsePts, rot, v, type CPt, type Pen, type V2 } from "./geom.js";
import { circle, line, shape, solid, type Ink } from "./paint.js";
import type { Palette } from "./look.js";
import type { FaceGeo } from "./face.js";

export interface WearOut {
  back: string;
  backSil: string;
  front: string;
  frontSil: string;
}

/** Height of the hair crown above the cranium (R units) for hat seating. */
export function crownLift(look: HumanLook): number {
  const vol: Record<HumanLook["hair"], number> = {
    bald: 0,
    buzz: 0.03,
    short: 0.1,
    side_part: 0.1,
    messy: 0.1,
    spiky: 0.1,
    curly: 0.1,
    long_straight: 0.08,
    long_wavy: 0.1,
    ponytail: 0.06,
    bun: 0.06,
    braids: 0.06,
    bob: 0.1,
  };
  return vol[look.hair];
}

export function drawHeadwear(pen: Pen, g: FaceGeo, look: HumanLook, pal: Palette, ink: Ink, idPrefix: string): WearOut {
  const out: WearOut = { back: "", backSil: "", front: "", frontSil: "" };
  const R = g.R;
  const view = g.view;
  const side = view === "side";
  const lift = crownLift(look);
  const P = (x: number, y: number, c = false): CPt => (c ? { x: x * R, y: y * R, c } : { x: x * R, y: y * R });
  const statue = pal.statue;
  const gold = statue ? pal.mat : toneFill("gold", idPrefix);
  const dark = statue ? pal.mat : toneFill("dark", idPrefix);
  const hatBlack = statue ? pal.mat : INK;
  const white = statue ? pal.mat : PAPER;
  const lw = ink.lw;
  const w = ink.dw;
  const front = (d: string, fill: string, sw = lw, sil = true) => {
    out.front += shape(d, fill, sw);
    if (sil) out.frontSil += d;
  };
  const backPart = (d: string, fill: string) => {
    out.back += shape(d, fill, lw);
    out.backSil += d;
  };
  const sx = side ? -0.05 : 0;
  switch (look.headwear) {
    case "none":
      break;
    case "crown": {
      const y0 = -0.64 - lift * 0.6;
      const k = side ? 0.9 : 1;
      const X = (x: number) => sx + x * k;
      const pts: CPt[] = [P(X(-0.68), y0 + 0.02, true), P(X(0), y0 + 0.09), P(X(0.68), y0 + 0.02, true)];
      const peaks = 5;
      for (let i = 0; i <= peaks * 2; i += 1) {
        const x = 0.72 - (1.44 * i) / (peaks * 2);
        const isPeak = i % 2 === 0;
        const y = isPeak ? y0 - 0.62 - (i === peaks ? 0.12 : 0) : y0 - 0.3;
        pts.push(P(X(x), y, true));
      }
      front(pen.curve(pts), gold);
      if (!ink.lite) out.front += line(pen.curve([P(X(-0.7), y0 - 0.2), P(X(0), y0 - 0.12), P(X(0.7), y0 - 0.2)], false), w);
      for (const x of [-0.36, 0, 0.36]) out.front += circle(pen.circle(P(X(x), y0 - 0.06), 0.07 * R), INK);
      for (let i = 0; i <= peaks; i += 1) {
        const x = 0.72 - (1.44 * i) / peaks;
        out.front += circle(pen.circle(P(X(x), y0 - 0.66 - (i * 2 === peaks * 2 / 2 ? 0 : 0) - (i === peaks / 2 ? 0.12 : 0)), 0.055 * R), gold, w);
      }
      break;
    }
    case "top_hat": {
      const yb = -0.56 - lift * 0.5;
      const hc = side ? -0.04 : 0;
      const crown: CPt[] = [P(hc - 0.74, yb, true), P(hc - 0.8, yb - 1.35, true), P(hc + 0.8, yb - 1.35, true), P(hc + 0.74, yb, true)];
      front(pen.curve(crown), hatBlack);
      out.front += shape(pen.curve(ellipsePts(P(hc, yb - 1.35), 0.8 * R, 0.13 * R, 0, 14)), statue ? pal.mat : "#4a4a4a", w);
      if (!statue) out.front += solid(pen.poly([P(hc - 0.745, yb - 0.14), P(hc + 0.745, yb - 0.14), P(hc + 0.755, yb - 0.3), P(hc - 0.755, yb - 0.3)]), PAPER);
      front(pen.curve(ellipsePts(P(hc, yb), 1.28 * R, 0.2 * R, side ? -4 : 0, 16)), hatBlack);
      break;
    }
    case "wide_hat": {
      const yb = -0.5 - lift * 0.5;
      const hc = side ? -0.04 : 0;
      front(pen.curve(ellipsePts(P(hc, yb), 1.9 * R, 0.34 * R, side ? -6 : 0, 18)), dark);
      front(pen.curve([P(hc - 0.84, yb + 0.04, true), P(hc - 0.78, yb - 0.62), P(hc - 0.3, yb - 0.92), P(hc + 0.3, yb - 0.92), P(hc + 0.78, yb - 0.62), P(hc + 0.84, yb + 0.04, true), P(hc, yb + 0.12)]), dark);
      out.front += shape(pen.curve([P(hc - 0.82, yb - 0.1, true), P(hc - 0.8, yb - 0.26, true), P(hc, yb - 0.2), P(hc + 0.8, yb - 0.26, true), P(hc + 0.82, yb - 0.1, true), P(hc, yb - 0.02)]), INK, w);
      break;
    }
    case "cap": {
      const top = -1.16 - lift * 0.3;
      if (side) {
        front(pen.curve([P(-1.1, -0.18), P(-1.02, -0.72), P(-0.42, top + 0.04), P(0.32, top + 0.06), P(0.86, -0.74), P(1.0, -0.28), P(0.2, -0.22)]), dark);
        front(pen.curve([P(0.36, -0.3, true), P(0.98, -0.32), P(1.46, -0.14, true), P(1.32, -0.04, true), P(0.62, -0.08)]), INK, lw * 0.9);
        out.front += circle(pen.circle(P(-0.08, top + 0.02), 0.07 * R), dark, w);
      } else if (view === "front") {
        front(pen.curve([P(-1.06, -0.1), P(-0.98, -0.64), P(-0.5, top + 0.08), P(0, top), P(0.5, top + 0.08), P(0.98, -0.64), P(1.06, -0.1), P(0, -0.24)]), dark);
        front(pen.curve([P(-0.74, -0.2, true), P(0, -0.28), P(0.74, -0.2, true), P(0.62, 0.0), P(0, 0.06), P(-0.62, 0.0)]), INK, lw * 0.9);
        out.front += circle(pen.circle(P(0, top + 0.02), 0.07 * R), dark, w);
      } else {
        front(pen.curve([P(-1.06, -0.05), P(-0.98, -0.64), P(-0.5, top + 0.08), P(0, top), P(0.5, top + 0.08), P(0.98, -0.64), P(1.06, -0.05), P(0, 0.08)]), dark);
      }
      break;
    }
    case "helmet": {
      const top = -1.22 - lift * 0.3;
      const metal = pal.metal;
      if (side) {
        front(pen.curve([P(-1.16, 0.12), P(-1.08, -0.6), P(-0.5, top + 0.06), P(0.3, top + 0.08), P(0.86, -0.7), P(1.02, -0.12), P(0.4, -0.02), P(-0.4, 0.06)]), metal);
        out.front += shape(pen.curve([P(-1.2, 0.08, true), P(-0.4, 0.0), P(1.06, -0.16, true), P(1.1, -0.02, true), P(-0.4, 0.14), P(-1.2, 0.22, true)]), statue ? pal.mat : toneFill("mid", idPrefix), w);
        front(pen.curve([P(0.7, -1.0), P(0.0, top - 0.22), P(-0.8, -0.92), P(-0.7, -0.78), P(0.0, top - 0.02), P(0.62, -0.88)]), dark, w * 1.4);
      } else {
        front(pen.curve([P(-1.14, 0.04), P(-1.06, -0.62), P(-0.55, top + 0.08), P(0, top), P(0.55, top + 0.08), P(1.06, -0.62), P(1.14, 0.04), P(0, 0.0)]), metal);
        out.front += shape(pen.curve([P(-1.2, -0.02, true), P(0, -0.08), P(1.2, -0.02, true), P(1.18, 0.12, true), P(0, 0.06), P(-1.18, 0.12, true)]), statue ? pal.mat : toneFill("mid", idPrefix), w);
        if (view === "front") out.front += shape(pen.poly([P(-0.07, 0.04), P(0.07, 0.04), P(0.055, 0.52), P(-0.055, 0.52)]), metal, w);
        front(pen.curve([P(-0.09, top + 0.04, true), P(0, top - 0.3, true), P(0.09, top + 0.04, true)]), dark, w * 1.4);
      }
      if (!statue) out.front += line(pen.curve([P(sx - 0.62, -0.5), P(sx - 0.42, -0.86), P(sx - 0.1, -1.04)], false), w * 2.2, PAPER);
      break;
    }
    case "wreath": {
      const c = P(sx, -0.5);
      const rx = 1.04 * R;
      const ry = (side ? 0.26 : 0.22) * R;
      const leaf = (at: V2, ang: number, sz: number) => {
        const tip = add(at, rot(v(0, -sz), ang));
        const l = add(at, rot(v(-sz * 0.36, -sz * 0.5), ang));
        const r = add(at, rot(v(sz * 0.36, -sz * 0.5), ang));
        return pen.curve([{ ...at, c: true }, l, { ...tip, c: true }, r]);
      };
      const start = view === "back" ? 190 : 10;
      const end = view === "back" ? 350 : 170;
      let d = "";
      for (let i = 0; i <= 12; i += 1) {
        const t = ((start + ((end - start) * i) / 12) * Math.PI) / 180;
        const p = add(c, v(Math.cos(t) * rx, Math.sin(t) * ry));
        const tangent = (Math.atan2(Math.cos(t) * ry, -Math.sin(t) * rx) * 180) / Math.PI;
        d += leaf(p, tangent + (i % 2 === 0 ? 40 : 140), 0.3 * R);
      }
      out.front += shape(d, statue ? pal.mat : toneFill("light", idPrefix), w * 1.1);
      out.frontSil += d;
      break;
    }
    case "bonnet": {
      if (side) {
        backPart(pen.curve([P(0.72, -0.98), P(0, -1.34), P(-0.92, -1.06), P(-1.32, -0.2), P(-1.24, 0.66), P(-0.8, 1.0), P(-0.36, 0.9)]), white);
        front(pen.curve([P(0.98, -0.72, true), P(0.52, -1.14), P(-0.22, -1.16), P(-0.66, -0.62), P(-0.66, 0.32, true), P(-0.44, 0.3, true), P(-0.44, -0.5), P(-0.14, -0.94), P(0.5, -0.94), P(0.84, -0.6, true)]), white);
        out.front += line(pen.curve([P(-0.5, 0.36), P(-0.2, 1.1), P(0.28, 1.42)], false), w * 1.6);
        out.front += bow(pen, P(0.34, 1.5), R, white, w);
      } else if (view === "front") {
        backPart(pen.curve([P(-1.24, 0.72), P(-1.32, -0.3), P(-0.82, -1.2), P(0, -1.38), P(0.82, -1.2), P(1.32, -0.3), P(1.24, 0.72), P(0, 0.4)]), white);
        const outer: CPt[] = [P(-1.12, 0.6, true), P(-1.14, -0.3), P(-0.62, -1.08), P(0, -1.18), P(0.62, -1.08), P(1.14, -0.3), P(1.12, 0.6, true)];
        const inner: CPt[] = [P(0.92, 0.55, true), P(0.94, -0.26), P(0.5, -0.88), P(0, -0.96), P(-0.5, -0.88), P(-0.94, -0.26), P(-0.92, 0.55, true)];
        front(pen.curve([...outer, ...inner]), white);
        for (const s of [-1, 1]) out.front += line(pen.curve([P(s * 1.0, 0.6), P(s * 0.8, 1.2), P(s * 0.2, 1.46)], false), w * 1.6);
        out.front += bow(pen, P(0.12, 1.52), R, white, w);
      } else {
        front(pen.curve([P(-1.24, 0.9), P(-1.32, -0.3), P(-0.82, -1.2), P(0, -1.38), P(0.82, -1.2), P(1.32, -0.3), P(1.24, 0.9), P(0, 1.02)]), white);
        if (!ink.lite) for (const x of [-0.5, 0, 0.5]) out.front += line(pen.curve([P(x * 0.6, -1.2), P(x, -0.2), P(x * 1.1, 0.8)], false), w);
      }
      break;
    }
    case "hood": {
      const fill = pal.top;
      if (side) {
        backPart(pen.curve([P(1.02, -0.72), P(0.36, -1.28), P(-0.72, -1.2), P(-1.36, -0.3), P(-1.4, 0.8), P(-0.86, 1.56), P(0.24, 1.56), P(0.6, 1.32)]), fill);
        front(pen.curve([P(1.02, -0.78, true), P(0.3, -1.14), P(-0.5, -0.76), P(-0.66, 0.1), P(-0.5, 0.94), P(0.02, 1.4, true), P(0.2, 1.3, true), P(-0.3, 0.9), P(-0.46, 0.1), P(-0.3, -0.58), P(0.3, -0.94), P(0.9, -0.64, true)]), fill);
      } else if (view === "front") {
        backPart(pen.curve([P(-1.34, 1.4), P(-1.3, -0.4), P(-0.7, -1.26), P(0, -1.42), P(0.7, -1.26), P(1.3, -0.4), P(1.34, 1.4), P(0, 1.6)]), fill);
        const outer: CPt[] = [P(-1.02, 1.3, true), P(-1.14, 0.2), P(-0.9, -0.84), P(0, -1.2), P(0.9, -0.84), P(1.14, 0.2), P(1.02, 1.3, true)];
        const inner: CPt[] = [P(0.84, 1.24, true), P(0.96, 0.2), P(0.76, -0.7), P(0, -1.0), P(-0.76, -0.7), P(-0.96, 0.2), P(-0.84, 1.24, true)];
        front(pen.curve([...outer, ...inner]), fill);
      } else {
        front(pen.curve([P(-1.3, 1.1), P(-1.3, -0.4), P(-0.7, -1.26), P(0, -1.46), P(0.7, -1.26), P(1.3, -0.4), P(1.3, 1.1), P(0.6, 1.5), P(-0.6, 1.5)]), fill);
        if (!ink.lite) out.front += line(pen.curve([P(0, -1.4), P(0.05, -0.2), P(0, 1.3)], false), w);
      }
      break;
    }
  }
  return out;
}

function bow(pen: Pen, at: V2, R: number, fill: string, w: number): string {
  let s = "";
  for (const sg of [-1, 1]) {
    s += shape(pen.curve([at, add(at, v(sg * 0.28 * R, -0.16 * R)), add(at, v(sg * 0.3 * R, 0.12 * R))]), fill, w);
    s += line(pen.curve([at, add(at, v(sg * 0.1 * R, 0.3 * R))], false), w * 1.2);
  }
  return s + circle(pen.circle(at, 0.06 * R), fill, w);
}

export function drawGlasses(pen: Pen, g: FaceGeo, ink: Ink): string {
  if (g.view === "back") return "";
  const R = g.R;
  const sw = Math.max(ink.dw * 1.2, R * 0.04);
  const ry = Math.max(g.eyeH * 1.15, 0.2 * R);
  const rx = g.eyeW * 1.28;
  let s = "";
  if (g.view === "front") {
    for (const sg of [-1, 1]) {
      const c = v(sg * g.eyeX, g.eyeY);
      s += line(pen.curve(ellipsePts(c, rx, ry, 0, 14)).replace(/Z$/, "Z"), sw);
      s += line(pen.curve([v(sg * (g.eyeX + rx), g.eyeY - ry * 0.3), v(sg * 0.99 * R, g.eyeY - 0.08 * R)], false), sw * 0.8);
    }
    s += line(pen.curve([v(-g.eyeX + rx, g.eyeY - ry * 0.2), v(0, g.eyeY - ry * 0.45), v(g.eyeX - rx, g.eyeY - ry * 0.2)], false), sw);
  } else {
    const near = v(0.02 * R, g.eyeY);
    const far = v(0.67 * R, g.eyeY);
    s += line(pen.curve(ellipsePts(near, rx, ry, 0, 14)), sw);
    s += line(pen.curve(ellipsePts(far, rx * 0.62, ry, 0, 14)), sw);
    s += line(pen.curve([v(near.x + rx, g.eyeY - ry * 0.3), v((near.x + far.x) / 2 + 0.05 * R, g.eyeY - ry * 0.5), v(far.x - rx * 0.62, g.eyeY - ry * 0.3)], false), sw);
    s += line(pen.curve([v(near.x - rx, g.eyeY - ry * 0.25), v(-0.44 * R, g.eyeY - 0.02 * R)], false), sw * 0.8);
  }
  return s;
}

export function drawEarring(pen: Pen, g: FaceGeo, pal: Palette, ink: Ink, idPrefix: string): string {
  if (g.view === "back") return "";
  const R = g.R;
  const fill = pal.statue ? pal.mat : toneFill("gold", idPrefix);
  const at: V2[] = g.view === "front" ? [v(-1.02 * R, 0.76 * R), v(1.02 * R, 0.76 * R)] : [v(-0.44 * R, 0.8 * R)];
  let s = "";
  for (const p of at) s += shape(pen.curve(ellipsePts(add(p, v(0, 0.08 * R)), 0.06 * R, 0.09 * R, 0, 8)), fill, ink.dw);
  return s;
}
