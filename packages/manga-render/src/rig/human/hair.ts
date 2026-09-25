/**
 * Hair styles and facial hair in head-local space (see face.ts). Each style
 * is a cap (crown + fringe) plus optional back mass (drawn behind the body),
 * front locks, and extras (ponytail, bun, braids), with a few strand lines
 * and a manga "angel ring" shine on dark hair.
 */
import type { HumanLook } from "../../contracts.js";
import { INK, PAPER } from "../../style.js";
import { add, D2R, ellipsePts, lerp, mul as mul2, rot, v, type CPt, type Pen, type V2 } from "./geom.js";
import { line, shape, uni, type Ink } from "./paint.js";
import type { Palette } from "./look.js";
import type { FaceGeo } from "./face.js";
import { seeded } from "../../prng.js";
import { n } from "../../svg.js";

type Style = HumanLook["hair"];

interface Spec {
  v: number;
  contour: "smooth" | "tufts" | "spikes" | "scallop" | "locks";
  /** Extra volume (R units) bulging at angle `at` (front view degrees). */
  bump?: { at: number; amt: number; width: number };
  fringe: "none" | "locks" | "swoop" | "blunt" | "part" | "spiky" | "messy" | "scallop" | "slick";
  drop: number;
  sides: "short" | "ear" | "jaw";
  back: "none" | "long" | "wavy" | "bob" | "ponytail" | "bun" | "braids";
  locks: "none" | "straight" | "wavy";
  ahoge?: boolean;
}

const SPEC: Record<Style, Spec> = {
  bald: { v: 0, contour: "smooth", fringe: "none", drop: 0, sides: "short", back: "none", locks: "none" },
  buzz: { v: 0.035, contour: "smooth", fringe: "slick", drop: 0, sides: "short", back: "none", locks: "none" },
  short: { v: 0.12, contour: "locks", fringe: "locks", drop: 0.4, sides: "short", back: "none", locks: "none" },
  side_part: { v: 0.12, contour: "smooth", fringe: "swoop", drop: 0.5, sides: "short", back: "none", locks: "none", bump: { at: 38, amt: 0.2, width: 55 } },
  messy: { v: 0.2, contour: "tufts", fringe: "messy", drop: 0.45, sides: "ear", back: "none", locks: "none", ahoge: true },
  spiky: { v: 0.26, contour: "spikes", fringe: "spiky", drop: 0.55, sides: "short", back: "none", locks: "none" },
  curly: { v: 0.32, contour: "scallop", fringe: "scallop", drop: 0.36, sides: "ear", back: "none", locks: "none" },
  long_straight: { v: 0.1, contour: "smooth", fringe: "blunt", drop: 0.4, sides: "ear", back: "long", locks: "straight" },
  long_wavy: { v: 0.16, contour: "smooth", fringe: "part", drop: 0.3, sides: "ear", back: "wavy", locks: "wavy" },
  ponytail: { v: 0.08, contour: "smooth", fringe: "locks", drop: 0.3, sides: "short", back: "ponytail", locks: "none" },
  bun: { v: 0.07, contour: "smooth", fringe: "part", drop: 0.15, sides: "short", back: "bun", locks: "none" },
  braids: { v: 0.08, contour: "smooth", fringe: "part", drop: 0.2, sides: "ear", back: "braids", locks: "none" },
  bob: { v: 0.26, contour: "smooth", fringe: "blunt", drop: 0.48, sides: "jaw", back: "bob", locks: "none" },
};

export interface HairOut {
  /** Behind the whole body (long hair, ponytail, bun, far braid). */
  back: string;
  backSil: string;
  /** Behind the head but in the head group (back view masses). */
  underCap: string;
  /** Crown cap and fringe, drawn over the face. */
  cap: string;
  capSil: string;
  /** Front locks, braids and ties (after the cap). */
  front: string;
  frontSil: string;
}

const HATS_COVER = new Set(["top_hat", "wide_hat", "cap", "hood", "helmet", "bonnet"]);

export function drawHair(pen: Pen, g: FaceGeo, look: HumanLook, pal: Palette, ink: Ink, seed: number): HairOut {
  const out: HairOut = { back: "", backSil: "", underCap: "", cap: "", capSil: "", front: "", frontSil: "" };
  const R = g.R;
  const view = g.view;
  const rand = seeded(seed, "hair", look.hair);
  const jit: number[] = [];
  for (let i = 0; i < 24; i += 1) jit.push(rand() * 2 - 1);
  const base = SPEC[look.hair];
  const covered = HATS_COVER.has(look.headwear);
  const spec: Spec = covered
    ? { ...base, v: Math.min(base.v, 0.1), contour: base.contour === "scallop" ? "scallop" : "smooth", ahoge: false }
    : base;
  const fill = pal.hair;
  const strandCol = pal.hairDark ? PAPER : INK;
  const statue = pal.statue;
  const P = (x: number, y: number, c = false): CPt => (c ? { x: x * R, y: y * R, c } : { x: x * R, y: y * R });

  if (look.hair === "bald") {
    if (look.age === "elder" && view !== "front") {
      // Horseshoe fringe of hair around the back.
      const pts =
        view === "back"
          ? [P(-0.98, 0.1), P(-0.9, 0.62), P(-0.4, 0.9), P(0.4, 0.9), P(0.9, 0.62), P(0.98, 0.1), P(0.8, 0.36), P(0, 0.62), P(-0.8, 0.36)]
          : [P(-0.8, -0.48, true), P(-0.99, -0.12), P(-1.04, 0.2), P(-0.92, 0.58), P(-0.68, 0.84, true), P(-0.64, 0.6), P(-0.8, 0.28), P(-0.84, -0.04), P(-0.74, -0.32)];
      const d = pen.curve(pts);
      out.cap = shape(d, fill, ink.lw * 0.8);
    } else if (look.age === "elder") {
      for (const s of [-1, 1]) {
        const d = pen.curve([P(s * 0.86, -0.34, true), P(s * 1.03, -0.02), P(s * 1.06, 0.3), P(s * 0.99, 0.42, true), P(s * 0.95, 0.12)]);
        out.cap += shape(d, fill, ink.lw * 0.8);
      }
    }
    if (view !== "back" || look.age !== "elder") {
      const sx = view === "side" ? 0.1 : 0.3;
      out.cap += line(pen.curve([P(sx - 0.35, -0.72), P(sx - 0.1, -0.82), P(sx + 0.12, -0.8)], false), ink.dw * 1.2, "#ffffff") ;
      out.cap += line(pen.curve([P(sx - 0.32, -0.66), P(sx - 0.1, -0.74)], false), ink.dw * 0.8);
    }
    return out;
  }

  const vv = spec.v;
  // --- outer contour ------------------------------------------------------
  const centre = view === "side" ? v(-0.06 * R, 0.02 * R) : v(0, 0);
  const [tR, tL] = view === "front" ? [104, -104] : view === "side" ? [76, -150] : [124, -124];
  const bump = spec.bump;
  const radius = (t: number): number => {
    const tt = Math.abs(t) * D2R;
    const prof = 0.5 + 0.5 * Math.cos(Math.min(Math.PI, tt * 0.9));
    let extra = 0;
    if (view === "side" && t < -60 && t > -140) extra += vv * 0.25;
    if (bump && view !== "back") {
      const at = view === "side" ? bump.at + 12 : bump.at;
      const d = (t - at) / bump.width;
      extra += bump.amt * Math.exp(-d * d * 2);
    }
    return R * (1.02 + vv * prof + extra);
  };
  const polar = (t: number, r: number): V2 => add(centre, v(Math.sin(t * D2R) * r, -Math.cos(t * D2R) * r));
  const contour: CPt[] = [];
  const steps = 14;
  if (spec.contour === "spikes") {
    const count = 7;
    for (let i = 0; i <= count * 2; i += 1) {
      const t = tR + ((tL - tR) * i) / (count * 2);
      if (i % 2 === 1) {
        const lenK = 0.26 + 0.14 * Math.sin((i / (count * 2)) * Math.PI) + jit[i] * 0.05;
        const sweep = view === "side" ? -14 : t * 0.12;
        contour.push({ ...polar(t + sweep, radius(t) + lenK * R), c: true });
      } else {
        contour.push(i === 0 || i === count * 2 ? polar(t, radius(t)) : { ...polar(t, radius(t) - 0.04 * R), c: true });
      }
    }
  } else if (spec.contour === "tufts") {
    const count = 9;
    for (let i = 0; i <= count * 2; i += 1) {
      const t = tR + ((tL - tR) * i) / (count * 2);
      if (i % 2 === 1) contour.push({ ...polar(t - 6 + jit[i] * 5, radius(t) + (0.08 + 0.08 * Math.abs(jit[i + 1])) * R), c: true });
      else contour.push(polar(t, radius(t) - 0.02 * R));
    }
  } else if (spec.contour === "locks") {
    // Soft pointed locks, swept toward the back of the head.
    const count = 6;
    for (let i = 0; i <= count * 2; i += 1) {
      const t = tR + ((tL - tR) * i) / (count * 2);
      if (i % 2 === 1) contour.push({ ...polar(t - (view === "side" ? 9 : t * 0.06), radius(t) + (0.07 + 0.03 * jit[i]) * R), c: true });
      else contour.push(polar(t, radius(t) - 0.03 * R));
    }
  } else if (spec.contour === "scallop") {
    const count = 11;
    for (let i = 0; i <= count * 2; i += 1) {
      const t = tR + ((tL - tR) * i) / (count * 2);
      contour.push(polar(t, radius(t) + (i % 2 === 1 ? 0.07 : -0.03) * R));
    }
  } else {
    for (let i = 0; i <= steps; i += 1) {
      const t = tR + ((tL - tR) * i) / steps;
      contour.push(polar(t, radius(t)));
    }
  }

  // --- fringe ---------------------------------------------------------------
  const fr = fringe(view, spec, R, jit);
  // --- lower edge: sides / nape --------------------------------------------
  let capPts: CPt[];
  if (view === "front") {
    const side = (s: number): CPt[] => {
      if (spec.sides === "jaw")
        return [P(s * 1.12, 0.5), P(s * 1.12, 1.02), { ...P(s * 0.98, 1.2), c: true }, P(s * 0.86, 1.08), P(s * 0.9, 0.6), P(s * 0.86, 0.2)];
      if (spec.sides === "ear") return [P(s * 1.06, 0.45), { ...P(s * 1.02, 0.66), c: true }, P(s * 0.9, 0.45), P(s * 0.88, 0.18)];
      return [P(s * 1.02, 0.36), { ...P(s * 0.96, 0.5), c: true }, P(s * 0.9, 0.36), P(s * 0.88, 0.16)];
    };
    capPts = [...contour, ...side(-1), ...fr, ...side(1).reverse()];
  } else if (view === "side") {
    let lower: CPt[];
    if (spec.sides === "jaw")
      lower = [P(-0.78, 0.9), P(-0.8, 1.15), { ...P(-0.5, 1.27), c: true }, P(-0.3, 1.12), P(-0.2, 0.7), P(-0.16, 0.3)];
    else if (spec.sides === "ear") lower = [P(-0.7, 0.86), P(-0.62, 0.66), P(-0.5, 0.72), { ...P(-0.3, 0.74), c: true }, P(-0.24, 0.5), P(-0.18, 0.28)];
    else lower = [P(-0.62, 0.84), P(-0.64, 0.56), P(-0.5, 0.2), P(-0.34, 0.24), { ...P(-0.27, 0.54), c: true }, P(-0.2, 0.46), P(-0.16, 0.24)];
    capPts = [...contour, ...lower, ...fr];
  } else {
    const nape: CPt[] =
      spec.sides === "jaw"
        ? [P(-1.1, 0.7), P(-1.08, 1.12), { ...P(-0.9, 1.26), c: true }, P(0, 1.22), { ...P(0.9, 1.26), c: true }, P(1.08, 1.12), P(1.1, 0.7)]
        : spec.sides === "ear"
          ? [P(-0.92, 0.7), { ...P(-0.6, 0.98), c: true }, P(-0.45, 0.88), { ...P(-0.2, 1.04), c: true }, P(0, 0.92), { ...P(0.2, 1.04), c: true }, P(0.45, 0.88), { ...P(0.6, 0.98), c: true }, P(0.92, 0.7)]
          : [P(-0.9, 0.62), P(-0.62, 0.84), { ...P(-0.3, 0.92), c: true }, P(0, 0.86), { ...P(0.3, 0.92), c: true }, P(0.62, 0.84), P(0.9, 0.62)];
    // contour runs right→left; append the nape left→right.
    capPts = [...contour, ...nape];
  }
  const longBack = view === "back" && (spec.back === "long" || spec.back === "wavy");
  const capD = longBack ? "" : pen.curve(capPts);
  out.capSil = capD;
  out.cap = longBack ? "" : shape(capD, fill, ink.lw);

  // --- strands and shine ----------------------------------------------------
  if (!ink.lite && !statue && look.hair !== "buzz") {
    const crown = view === "side" ? P(-0.35, -0.9) : view === "back" ? P(0, -0.6) : P(0.1, -1.0);
    const tips = view === "back" ? [P(-0.5, 0.75), P(0, 0.8), P(0.5, 0.75)] : fr.filter((p) => p.c).slice(0, 4);
    for (const tip of tips.slice(0, 3)) {
      const mid = lerp(crown, tip, 0.5);
      const bend = view === "side" ? v(0.1 * R, -0.05 * R) : v((tip.x - crown.x) * 0.15, -0.05 * R);
      out.cap += line(pen.curve([lerp(crown, tip, 0.2), add(mid, bend), lerp(crown, tip, 0.85)], false), ink.dw * 0.8, strandCol);
    }
  }
  if (pal.hairDark && !statue && look.hair !== "buzz" && !ink.lite) {
    // Glossy "angel ring": a row of thin white streaks across the crown.
    const r0 = radius(0);
    const t1 = view === "side" ? -62 : -46;
    const t2 = view === "side" ? 14 : 34;
    const count = view === "side" ? 8 : 9;
    let d = "";
    for (let i = 0; i < count; i += 1) {
      const t = t1 + ((t2 - t1) * (i + 0.5)) / count + jit[i + 8] * 4;
      const mid = 0.7 * r0 - 0.04 * R * (i % 2);
      const half = (0.07 + 0.04 * ((i * 7) % 3)) * R;
      const wdt = 0.02 * R;
      const dirOut = rot(v(0, -1), t);
      const side2 = rot(v(1, 0), t);
      const c0 = add(centre, add(mul2(dirOut, mid), v(0, 0)));
      const pts: CPt[] = [
        { ...add(c0, mul2(dirOut, half)), c: true },
        add(c0, mul2(side2, wdt)),
        { ...add(c0, mul2(dirOut, -half)), c: true },
        add(c0, mul2(side2, -wdt)),
      ];
      d += pen.curve(pts);
    }
    out.cap += `<path d="${d}" fill="${PAPER}"/>`;
  }
  if (spec.ahoge && view !== "back") {
    const base0 = view === "side" ? P(0.0, -1.1) : P(0.05, -1.12);
    const d = pen.curve([base0, P(base0.x / R + 0.12, -1.42), { ...P(base0.x / R + 0.34, -1.5), c: true }, P(base0.x / R + 0.14, -1.36), P(base0.x / R + 0.1, -1.1)]);
    out.cap += shape(d, fill, ink.lw * 0.8);
  }

  // --- back masses, locks and extras ------------------------------------------
  const behind = (d: string) => {
    out.back += shape(d, fill, ink.lw);
    out.backSil += d;
  };
  const inFront = (d: string, strokeW = ink.lw) => {
    out.front += shape(d, fill, strokeW);
    out.frontSil += d;
  };
  switch (spec.back) {
    case "long":
    case "wavy": {
      const wavy = spec.back === "wavy";
      const len = look.age === "child" ? 2.6 : 3.3;
      const wob = (y: number, s: number) => (wavy ? Math.sin(y * 2.4 + s) * 0.12 : 0);
      if (view === "front") {
        const pts: CPt[] = [P(-1.08, -0.2)];
        for (const y of [0.6, 1.4, 2.2]) pts.push(P(-1.14 - y * (wavy ? 0.1 : 0.03) + wob(y, 0), y));
        pts.push(P(-1.1 - (wavy ? 0.28 : 0.06), len - 0.2), ...bottomTips(-1.05 - (wavy ? 0.25 : 0.04), 1.05 + (wavy ? 0.25 : 0.04), len, wavy, R));
        pts.push(P(1.1 + (wavy ? 0.28 : 0.06), len - 0.2));
        for (const y of [2.2, 1.4, 0.6]) pts.push(P(1.14 + y * (wavy ? 0.1 : 0.03) - wob(y, 1), y));
        pts.push(P(1.08, -0.2), P(0, -1.08));
        behind(pen.curve(pts));
      } else if (view === "side") {
        const pts: CPt[] = [P(-0.3, -1.05), P(-0.95, -0.62), P(-1.2, 0.2)];
        for (const y of [1.0, 1.8, 2.5]) pts.push(P(-1.24 - y * (wavy ? 0.08 : 0.02) + wob(y, 0), y));
        pts.push(...bottomTips(-1.2 - (wavy ? 0.2 : 0), 0.1, len, wavy, R));
        pts.push(P(0.15, len - 0.5), P(0.2, 1.4), P(0.15, 0.9), P(0.3, -0.3));
        behind(pen.curve(pts));
      } else {
        // The crown contour runs right→left over the top, then down the left side.
        const crown = contour.filter((p) => p.y < 0.2 * R);
        const pts: CPt[] = [...crown];
        for (const y of [0.6, 1.4, 2.2]) pts.push(P(-1.16 - y * (wavy ? 0.1 : 0.03) + wob(y, 0), y));
        pts.push(...bottomTips(-1.1 - (wavy ? 0.28 : 0.06), 1.1 + (wavy ? 0.28 : 0.06), len, wavy, R));
        for (const y of [2.2, 1.4, 0.6]) pts.push(P(1.16 + y * (wavy ? 0.1 : 0.03) - wob(y, 1), y));
        const d = pen.curve(pts);
        out.underCap += shape(d, fill, ink.lw);
        out.frontSil += d;
        if (!ink.lite && !statue) {
          out.underCap += line(pen.curve([P(0, -0.95), P(0.02, -0.4), P(0, 0.2)], false), ink.dw * 0.8, strandCol);
          for (const x of [-0.6, -0.1, 0.45]) out.underCap += line(pen.curve([P(x * 0.5, 0.1), P(x + 0.08, 1.2), P(x - 0.02, len - 0.3)], false), ink.dw * 0.8, strandCol);
        }
      }
      if (spec.locks !== "none" && view !== "back") {
        const w = spec.locks === "wavy";
        const lockLen = look.age === "child" ? 2.0 : 2.5;
        if (view === "front") {
          for (const s of [-1, 1]) {
            const pts: CPt[] = [P(s * 0.86, 0.05), P(s * 1.1, 0.35), P(s * (1.14 + (w ? 0.06 : 0)), 1.2), P(s * (1.12 - (w ? 0.1 : 0)), 1.9), { ...P(s * 1.02, lockLen), c: true }, P(s * 0.9, 1.9), P(s * (0.9 + (w ? 0.08 : 0)), 1.2), P(s * 0.88, 0.5)];
            inFront(pen.curve(pts));
          }
        } else {
          const pts: CPt[] = [P(-0.4, 0.12), P(-0.26, 0.42), P(-0.26 + (w ? 0.07 : 0), 1.2), P(-0.3, 1.9), { ...P(-0.38, lockLen), c: true }, P(-0.52, 1.9), P(-0.6 - (w ? 0.07 : 0), 1.2), P(-0.66, 0.46)];
          inFront(pen.curve(pts));
        }
      }
      break;
    }
    case "bob": {
      if (view === "front") behind(pen.curve([P(-1.06, 0.2), P(-1.1, 1.1), P(-0.9, 1.26), P(0.9, 1.26), P(1.1, 1.1), P(1.06, 0.2)]));
      else if (view === "side") behind(pen.curve([P(-1.0, -0.3), P(-1.18, 0.5), P(-1.12, 1.12), P(-0.86, 1.28), P(-0.3, 1.24), P(0.05, 0.9), P(-0.3, 0.2)]));
      break;
    }
    case "ponytail": {
      if (view === "side") {
        const tie = P(-0.82, -0.52);
        behind(pen.curve([P(-0.7, -0.8), P(-1.3, -0.72), P(-1.62, -0.2), P(-1.62, 0.8), P(-1.45, 1.7), { ...P(-1.2, 2.4), c: true }, P(-1.26, 1.6), P(-1.2, 0.7), P(-1.02, -0.05), P(-0.8, -0.3)]));
        out.front += shape(pen.curve(ellipsePts(tie, 0.1 * R, 0.16 * R, 35, 8)), pal.accent, ink.dw * 1.2);
      } else if (view === "front") {
        behind(pen.curve([P(0.62, -0.78), P(1.25, -0.6), P(1.5, 0.0), P(1.52, 0.9), { ...P(1.32, 1.9), c: true }, P(1.2, 1.0), P(1.02, 0.1)]));
      } else {
        const d = pen.curve([P(-0.2, -0.58), P(-0.4, 0.2), P(-0.38, 1.3), P(-0.24, 2.1), { ...P(0.02, 2.6), c: true }, P(0.26, 2.1), P(0.38, 1.3), P(0.4, 0.2), P(0.2, -0.58)]);
        inFront(d);
        out.front += shape(pen.curve(ellipsePts(P(0, -0.58), 0.2 * R, 0.1 * R, 0, 8)), pal.accent, ink.dw * 1.2);
      }
      break;
    }
    case "bun": {
      if (view === "side") {
        behind(pen.curve(ellipsePts(P(-0.8, -0.74), 0.44 * R, 0.42 * R, 0, 12)));
        out.back += line(pen.curve([P(-1.0, -0.9), P(-0.8, -0.6), P(-0.62, -0.92)], false), ink.dw, strandCol);
      } else if (view === "front") {
        behind(pen.curve(ellipsePts(P(0, -1.2), 0.4 * R, 0.36 * R, 0, 12)));
      } else {
        const c = P(0, -0.42);
        inFront(pen.curve(ellipsePts(c, 0.44 * R, 0.4 * R, 0, 12)));
        out.front += line(pen.curve([P(-0.3, -0.5), P(-0.05, -0.25), P(0.22, -0.45), P(0.05, -0.62), P(-0.1, -0.45)], false), ink.dw, strandCol);
      }
      break;
    }
    case "braids": {
      const braid = (top: V2, bot: V2): string => {
        const segs = 6;
        let d = "";
        for (let i = 0; i < segs; i += 1) {
          const c = lerp(top, bot, (i + 0.5) / segs);
          const w = 0.18 * R * (1 - i * 0.04);
          d += pen.curve(ellipsePts(c, w, (0.62 * Math.hypot(bot.x - top.x, bot.y - top.y)) / segs, i % 2 === 0 ? 28 : -28, 10));
        }
        return d;
      };
      const tuft = (bot: V2): string => pen.curve([add(bot, v(-0.1 * R, 0)), add(bot, v(-0.14 * R, 0.3 * R)), { ...add(bot, v(0, 0.38 * R)), c: true }, add(bot, v(0.14 * R, 0.3 * R)), add(bot, v(0.1 * R, 0))]);
      const len = look.age === "child" ? 2.6 : 3.1;
      const pair: [V2, V2, boolean][] =
        view === "front"
          ? [
              [P(-0.94, 0.7), P(-1.02, len), true],
              [P(0.94, 0.7), P(1.02, len), true],
            ]
          : view === "side"
            ? [
                [P(0.3, 0.9), P(0.42, len - 0.3), false],
                [P(-0.34, 0.85), P(-0.3, len), true],
              ]
            : [
                [P(-0.42, 0.85), P(-0.46, len), true],
                [P(0.42, 0.85), P(0.46, len), true],
              ];
      for (const [top, bot, front] of pair) {
        const d = braid(top, bot) + tuft(bot);
        if (front) {
          out.front += uni(d, fill, ink.lw * 0.8);
          out.frontSil += d;
          out.front += shape(pen.curve(ellipsePts(bot, 0.12 * R, 0.07 * R, 0, 8)), pal.accent, ink.dw);
        } else {
          out.back += uni(d, fill, ink.lw * 0.8);
          out.backSil += d;
        }
      }
      break;
    }
    case "none":
      break;
  }
  return out;
}

function bottomTips(x0: number, x1: number, y: number, wavy: boolean, R: number): CPt[] {
  const pts: CPt[] = [];
  const count = wavy ? 5 : 6;
  for (let i = 0; i <= count; i += 1) {
    const x = x0 + ((x1 - x0) * i) / count;
    if (wavy) pts.push({ x: x * R, y: (y + (i % 2 === 0 ? 0 : 0.18)) * R });
    else pts.push(i % 2 === 1 ? { x: x * R, y: (y + 0.12) * R, c: true } : { x: x * R, y: (y - 0.02) * R });
  }
  return pts;
}

/** Fringe edge from the screen-right temple to the screen-left temple. */
function fringe(view: FaceGeo["view"], spec: Spec, R: number, jit: number[]): CPt[] {
  const P = (x: number, y: number, c = false): CPt => (c ? { x: x * R, y: y * R, c } : { x: x * R, y: y * R });
  if (view === "back") return [];
  const side = view === "side";
  const A = side ? v(-0.16, 0.24) : v(-0.88, 0.14);
  const B = side ? v(0.9, -0.02) : v(0.88, 0.14);
  const apexT = side ? 0.42 : 0.5;
  const yh = -0.46;
  const hair = (t: number): V2 => {
    const x = A.x + (B.x - A.x) * t;
    const yl = A.y + (B.y - A.y) * t;
    const k = t < apexT ? Math.sin((t / apexT) * Math.PI * 0.5) : Math.sin(((1 - t) / (1 - apexT)) * Math.PI * 0.5);
    return v(x, yl + (yh - yl) * k);
  };
  const pts: CPt[] = [];
  const drop = spec.drop;
  switch (spec.fringe) {
    case "slick":
    case "none":
      for (let i = 0; i <= 8; i += 1) {
        const h = hair(i / 8);
        pts.push(P(h.x, h.y + 0.02));
      }
      break;
    case "locks":
    case "spiky":
    case "messy": {
      const count = spec.fringe === "spiky" ? 4 : spec.fringe === "messy" ? 6 : 5;
      const sweep = side ? 0.22 : 0.12;
      for (let i = 0; i <= count; i += 1) {
        const t = i / count;
        const root = hair(t);
        pts.push(i === 0 || i === count ? P(root.x, root.y) : P(root.x, root.y + 0.06));
        if (i < count) {
          const tm = (i + 0.5 + sweep) / count;
          const mid = hair(Math.min(0.98, tm));
          const dd = drop * (spec.fringe === "messy" ? 0.7 + 0.45 * Math.abs(jit[i]) : spec.fringe === "spiky" ? 0.9 + 0.2 * jit[i] : 0.9 + 0.12 * jit[i]);
          const edge = t < 0.1 || t > 0.8 ? 0.7 : 1;
          pts.push(P(mid.x + (spec.fringe === "messy" ? jit[i + 5] * 0.05 : 0), Math.max(mid.y + 0.1, yh + dd * edge) , true));
        }
      }
      break;
    }
    case "scallop": {
      const count = 6;
      for (let i = 0; i <= count * 2; i += 1) {
        const t = i / (count * 2);
        const h = hair(t);
        pts.push(P(h.x, i % 2 === 1 ? Math.max(h.y + 0.1, yh + drop) : h.y + 0.1));
      }
      break;
    }
    case "blunt": {
      const yb = yh + drop;
      const n = 7;
      pts.push(P(A.x, A.y));
      for (let i = 0; i <= n; i += 1) {
        const t = 0.06 + (0.88 * i) / n;
        const h = hair(t);
        const notch = i % 3 === 1 ? -0.05 : 0;
        pts.push(P(h.x, yb + notch + 0.03 * Math.sin(t * Math.PI), i % 3 === 1));
      }
      pts.push(P(B.x, B.y));
      break;
    }
    case "swoop": {
      // Part on the near/left side; one big lock sweeps across.
      const partT = side ? 0.12 : 0.26;
      const part = hair(partT);
      pts.push(P(A.x, A.y));
      pts.push(P(part.x - 0.04, part.y + 0.12));
      pts.push({ ...P(part.x, part.y - 0.06), c: true });
      const tipX = B.x - 0.1;
      pts.push(P(part.x + 0.3, yh + 0.14));
      pts.push(P(part.x + 0.55, yh + drop * 0.55));
      pts.push({ ...P(lerp(part, B, 0.62).x, yh + drop * 0.72), c: true });
      pts.push(P(lerp(part, B, 0.72).x, yh + drop * 0.58));
      pts.push({ ...P(tipX, B.y + 0.02), c: true });
      pts.push(P(B.x, B.y));
      break;
    }
    case "part": {
      const partT = side ? 0.3 : 0.5;
      const part = hair(partT);
      pts.push(P(A.x, A.y + 0.1));
      pts.push(P(A.x + (part.x - A.x) * 0.35, lerp(A, part, 0.4).y + drop * 0.6));
      pts.push(P(part.x - 0.1 * (side ? 0.5 : 1), part.y + 0.18));
      pts.push({ ...P(part.x, part.y + 0.02), c: true });
      pts.push(P(part.x + 0.1, part.y + 0.18));
      pts.push(P(part.x + (B.x - part.x) * 0.65, lerp(part, B, 0.6).y + drop * 0.6));
      pts.push(P(B.x, B.y + 0.1));
      break;
    }
  }
  // The cap path runs contour (right→left) then down the left side, so the
  // fringe must run left→right... callers append it after the left side.
  return pts;
}

// ---------------------------------------------------------------------------
// Facial hair
// ---------------------------------------------------------------------------

export function drawFacialHair(pen: Pen, g: FaceGeo, look: HumanLook, pal: Palette, ink: Ink, seed: number): string {
  const kind = look.facial_hair;
  if (kind === "none" || g.view === "back") return "";
  const R = g.R;
  const side = g.view === "side";
  const P = (x: number, y: number, c = false): CPt => (c ? { x: x * R, y: y * R, c } : { x: x * R, y: y * R });
  const fill = pal.hair;
  const m = g.mouth;
  const my = m.y / R;
  const mx = m.x / R;
  let s = "";
  if (kind === "stubble") {
    const rand = seeded(seed, "stubble");
    let d = "";
    for (let i = 0; i < 26; i += 1) {
      const t = rand();
      const u = rand();
      let p: V2;
      if (side) p = lerp(lerp(P(-0.3, 0.85), P(0.5, 1.32), t), lerp(P(0.0, 0.95), P(0.72, 1.1), t), u * 0.8);
      else {
        const x = (t * 2 - 1) * 0.72;
        const yTop = 0.9 + Math.abs(x) * 0.05;
        const yBot = 1.3 - Math.abs(x) * 0.35;
        p = P(x, yTop + (yBot - yTop) * u);
      }
      const q = pen.p(p);
      pen.bounds.add(q);
      d += `M${n(q.x)} ${n(q.y)}l${n(0.012 * R * pen.s)} ${n(0.02 * R * pen.s)}`;
    }
    return line(d, ink.dw * 0.8);
  }
  const mustache = (): string => {
    const k = side ? 0.72 : 1;
    const pts: CPt[] = [
      P(mx, my - 0.13),
      P(mx + 0.18 * k, my - 0.13),
      P(mx + 0.34 * k, my - 0.02),
      { ...P(mx + 0.4 * k, my + 0.06), c: true },
      P(mx + 0.22 * k, my - 0.04),
      P(mx, my - 0.05),
      P(mx - 0.22, my - 0.04),
      { ...P(mx - 0.4, my + 0.06), c: true },
      P(mx - 0.34, my - 0.02),
      P(mx - 0.18, my - 0.13),
    ];
    return shape(pen.curve(pts), fill, ink.dw * 1.4);
  };
  if (kind === "mustache") return mustache();
  const long = kind === "long_beard";
  const low = long ? 2.9 : 1.6;
  let pts: CPt[];
  if (side) {
    pts = [P(-0.28, 0.5), P(-0.4, 1.0), P(-0.1, 1.35), P(0.25, low - 0.1), { ...P(0.55, low), c: true }, P(0.78, low - 0.35), P(0.82, 1.15), P(mx + 0.18, my + 0.1), P(mx - 0.1, my + 0.14), P(-0.02, 0.9), P(-0.14, 0.52)];
  } else {
    pts = [P(-0.96, 0.4), P(-0.98, 0.95), P(-0.6, low - 0.25), { ...P(0, low), c: true }, P(0.6, low - 0.25), P(0.98, 0.95), P(0.96, 0.4), P(0.82, 0.62), P(0.4, my + 0.02), P(0, my + 0.14), P(-0.4, my + 0.02), P(-0.82, 0.62)];
  }
  if (long) {
    // Wavy flowing tip.
    pts = pts.map((p) => (p.y > 1.8 * R && !p.c ? { ...p, x: p.x * 0.85 } : p));
  }
  const d = pen.curve(pts);
  s += shape(d, fill, ink.lw * 0.9);
  if (!ink.lite) {
    const strand = pal.hairDark ? PAPER : INK;
    const cx = side ? 0.3 : 0;
    for (const dx of [-0.25, 0.05, 0.3]) s += line(pen.curve([P(cx + dx, my + 0.3), P(cx + dx * 1.1, (my + low) / 2 + 0.1), P(cx + dx * 0.7, low - 0.2)], false), ink.dw * 0.7, strand);
  }
  s += mustache();
  return s;
}
