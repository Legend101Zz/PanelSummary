/**
 * Human figure assembly: solves the pose, then paints layers back to front
 * (capes and long hair, limbs behind the torso, legs, skirts, torso and
 * garment details, neck, head, limbs in front) and reports anchors.
 */
import type { HumanLook } from "../../contracts.js";
import type { DrawContext, FigureAnchors, FigureDrawing, FigureRequest } from "../../internal.js";
import { INK, PAPER, STROKE, toneFill } from "../../style.js";
import { n } from "../../svg.js";
import {
  add,
  Bounds,
  compose,
  dot,
  IDENTITY,
  len,
  lerp,
  mul,
  norm,
  Pen,
  perp,
  rotateM,
  scaleM,
  sub,
  translate,
  upAngle,
  v,
  v3,
  type CPt,
  type V2,
} from "./geom.js";
import { humanMetrics, humanPalette, type Palette } from "./look.js";
import { poseDef } from "./pose.js";
import { projectDir, solveSkeleton, type ArmJ, type LegJ, type Skeleton, type ViewKind } from "./skeleton.js";
import { armD, bootD, drawFoot, drawHand, foreD, legD, legPts, thumbPref, Torso } from "./body.js";
import { drawEars, drawFace, drawHeadShape, faceGeo, type FaceGeo } from "./face.js";
import { drawFacialHair, drawHair } from "./hair.js";
import { drawEarring, drawGlasses, drawHeadwear } from "./wear.js";
import {
  apronShapes,
  band,
  capeShape,
  cloakMantle,
  coatFlaps,
  fitFor,
  skirtFolds,
  skirtShape,
  torsoDetails,
  type DetailCtx,
} from "./outfit.js";
import { circle, line, shape, solid, uni, type Ink } from "./paint.js";

export interface HumanDrawOptions {
  /** Simplified rendering for crowds: fewer detail lines, no silhouette pass. */
  lite?: boolean;
}

type HumanRequest = FigureRequest & { look: HumanLook };

/** White rim just inside a dark union shape (internal overlaps hidden). */
function rimUnion(d: string, fill: string, w: number): string {
  return `<path d="${d}" fill="${fill}" stroke="${PAPER}" stroke-width="${n(w * 2)}" paint-order="stroke"/>`;
}

/** Fills dark enough that ink outlines vanish against each other. */
export function isDarkFill(fill: string): boolean {
  return fill === INK || fill === "#4a4a4a" || fill.includes("tone-dense_dots");
}

const NEAR_BUSY = new Set(["point", "reach", "wave", "hold", "carry", "talk", "think", "cover_face", "cower", "arms_crossed", "hands_on_hips", "fall", "jump"]);

export function drawHuman(req: HumanRequest, ctx: DrawContext, opts: HumanDrawOptions = {}): FigureDrawing {
  const look = req.look;
  const m = humanMetrics(look, req.seed);
  const def = poseDef(req.pose, m);
  const view: ViewKind = req.facing === "front" ? "front" : req.facing === "back" ? "back" : "side";
  const sk = solveSkeleton(m, def, view);
  const pal = humanPalette(look, ctx.idPrefix);
  const fit = fitFor(look, pal, ctx.idPrefix);
  const bounds = new Bounds();
  const pen = new Pen(IDENTITY, bounds);
  const lw = req.lineWidth;
  const ink: Ink = { lw, dw: lw * (STROKE.figureDetail / STROKE.figureOutline), sil: [], lite: !!opts.lite };
  const torso = new Torso(sk);
  const H = m.H;
  const dctx: DetailCtx = { pen, sk, torso, fit, pal, ink, look, idPrefix: ctx.idPrefix, seed: req.seed, behind: [] };
  const P = sk.P;
  const metallic = pal.material === "gold" || pal.material === "bronze";

  // ---- head transform ------------------------------------------------------
  const g = faceGeo(look, m.R, view, m.jitter);
  const neckTop = P(sk.neckTop);
  const hu = projectDir(sk.cam, sk.headUp);
  let headAngle = len(hu) > 0.35 ? upAngle(hu) : sk.cam.roll;
  headAngle += (sk.mirror ? -1 : 1) * def.headRoll;
  const headMat = compose(translate(neckTop.x, neckTop.y), compose(rotateM(headAngle), compose(scaleM(sk.mirror ? -1 : 1, 1), translate(-g.neck.x, -g.neck.y))));
  const hp = pen.with(headMat);

  // ---- layer buffers -------------------------------------------------------
  const L = {
    back: "",
    behind: "",
    legs: "",
    skirt: "",
    neck: "",
    torso: "",
    torsoOver: "",
    head: "",
    front: "",
    backCape: "",
  };
  const sil = (d: string) => {
    if (d) ink.sil.push(d);
  };

  // ---- capes and back hair -------------------------------------------------
  if (fit.cape) {
    const c = capeShape(pen, sk, torso, fit.cape.len, fit.cloak ? 0.05 : 0);
    const svg = shape(c.d, fit.cape.fill, lw);
    sil(c.d);
    if (view === "back") {
      L.backCape += svg;
      if (!ink.lite) L.backCape += capeFolds(pen, sk, torso, c.hemY, ink);
    } else L.back += svg;
  }
  const hair = drawHair(hp, g, look, pal, ink, req.seed);
  L.back += hair.back;
  sil(hair.backSil);

  // ---- coats (back panel) ----------------------------------------------------
  let coatHemY = 0;
  if (fit.coat) {
    const s = skirtShape(pen, sk, torso, fit.coat.hem, fit.coat.flare, 0.26, false, req.seed);
    coatHemY = s.hemY;
    const svg = shape(s.d, fit.coat.fill, lw) + (ink.lite ? "" : skirtFolds(pen, torso, s, 0.26, 2, ink.dw));
    sil(s.d);
    if (view === "back") L.skirt += svg;
    else L.back += svg;
  }

  // ---- arms: classify each segment as behind or in front of the torso ------
  const torsoZ = P(sk.pelvis).z;
  const thr = -0.02 * H;
  const armLayers = (arm: ArmJ) => {
    const upperZ = (P(arm.shoulder).z + P(arm.elbow).z) / 2 - torsoZ;
    const foreZ = (P(arm.elbow).z + P(arm.wrist).z) / 2 - torsoZ;
    return { upperFront: upperZ > thr, foreFront: foreZ > thr };
  };
  const nearHandUses = NEAR_BUSY.has(req.pose);
  const caneArm: ArmJ | null = look.accessories.includes("cane") && !def.roll && !def.lift && req.pose !== "sit"
    ? !nearHandUses
      ? sk.near.arm
      : sk.far.arm.hand === "relaxed" && !["arms_crossed", "hands_on_hips", "cover_face", "cower", "think", "carry", "jump", "fall"].includes(req.pose)
        ? sk.far.arm
        : null
    : null;

  const grips: V2[] = [];
  const drawArm = (arm: ArmJ, isNear: boolean) => {
    const lay = armLayers(arm);
    const handFill = fit.gloves ?? pal.skin;
    const pref = thumbPref(sk, arm);
    let upper = "";
    let fore = "";
    // Cane first so the hand closes over it.
    if (caneArm === arm) fore += drawCane(pen, sk, arm, pal, ink);
    const hand = drawHand(pen, sk, arm, handFill, ink, pref);
    grips.push(hand.grip);
    if (isNear) nearGrip = hand.grip;
    sil(hand.sil);
    const r = m.r;
    const S = P(arm.shoulder);
    const E = P(arm.elbow);
    const W = P(arm.wrist);
    switch (fit.sleeveKind) {
      case "long":
      case "puff": {
        fore += hand.svg;
        const rim = isDarkFill(fit.sleeve) && !ink.lite ? rimUnion(armD(pen, sk, arm, 1, false, lw * 1.5), fit.sleeve, ink.dw * 0.8) : "";
        if (lay.upperFront === lay.foreFront) {
          const d = armD(pen, sk, arm);
          sil(d);
          fore += uni(d, fit.sleeve, lw) + rim;
        } else {
          const du = pen.capsule(lerp(S, E, 0.1), r.upperArm, E, r.elbow);
          const df = foreD(pen, sk, arm);
          sil(du + df);
          upper += uni(du, fit.sleeve, lw);
          fore += uni(df, fit.sleeve, lw) + (rim ? rimUnion(foreD(pen, sk, arm, 1, lw * 1.5), fit.sleeve, ink.dw * 0.8) : "");
        }
        if (fit.sleeveKind === "puff") {
          const pc = lerp(S, E, 0.32);
          const d = pen.capsule(lerp(S, E, 0.13), r.upperArm * 1.22, pc, r.upperArm * 1.12);
          upper += uni(d, fit.sleeve, lw);
        }
        if (fit.outfit === "royal" || fit.outfit === "uniform") {
          const cuffA = lerp(E, W, 0.82);
          fore += uni(pen.capsule(cuffA, r.wrist * 1.35, lerp(E, W, 0.98), r.wrist * 1.3), fit.outfit === "royal" ? PAPER : pal.accent, lw * 0.8);
        }
        break;
      }
      case "rolled":
      case "torn": {
        const skin = pal.skin;
        const df = foreD(pen, sk, arm);
        sil(df);
        fore += uni(df, skin, lw) + hand.svg;
        const cut = fit.sleeveKind === "rolled" ? 1.0 : 0.72;
        const end = lerp(S, E, cut);
        const du = pen.capsule(S, r.upperArm * 1.05, end, r.elbow * (fit.sleeveKind === "rolled" ? 1.25 : 1.15));
        sil(du);
        const sleeve = uni(du, fit.sleeve, lw);
        if (fit.sleeveKind === "rolled") {
          const cuff = uni(pen.capsule(lerp(S, E, 0.86), r.elbow * 1.3, E, r.elbow * 1.3), fit.sleeve, lw);
          upper += sleeve;
          fore += cuff;
        } else {
          upper += sleeve + jag(pen, lerp(S, E, cut - 0.02), norm(sub(E, S)), r.elbow * 1.15, ink);
        }
        break;
      }
      case "bell": {
        const du = pen.capsule(S, r.upperArm, E, r.elbow * 1.1);
        const dir = norm(sub(W, E));
        const nrm = perp(dir);
        const wEnd = add(W, mul(dir, m.handL * 0.22));
        const wr = r.wrist * 2.7;
        const bell: CPt[] = [add(E, mul(nrm, r.elbow * 1.1)), { ...add(wEnd, mul(nrm, wr)), c: true }, add(wEnd, mul(dir, r.wrist * 0.3)), { ...add(wEnd, mul(nrm, -wr)), c: true }, add(E, mul(nrm, -r.elbow * 1.1)), add(E, mul(dir, -r.elbow * 1.1))];
        const db = pen.curve(bell, true, 0.7);
        sil(du + db);
        fore += hand.svg;
        if (lay.upperFront === lay.foreFront) fore += uni(du + db, fit.sleeve, lw);
        else {
          upper += uni(du, fit.sleeve, lw);
          fore += uni(db, fit.sleeve, lw);
        }
        if (!ink.lite) fore += line(pen.curve([lerp(E, wEnd, 0.3), add(lerp(E, wEnd, 0.75), mul(nrm, wr * 0.3))], false), ink.dw);
        break;
      }
    }
    if (metallic && !ink.lite) {
      upper += glint(pen, S, E, r.upperArm, ink);
      fore += glint(pen, E, W, r.elbow, ink);
    }
    if (fit.outfit === "armor") {
      const pd = pen.curve(pauldron(S, E, r.upperArm), true);
      upper += shape(pd, fit.top, lw) + line(pen.curve(pauldronLine(S, E, r.upperArm), false), ink.dw);
      sil(pd);
      fore += uni(pen.capsule(lerp(E, W, 0.35), r.elbow * 1.2, lerp(E, W, 0.95), r.wrist * 1.4), fit.top, lw * 0.9);
    }
    if (fit.outfit === "uniform") {
      const top = add(S, mul(torso.spine2, r.upperArm * 0.55));
      upper += shape(pen.curve(ellipsePtsLocal(top, r.upperArm * 1.25, r.upperArm * 0.45, upAngle(torso.spine2) + 90)), toneFill("gold", ctx.idPrefix), ink.dw);
    }
    // Each segment goes behind or in front of the torso on its own depth.
    const slot = isNear ? 1 : 0;
    if (lay.upperFront && lay.foreFront) frontArms[slot] = upper + fore;
    else if (lay.upperFront) {
      behindArms += fore;
      frontArms[slot] = upper;
    } else if (lay.foreFront) {
      behindArms += upper;
      frontArms[slot] = fore;
    } else behindArms += upper + fore;
  };
  let nearGrip: V2 = v(0, -H * 0.5);
  let behindArms = "";
  const frontArms: [string, string] = ["", ""];
  drawArm(sk.far.arm, false);
  drawArm(sk.near.arm, true);
  L.behind += behindArms;

  // ---- legs ------------------------------------------------------------------
  const lower = pen.curve(torso.outline(-0.26, 0.36, "round"), true, 1);
  const drawLeg = (leg: LegJ, withPelvis: boolean) => {
    let s = "";
    const shoeFill = fit.shoeFill;
    const foot = drawFoot(pen, sk, leg, fit.shoe, shoeFill, pal.skin, ink);
    sil(foot.sil);
    if (!fit.boot) s += foot.svg;
    let d = legD(pen, sk, leg);
    if (withPelvis) d += lower;
    sil(d);
    if (fit.legKind === "torn") {
      s += uni(d, pal.skin, lw);
      const p = legPts(sk, leg);
      const cutEnd = lerp(p.knee, p.ankle, 0.5);
      let dt = pen.capsule(p.hip, m.r.thigh, p.knee, m.r.knee * 1.1) + pen.capsule(p.knee, m.r.knee * 1.1, cutEnd, m.r.calf * 1.12);
      if (withPelvis) dt += lower;
      s += uni(dt, fit.legs, lw) + jag(pen, cutEnd, norm(sub(p.ankle, p.knee)), m.r.calf * 1.12, ink);
    } else {
      s += uni(d, fit.legs, lw);
      if (isDarkFill(fit.legs) && !ink.lite) s += rimUnion(legD(pen, sk, leg, 1, 0, lw * 1.5), fit.legs, ink.dw * 0.8);
    }
    if (fit.stripe && !ink.lite) {
      const p = legPts(sk, leg);
      const off = mul(perp(norm(sub(p.ankle, p.hip))), sk.view === "side" ? 0 : leg.side * (sk.view === "front" ? 1 : -1) * m.r.knee * 0.7);
      s += line(pen.curve([add(p.hip, off), add(p.knee, off), add(p.ankle, off)], false), ink.dw * 1.4);
    }
    if (fit.boot) {
      const bd = bootD(pen, sk, leg, fit.boot);
      s += uni(bd + foot.sil, shoeFill, lw);
      if (!ink.lite) {
        const p = legPts(sk, leg);
        const top = lerp(p.ankle, p.knee, fit.boot);
        const nrm = perp(norm(sub(p.knee, p.ankle)));
        s += line(pen.curve([add(top, mul(nrm, m.r.calf * 1.05)), add(lerp(top, p.ankle, 0.12), v(0, 0)), add(top, mul(nrm, -m.r.calf * 1.05))], false), ink.dw, shoeFill === INK ? PAPER : INK);
      }
    }
    if (fit.greaves) {
      const p = legPts(sk, leg);
      const gd = pen.capsule(lerp(p.knee, p.ankle, 0.1), m.r.calf * 1.2, lerp(p.knee, p.ankle, 0.72), m.r.ankle * 1.8);
      s += uni(gd, fit.greaves, lw) + circle(pen.circle(p.knee, m.r.knee * 1.2), fit.greaves, lw);
    }
    if (metallic && !ink.lite) {
      const p = legPts(sk, leg);
      s += glint(pen, p.hip, p.knee, m.r.thigh, ink) + glint(pen, p.knee, p.ankle, m.r.calf, ink);
    }
    return s;
  };
  const legOrder: [LegJ, LegJ] = view === "side" ? [sk.far.leg, sk.near.leg] : [sk.far.leg, sk.near.leg];
  L.legs += drawLeg(legOrder[0], false) + drawLeg(legOrder[1], true);

  // ---- skirts ---------------------------------------------------------------
  if (fit.skirt) {
    const sk0 = fit.skirt;
    const s = skirtShape(pen, sk, torso, sk0.hem, sk0.flare, sk0.waist, sk0.jag, req.seed);
    sil(s.d);
    L.skirt += shape(s.d, sk0.fill, lw);
    if (!ink.lite && sk0.hem > 0.2) L.skirt += skirtFolds(pen, torso, s, sk0.waist, sk0.hem > 0.9 ? 4 : 3, ink.dw);
    if (fit.outfit === "armor" && !ink.lite) L.skirt += skirtFolds(pen, torso, s, sk0.waist, 3, ink.dw);
    if (fit.outfit === "royal") L.skirt += hemTrim(pen, s.pts, s.hemY, sk, ink);
    if (fit.outfit === "gown" && !ink.lite) L.skirt += hemRuffle(pen, s.pts, s.hemY, sk, ink);
  }
  if (fit.coat && view !== "back") {
    const fl = coatFlaps(dctx, coatHemY, fit.coat.fill);
    L.skirt += fl.svg;
    sil(fl.d);
  }

  // ---- neck ------------------------------------------------------------------
  {
    const nb = P(sk.neckBase);
    const into = hp.p(add(g.neck, v(0, -0.35 * g.R)));
    const d = pen.capsule(nb, m.r.neck, into, m.r.neck * 0.95);
    L.neck += shape(d, pal.skin, lw);
    sil(d);
    if (view !== "back" && !ink.lite) {
      const R = g.R;
      const sh: CPt[] =
        view === "front"
          ? [v(-0.36 * R, 1.0 * R), v(-0.34 * R, 1.46 * R), v(0, 1.6 * R), v(0.34 * R, 1.46 * R), v(0.36 * R, 1.0 * R)]
          : [v(-0.5 * R, 0.95 * R), v(-0.48 * R, 1.36 * R), v(-0.12 * R, 1.52 * R), v(0.16 * R, 1.36 * R), v(0.16 * R, 1.05 * R)];
      L.neck += solid(hp.curve(sh), pal.skinShade);
    }
  }

  // ---- torso -------------------------------------------------------------------
  {
    const up = pen.curve(torso.outline(fit.upperFrom, 1.03, "arc"), true, 1);
    sil(up);
    L.torso += uni(up, fit.top, lw);
    if (isDarkFill(fit.top) && !ink.lite) L.torso += line(pen.curve(torso.outline(fit.upperFrom, 1.0, "arc", -lw * 1.5), true, 1), ink.dw * 0.8, PAPER);
    L.torso += torsoDetails(dctx);
    if (metallic && !ink.lite) {
      const f = torso.frontTheta(0.6) - 38;
      const streak = [0.42, 0.55, 0.7, 0.84].map((s) => torso.surf(s, f, -lw));
      L.torso += line(pen.curve(streak, false), ink.dw * 1.8, PAPER);
      L.torso += line(pen.curve([torso.surf(0.9, f + 20, -lw), torso.surf(0.96, f + 40, -lw)], false), ink.dw * 1.4, PAPER);
    }
    if (fit.apron) {
      const a = apronShapes(dctx, fit.apron);
      L.torsoOver += a.skirt + a.bib;
      sil(a.sil);
    }
    if (fit.cloak) {
      const mnt = cloakMantle(dctx, fit.cloak.fill);
      L.torsoOver += mnt.svg;
      sil(mnt.d);
    }
    L.torsoOver += accessories(dctx, look);
  }

  // ---- head ------------------------------------------------------------------
  {
    const wear = drawHeadwear(hp, g, look, pal, ink, ctx.idPrefix);
    const ears = drawEars(hp, g, pal.skin, ink);
    const headShape = drawHeadShape(hp, g, pal, ink);
    const face = drawFace(hp, g, req.expression, pal, ink);
    sil(headShape.d);
    sil(hair.capSil);
    sil(hair.frontSil);
    sil(wear.backSil);
    sil(wear.frontSil);
    let s = wear.back + ears.behind + headShape.svg + ears.over + face.under;
    s += drawFacialHair(hp, g, look, pal, ink, req.seed);
    s += face.mouth;
    if (pal.statue && pal.material !== "flesh") s += statueMarks(hp, g, pal, ink, req.seed);
    s += hair.underCap + hair.cap + hair.front + face.brows;
    if (look.accessories.includes("glasses")) s += drawGlasses(hp, g, ink);
    if (look.accessories.includes("earring")) s += drawEarring(hp, g, pal, ink, ctx.idPrefix);
    s += wear.front;
    L.head += s;
  }

  L.front += frontArms[0] + frontArms[1];
  L.back += dctx.behind.join("");

  // ---- grip anchor -------------------------------------------------------------
  const hand = def.grip === "both" && grips.length === 2 ? lerp(grips[0], grips[1], 0.5) : nearGrip;

  // ---- assemble ------------------------------------------------------------------
  const silPad = lw * 1.2;
  const silhouette = ink.sil.length && !ink.lite ? `<path d="${ink.sil.join("")}" fill="${PAPER}" stroke="${INK}" stroke-width="${n(lw * 2.4)}"/>` : "";
  const bodyOrder =
    view === "back"
      ? [L.back, L.behind, L.legs, L.skirt, L.neck, L.torso, L.torsoOver, L.front, L.backCape, L.head]
      : [L.back, L.behind, L.legs, L.skirt, L.neck, L.torso, L.torsoOver, L.head, L.front];
  const svg = `<g stroke-linecap="round" stroke-linejoin="round">${silhouette}${bodyOrder.join("")}</g>`;

  const headC = hp.p(v(0, view === "back" ? 0.05 * g.R : 0.19 * g.R));
  const mouth = hp.p(view === "back" ? v(0, 0.9 * g.R) : g.mouth);
  const shoulders = (P(sk.near.arm.shoulder).y + P(sk.far.arm.shoulder).y) / 2;
  const anchors: FigureAnchors = {
    head: headC,
    headRadius: 1.28 * g.R,
    mouth,
    hand,
    top: bounds.minY - silPad,
    left: bounds.minX - silPad,
    right: bounds.maxX + silPad,
    waist: torso.centre(0.33).y,
    shoulders,
  };
  return { svg, anchors };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ellipsePtsLocal(c: V2, rx: number, ry: number, rotDeg: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < 10; i += 1) {
    const t = (i / 10) * Math.PI * 2;
    const p = v(Math.cos(t) * rx, Math.sin(t) * ry);
    const a = (rotDeg * Math.PI) / 180;
    out.push(v(c.x + p.x * Math.cos(a) - p.y * Math.sin(a), c.y + p.x * Math.sin(a) + p.y * Math.cos(a)));
  }
  return out;
}

/** Metallic glint: a white streak along the lit (upper-left) side of a limb segment. */
function glint(pen: Pen, a: V2, b: V2, r: number, ink: Ink): string {
  const dir = norm(sub(b, a));
  let nrm = perp(dir);
  if (dot(nrm, v(-0.6, -0.8)) < 0) nrm = mul(nrm, -1);
  const off = mul(nrm, r * 0.45);
  return line(pen.curve([add(lerp(a, b, 0.14), off), add(lerp(a, b, 0.45), mul(off, 1.08)), add(lerp(a, b, 0.72), off)], false), ink.dw * 1.5, PAPER);
}

/** Zigzag torn edge across a limb at `at`, perpendicular to `dir`. */
function jag(pen: Pen, at: V2, dir: V2, r: number, ink: Ink): string {
  const nrm = perp(dir);
  const pts: V2[] = [];
  for (let i = 0; i <= 6; i += 1) {
    const t = -1 + (2 * i) / 6;
    pts.push(add(add(at, mul(nrm, t * r)), mul(dir, i % 2 === 0 ? 0 : r * 0.45)));
  }
  return line(pen.poly(pts, false), ink.dw);
}

function pauldron(S: V2, E: V2, r: number): V2[] {
  const dir = norm(sub(E, S));
  const nrm = perp(dir);
  const c = add(S, mul(dir, r * 0.3));
  const out: V2[] = [];
  for (let i = 0; i <= 10; i += 1) {
    const t = Math.PI * (i / 10);
    out.push(add(c, add(mul(nrm, Math.cos(t) * r * 1.75), mul(dir, -Math.sin(t) * r * 1.5 + r * 0.9))));
  }
  return out;
}

function pauldronLine(S: V2, E: V2, r: number): V2[] {
  const dir = norm(sub(E, S));
  const nrm = perp(dir);
  const c = add(S, mul(dir, r * 0.9));
  return [add(c, mul(nrm, r * 1.6)), add(c, mul(dir, r * 0.35)), add(c, mul(nrm, -r * 1.6))];
}

function drawCane(pen: Pen, sk: Skeleton, arm: ArmJ, pal: Palette, ink: Ink): string {
  const H = sk.m.H;
  const P = sk.P;
  const w = P(arm.wrist);
  const dir = norm(projectDir(sk.cam, arm.handDir));
  const grip = add(w, mul(dir, sk.m.handL * 0.4));
  let bottom: V2;
  if (!sk.def.roll && !sk.def.lift && grip.y > -0.62 * H) bottom = v(grip.x + (sk.view === "side" ? (sk.mirror ? -1 : 1) * 0.04 * H : 0.02 * H), 0);
  else bottom = add(grip, mul(dir, 0.42 * H));
  const r = 0.0085 * H;
  const shaft = pen.capsule(grip, r, bottom, r * 0.9);
  const fwd = sk.view === "side" ? v(sk.mirror ? -1 : 1, 0) : v(1, 0);
  const crookTop = add(grip, v(0, -0.045 * H));
  const crook = pen.curve([grip, crookTop, add(crookTop, mul(fwd, 0.05 * H)), add(add(crookTop, mul(fwd, 0.06 * H)), v(0, 0.03 * H))], false);
  const fill = pal.statue ? pal.mat : "#4a4a4a";
  return uni(shaft, fill, ink.lw * 0.8) + line(crook, r * 2.4) + line(crook, r * 1.1, fill === INK ? PAPER : fill);
}

function capeFolds(pen: Pen, sk: Skeleton, torso: Torso, hemY: number, ink: Ink): string {
  const top = torso.edges(0.85);
  let s = "";
  for (const t of [0.25, 0.5, 0.75]) {
    const a = lerp(top.l, top.r, t);
    s += line(pen.curve([a, v(a.x + (t - 0.5) * 0.05 * sk.m.H, (a.y + hemY) / 2), v(a.x + (t - 0.5) * 0.12 * sk.m.H, hemY - 0.02 * sk.m.H)], false), ink.dw);
  }
  return s;
}

function hemTrim(pen: Pen, pts: V2[], hemY: number, sk: Skeleton, ink: Ink): string {
  const low = pts.filter((p) => p.y > hemY - 0.04 * sk.m.H).sort((a, b) => a.x - b.x);
  if (low.length < 2) return "";
  const H = sk.m.H;
  const a = low[0];
  const b = low[low.length - 1];
  const band: V2[] = [a, b, v(b.x, b.y - 0.03 * H), v(a.x, a.y - 0.03 * H)];
  let s = shape(pen.poly(band), PAPER, ink.dw);
  for (let i = 1; i < 5; i += 1) {
    const p = lerp(a, b, i / 5);
    s += solid(pen.poly([v(p.x - 0.004 * H, p.y - 0.022 * H), v(p.x + 0.004 * H, p.y - 0.022 * H), v(p.x, p.y - 0.006 * H)]), INK);
  }
  return s;
}

function hemRuffle(pen: Pen, pts: V2[], hemY: number, sk: Skeleton, ink: Ink): string {
  const H = sk.m.H;
  const low = pts.filter((p) => p.y > hemY - 0.08 * H).sort((a, b) => a.x - b.x);
  if (low.length < 2) return "";
  const a = low[0];
  const b = low[low.length - 1];
  const pts2: V2[] = [];
  for (let i = 0; i <= 10; i += 1) {
    const p = lerp(a, b, i / 10);
    pts2.push(v(p.x, Math.min(p.y, hemY) - 0.06 * H + (i % 2 === 0 ? 0 : 0.012 * H)));
  }
  return line(pen.curve(pts2, false), ink.dw);
}

function statueMarks(pen: Pen, g: FaceGeo, pal: Palette, ink: Ink, seed: number): string {
  const R = g.R;
  if (pal.material === "gold") {
    return line(pen.curve([v(-0.7 * R, -0.3 * R), v(-0.62 * R, 0.2 * R)], false), ink.dw * 1.5, PAPER);
  }
  if (pal.material === "stone") {
    const k = (seed % 7) / 7;
    return line(pen.poly([v((0.3 + k * 0.2) * R, -0.6 * R), v((0.36 + k * 0.2) * R, -0.3 * R), v((0.28 + k * 0.2) * R, -0.1 * R)], false), ink.dw * 0.8);
  }
  return "";
}

/** Body accessories that sit on the torso (before the front arms). */
function accessories(c: DetailCtx, look: HumanLook): string {
  const { pen, torso, sk, ink, pal } = c;
  const H = sk.m.H;
  const acc = new Set(look.accessories);
  const tf = (t: Parameters<typeof toneFill>[0]) => (pal.statue ? pal.mat : toneFill(t, c.idPrefix));
  let s = "";
  const nearTh = sk.def.mirror ? 90 : -90;
  const farTh = -nearTh;
  if (acc.has("necklace")) {
    const f = torso.frontTheta(0.95);
    if (torso.facing(0.95, f) > 0) {
      const pts: V2[] = [];
      for (let i = 0; i <= 8; i += 1) {
        const th = f - 70 + (140 * i) / 8;
        const k = Math.cos(((th - f) / 70) * (Math.PI / 2));
        pts.push(torso.surf(0.98 - 0.12 * k, th, 0.006 * H));
      }
      s += line(pen.curve(pts, false), ink.dw * 1.3);
      for (const p of pts.slice(1, -1)) s += circle(pen.circle(p, 0.0055 * H), tf("gold"), ink.dw * 0.6);
      const low = pts[4];
      s += shape(pen.curve([v(low.x, low.y), v(low.x + 0.012 * H, low.y + 0.018 * H), { x: low.x, y: low.y + 0.036 * H, c: true }, v(low.x - 0.012 * H, low.y + 0.018 * H)]), tf("gold"), ink.dw);
    }
  }
  if (acc.has("medal")) {
    const th = sk.view === "back" ? 999 : 38;
    if (th !== 999 && torso.facing(0.72, th) > 0.05) {
      const p = torso.surf(0.72, th, 0.006 * H);
      s += shape(pen.poly([v(p.x - 0.012 * H, p.y - 0.045 * H), v(p.x + 0.012 * H, p.y - 0.045 * H), v(p.x + 0.008 * H, p.y - 0.01 * H), v(p.x - 0.008 * H, p.y - 0.01 * H)]), tf("dark"), ink.dw);
      s += circle(pen.circle(p, 0.02 * H), tf("gold"), ink.dw);
      s += circle(pen.circle(p, 0.01 * H), "none", ink.dw * 0.7);
    }
  }
  if (acc.has("satchel")) {
    s += diagonalStrap(c, [0.93, farTh * 0.66], [0.12, nearTh * 0.9], 0.012 * H, tf("mid"));
    const bagC = torso.surf(0.02, sk.view === "side" ? nearTh * 0.55 : nearTh, 0.035 * H);
    const bw = 0.07 * H;
    const bh = 0.055 * H;
    const bag: CPt[] = [v(bagC.x - bw, bagC.y - bh * 0.4), v(bagC.x + bw, bagC.y - bh * 0.4), { x: bagC.x + bw * 1.05, y: bagC.y + bh, c: true }, { x: bagC.x - bw * 1.05, y: bagC.y + bh, c: true }];
    s += shape(pen.curve(bag, true, 0.5), tf("mid"), ink.lw);
    s += shape(pen.curve([v(bagC.x - bw, bagC.y - bh * 0.4), v(bagC.x + bw, bagC.y - bh * 0.4), { x: bagC.x + bw * 0.9, y: bagC.y + bh * 0.35, c: true }, { x: bagC.x - bw * 0.9, y: bagC.y + bh * 0.35, c: true }], true, 0.5), tf("dark"), ink.dw);
    ink.sil.push(pen.curve(bag, true, 0.5));
  }
  if (acc.has("sword_belt")) {
    s += band(pen, torso, 0.14, 0.2, 0.008 * H, INK, ink.dw);
    const leftTh = 80;
    const hip = torso.surf(0.12, leftTh, 0.02 * H);
    const down = norm(projectDir(sk.cam, v3(-0.42, -0.9, 0.08)));
    const tip = add(hip, mul(down, 0.4 * H));
    const scab = pen.capsule(hip, 0.013 * H, tip, 0.009 * H);
    const blade = uni(scab, tf("black"), ink.lw * 0.9) + line(pen.poly([add(tip, mul(down, -0.05 * H)), add(tip, mul(down, -0.004 * H))], false), ink.dw * 2, tf("gold"));
    const up = mul(down, -1);
    const guardC = add(hip, mul(up, 0.004 * H));
    const nrm = perp(up);
    const guard = pen.capsule(add(guardC, mul(nrm, -0.032 * H)), 0.006 * H, add(guardC, mul(nrm, 0.032 * H)), 0.006 * H);
    const gripEnd = add(guardC, mul(up, 0.06 * H));
    const hilt = uni(pen.capsule(guardC, 0.007 * H, gripEnd, 0.006 * H), INK, ink.dw) + uni(guard, tf("gold"), ink.dw) + circle(pen.circle(gripEnd, 0.011 * H), tf("gold"), ink.dw);
    ink.sil.push(scab);
    if (sk.view === "side" && !sk.def.mirror) c.behind.push(blade);
    else s += blade;
    s += hilt;
  }
  if (acc.has("scarf")) {
    const fill = look.outfit_tone === "light" ? tf("dark") : tf("light");
    s += band(pen, torso, 0.97, 1.1, 0.014 * H, fill, ink.lw);
    const back = sk.view === "side" ? v(sk.mirror ? 1 : -1, 0) : v(0, 0);
    const flow = sk.def.flow;
    let from: V2;
    let to: V2;
    if (sk.view === "side" && flow > 0.2) {
      from = torso.surf(1.02, sk.mirror ? 150 : -150, 0.014 * H);
      to = add(add(from, mul(back, 0.08 * H + flow * 0.14 * H)), v(0, 0.2 * H - flow * 0.1 * H));
    } else if (sk.view === "side") {
      const f = torso.frontTheta(0.9);
      from = torso.surf(1.0, f + 25, 0.016 * H);
      to = add(from, mul(norm(sub(torso.surf(0.62, f + 30, 0.02 * H), from)), 0.2 * H));
    } else {
      from = torso.surf(1.0, 30, 0.014 * H);
      to = add(from, v(0.01 * H, 0.22 * H));
    }
    const dir = norm(sub(to, from));
    const nrm = perp(dir);
    const wd = 0.022 * H;
    const tail: CPt[] = [add(from, mul(nrm, wd)), add(lerp(from, to, 0.5), mul(nrm, wd * 0.9 + 0.01 * H * flow)), { ...add(to, mul(nrm, wd)), c: true }, { ...add(to, mul(nrm, -wd)), c: true }, add(lerp(from, to, 0.5), mul(nrm, -wd * 0.9)), add(from, mul(nrm, -wd))];
    const td = pen.curve(tail);
    s += shape(td, fill, ink.lw);
    ink.sil.push(td);
    if (!ink.lite) for (const t of [0.35, 0.65]) s += line(pen.poly([add(lerp(from, to, t), mul(nrm, wd * 0.9)), add(lerp(from, to, t + 0.05), mul(nrm, -wd * 0.9))], false), ink.dw);
  }
  return s;
}

function diagonalStrap(c: DetailCtx, from: [number, number], to: [number, number], width: number, fill: string): string {
  const { pen, torso, ink } = c;
  const pts: V2[] = [];
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    const s = from[0] + (to[0] - from[0]) * t;
    const th = from[1] + (to[1] - from[1]) * t;
    if (torso.facing(s, th) > -0.05) pts.push(torso.surf(s, th, 0.008 * c.sk.m.H));
  }
  if (pts.length < 2) return "";
  const left: V2[] = [];
  const right: V2[] = [];
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const nn = perp(norm(sub(b, a)));
    left.push(add(pts[i], mul(nn, width / 2)));
    right.push(add(pts[i], mul(nn, -width / 2)));
  }
  return shape(pen.curve([...left, ...right.reverse()], true, 0.5), fill, ink.dw * 1.2);
}

