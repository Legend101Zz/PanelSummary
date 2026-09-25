/**
 * Insect rig: butterfly, dragonfly, bee. Cartoon proportions (oversized
 * head with a three-quarter face) so a talking insect emotes in close shots.
 * Wings are the silhouette: raised together at rest, spread when flying.
 */
import type { InsectLook, Point, Pose } from "../contracts.js";
import type { DrawContext, FigureDrawing, FigureRequest } from "../internal.js";
import type { KindRig } from "./kind.js";
import {
  DEG,
  INK,
  P,
  PAPER,
  type Pen,
  Sketch,
  addP,
  anchorsFrom,
  finishFigure,
  blobD,
  circleD,
  curveD,
  darker,
  ellipseD,
  fillOf,
  isDark,
  lerpP,
  lighter,
  lineD,
  makePen,
  polar,
  rotP,
  taperD,
} from "./creature/common.js";
import { ALL_EXPRESSIONS, EXPR, drawFace, mouthOpen } from "./creature/face.js";

type Species = InsectLook["species"];
const POSES: readonly Pose[] = ["stand", "talk", "fly", "perch", "cower", "fall", "wave", "point"];
const HEIGHT: Record<Species, number> = { butterfly: 9, dragonfly: 8, bee: 7 };

interface Built {
  sk: Sketch;
  head: Point;
  headR: number;
  mouth: Point;
  hand?: Point;
  waist: number;
  shoulders: number;
}

function drawInsect(sp: Species, look: InsectLook, pose: Pose, expression: InsectLook extends never ? never : FigureRequest["expression"], facing: "right" | "front" | "back", pen: Pen): Built {
  const sk = new Sketch(pen);
  const tone = look.tone;
  const wingFill = fillOf(tone, pen);
  const bodyFill = fillOf(sp === "bee" ? "white" : darker(tone) === "black" ? "dark" : darker(tone), pen);
  const dark = isDark(tone);
  const fly = pose === "fly" || pose === "fall";
  const fall = pose === "fall";
  const cower = pose === "cower";
  const perch = pose === "perch";
  const talking = pose === "talk";
  const front = facing !== "right";
  const back = facing === "back";
  const H = HEIGHT[sp];
  // body placement
  const lift = fly ? H * 0.35 : perch ? H * 0.12 : 0;
  const hr = sp === "dragonfly" ? H * 0.19 : sp === "bee" ? H * 0.2 : H * 0.17;
  const legLen = H * 0.16;
  const tilt = (fall ? 150 : fly ? -12 : cower ? 12 : 0) * DEG;
  const thorax = P(0, -legLen - H * 0.14 - lift);
  const R = (p: Point) => rotP(p, tilt, thorax);
  const rel = (x: number, y: number) => R(addP(thorax, P(x, y)));
  let hand: Point | undefined;

  // ---- wings (behind body)
  const veins = (base: Point, tip: Point) => sk.line(lineD([base, lerpP(base, tip, 0.8)]), pen.fw, { halo: dark });
  const drawWing = (base: Point, ang: number, len: number, wid: number, fill: string, shape: "fore" | "hind" | "long") => {
    const tip = polar(base, len, ang);
    const nrm = ang - Math.PI / 2;
    let pts: Point[];
    if (shape === "long") pts = [base, polar(lerpP(base, tip, 0.3), wid * 0.5, nrm), polar(lerpP(base, tip, 0.8), wid * 0.55, nrm), tip, polar(lerpP(base, tip, 0.7), wid * 0.35, nrm + Math.PI), polar(lerpP(base, tip, 0.25), wid * 0.3, nrm + Math.PI)];
    else if (shape === "fore") pts = [base, polar(lerpP(base, tip, 0.45), wid * 0.62, nrm), polar(lerpP(base, tip, 0.95), wid * 0.55, nrm), tip, polar(lerpP(base, tip, 0.6), wid * 0.5, nrm + Math.PI), polar(lerpP(base, tip, 0.15), wid * 0.25, nrm + Math.PI)];
    else pts = [base, polar(lerpP(base, tip, 0.4), wid * 0.6, nrm), tip, polar(lerpP(base, tip, 0.7), wid * 0.55, nrm + Math.PI), polar(lerpP(base, tip, 0.25), wid * 0.45, nrm + Math.PI)];
    sk.shape(blobD(pts, 0.45), fill);
    if (sp === "butterfly") {
      // eye-spot + dark border
      const c = lerpP(base, tip, shape === "fore" ? 0.62 : 0.55);
      sk.shape(circleD(polar(c, wid * 0.05, nrm), wid * 0.14), fillOf("black", pen), { outline: false, edge: false });
      sk.fill(circleD(polar(c, wid * 0.05, nrm), wid * 0.05), PAPER);
      veins(base, polar(lerpP(base, tip, 0.9), wid * 0.3, nrm));
      veins(base, polar(lerpP(base, tip, 0.8), wid * 0.25, nrm + Math.PI));
    } else if (sp === "dragonfly") {
      veins(base, tip);
      sk.fill(circleD(polar(lerpP(base, tip, 0.9), wid * 0.1, nrm), wid * 0.14), INK);
    } else {
      veins(base, lerpP(base, tip, 0.9));
    }
  };

  if (front) {
    // front / back: wings splayed symmetric, body vertical
    const C = P(0, -legLen - H * (sp === "dragonfly" ? 0.75 : sp === "bee" ? 0.55 : 0.3) - lift);
    const spread = fly ? 1 : 0.55;
    for (const side of [-1, 1]) {
      const base = addP(C, P(side * hr * 0.4, -hr * 0.3));
      if (sp === "dragonfly") {
        drawWing(base, (side > 0 ? -12 : 192) * DEG, H * 0.85, H * 0.18, fillOf(lighter(tone), pen), "long");
        drawWing(addP(base, P(0, hr * 0.5)), (side > 0 ? 12 : 168) * DEG, H * 0.75, H * 0.16, fillOf(lighter(tone), pen), "long");
      } else {
        const up = side > 0 ? -60 + (1 - spread) * -25 : -120 + (1 - spread) * 25;
        drawWing(base, up * DEG, H * (sp === "bee" ? 0.45 : 0.72), H * (sp === "bee" ? 0.28 : 0.5), sp === "bee" ? fillOf("white", pen) : wingFill, "fore");
        drawWing(addP(base, P(0, hr * 0.6)), (side > 0 ? 25 : 155) * DEG, H * (sp === "bee" ? 0.3 : 0.48), H * (sp === "bee" ? 0.2 : 0.4), sp === "bee" ? fillOf("white", pen) : wingFill, "hind");
      }
    }
    // abdomen
    if (sp === "bee") {
      sk.shape(ellipseD(addP(C, P(0, hr * 1.6)), hr * 1.05, hr * 1.2), fillOf("white", pen), { edge: false });
      for (const dy of [1.2, 1.9]) sk.shape(ellipseD(addP(C, P(0, hr * dy)), hr * 1.0, hr * 0.22), INK, { outline: false });
    } else sk.shape(taperD([addP(C, P(0, hr * 0.5)), addP(C, P(0, Math.min(hr * (sp === "dragonfly" ? 4.4 : 2.6), -C.y - hr * 0.4)))], [hr * 0.9, hr * 0.35], { samples: 2 }), bodyFill, { edge: false });
    // legs
    for (const side of [-1, 1]) {
      for (const k of [0, 1]) {
        const a = addP(C, P(side * hr * 0.3, hr * (0.7 + k * 0.3)));
        const f = P(side * hr * (1.1 + k * 0.4), fly ? a.y + legLen : -pen.lw);
        sk.line(lineD([a, P((a.x + f.x) / 2 + side * hr * 0.3, (a.y + f.y) / 2 - legLen * 0.2), f]), pen.dw * 1.2);
      }
    }
    const Hc = addP(C, P(0, -hr * 0.9));
    sk.shape(circleD(Hc, hr), sp === "bee" ? fillOf("dark", pen) : bodyFill, { edge: false });
    for (const side of [-1, 1]) {
      const a0 = addP(Hc, P(side * hr * 0.35, -hr * 0.8));
      const a1 = addP(Hc, P(side * hr * 1.2, -hr * 2.4));
      sk.line(curveD([a0, addP(lerpP(a0, a1, 0.5), P(side * hr * 0.3, 0)), a1]), pen.dw * 1.2);
      sk.shape(circleD(a1, hr * 0.22), INK);
    }
    if (!back) sk.raw(drawFace({ c: addP(Hc, P(0, -hr * 0.12)), gap: hr * 0.42, eyeR: hr * (sp === "dragonfly" ? 0.4 : 0.32), turn: 0, pen, headR: hr, dark: sp === "bee" || isDark(darker(tone)), mouth: { dy: hr * 0.55, w: hr * 0.42 }, talking }, expression));
    hand = addP(C, P(hr * 1.5, hr * 0.8));
    return { sk, head: Hc, headR: hr, mouth: addP(Hc, P(0, hr * 0.5)), hand, waist: C.y + hr, shoulders: C.y - hr * 0.1 };
  }

  // ---- side view
  if (sp === "butterfly") {
    if (fly) {
      drawWing(rel(-hr * 0.2, -hr * 0.3), -95 * DEG + tilt, H * 0.62, H * 0.42, fillOf(darker(tone), pen), "fore");
      drawWing(rel(-hr * 0.3, -hr * 0.1), -150 * DEG + tilt, H * 0.42, H * 0.34, fillOf(darker(tone), pen), "hind");
    }
    const up = fly ? -70 : cower ? -135 : -98;
    drawWing(rel(-hr * 0.4, -hr * 0.1), (up - 52) * DEG + tilt, H * 0.46, H * 0.36, wingFill, "hind");
    drawWing(rel(-hr * 0.1, -hr * 0.4), (up + 4) * DEG + tilt, H * 0.64, H * 0.44, wingFill, "fore");
  } else if (sp === "dragonfly") {
    const lf = fillOf(lighter(tone), pen);
    const a = fly ? 32 : 20;
    drawWing(rel(-hr * 0.4, -hr * 0.3), (180 + a + 14) * DEG + tilt, H * 0.9, H * 0.2, fillOf(darker(lighter(tone)), pen), "long");
    drawWing(rel(-hr * 0.1, -hr * 0.4), (180 + a - 16) * DEG + tilt, H * 0.95, H * 0.22, lf, "long");
  } else {
    drawWing(rel(-hr * 0.2, -hr * 0.6), (fly ? -120 : -140) * DEG + tilt, H * 0.42, H * 0.26, fillOf("white", pen), "fore");
    drawWing(rel(-hr * 0.35, -hr * 0.5), (fly ? -150 : -160) * DEG + tilt, H * 0.3, H * 0.2, fillOf("white", pen), "hind");
  }
  // perch stem
  if (perch) {
    const sy = -H * 0.06;
    sk.shape(taperD([P(-H * 0.55, sy + H * 0.02), P(0, sy), P(H * 0.5, sy - H * 0.02)], [H * 0.07, H * 0.06, H * 0.05], { samples: 3 }), fillOf("dark", pen), { edge: pen.dw });
  }
  // legs (far first, thin ink)
  const groundY = perch ? -H * 0.1 : fly ? thorax.y + legLen * 1.2 : 0;
  const legX = [-0.4, 0.1, 0.55];
  legX.forEach((lx, i) => {
    const a = rel(hr * lx * 0.8, hr * 0.5);
    const foot = fly ? rel(hr * (lx - 0.8), hr * 0.5 + legLen) : P(a.x + (i - 1) * legLen * 0.55, groundY);
    const knee = P((a.x + foot.x) / 2 + legLen * 0.25 * (i - 1), Math.min(a.y, foot.y) - legLen * 0.15);
    sk.line(lineD([a, knee, foot]), pen.dw * 1.25);
  });
  // abdomen
  if (sp === "butterfly") {
    sk.shape(taperD([rel(-hr * 0.3, hr * 0.1), rel(-hr * 1.6, hr * 0.5), rel(-hr * 2.6, hr * 0.7)], [hr * 0.8, hr * 0.6, hr * 0.3], { samples: 3 }), bodyFill, { edge: false });
  } else if (sp === "dragonfly") {
    const pts = [rel(-hr * 0.4, 0), rel(-hr * 2.4, hr * 0.1), rel(-hr * 4.6, hr * (cower ? 1.5 : 0.25)), rel(-hr * 6.2, hr * (cower ? 2.8 : 0.1))];
    sk.shape(taperD(pts, [hr * 0.65, hr * 0.42, hr * 0.36, hr * 0.28], { samples: 5 }), bodyFill, { edge: false });
    for (let i = 1; i < 6; i += 1) {
      const p = lerpP(pts[1], pts[3], i / 6);
      sk.line(lineD([addP(p, P(0, -hr * 0.3)), addP(p, P(0, hr * 0.3))]), pen.fw, { halo: isDark(darker(tone)) });
    }
  } else {
    const ac = rel(-hr * 1.3, hr * 0.35);
    sk.shape(ellipseD(ac, hr * 1.35, hr * 1.05), fillOf("white", pen), { edge: false });
    for (const dx of [-0.35, 0.35]) {
      const c = addP(ac, P(dx * hr * 1.35, 0));
      sk.shape(blobD([addP(c, P(-hr * 0.2, -hr * 0.95)), addP(c, P(hr * 0.22, -hr * 0.92)), addP(c, P(hr * 0.2, hr * 0.92)), addP(c, P(-hr * 0.22, hr * 0.95))], 0.4), fillOf(tone === "white" ? "black" : tone === "stripes" ? "black" : darker(tone), pen), { outline: false, edge: false });
    }
    sk.shape(taperD([addP(ac, P(-hr * 1.25, 0)), addP(ac, P(-hr * 1.75, hr * 0.1))], [hr * 0.3, hr * 0.02], { samples: 2 }), INK);
  }
  // thorax
  sk.shape(ellipseD(thorax, hr * (sp === "bee" ? 0.9 : 0.7), hr * (sp === "bee" ? 0.85 : 0.62)), sp === "bee" ? fillOf("dense_dots", pen) : bodyFill, { edge: false });
  // head
  const Hc = rel(hr * 1.2, -hr * 0.35);
  // antennae
  const antBase = addP(Hc, P(hr * 0.2, -hr * 0.8));
  const ant = (dx: number, len: number) => {
    const tip = addP(antBase, rotP(P(hr * dx, -hr * len), tilt));
    sk.line(curveD([antBase, addP(lerpP(antBase, tip, 0.5), P(hr * 0.35, 0)), tip]), pen.dw * 1.15);
    if (sp !== "dragonfly") sk.shape(circleD(tip, hr * 0.2), INK);
  };
  if (sp !== "dragonfly") {
    ant(0.3, 2.3);
    ant(1.2, 2.0);
  }
  sk.shape(circleD(Hc, hr), sp === "bee" ? fillOf("dark", pen) : bodyFill, { edge: false });
  const faceDark = sp === "bee" || isDark(darker(tone));
  const x = EXPR[expression];
  void x;
  sk.raw(
    drawFace(
      { c: addP(Hc, P(hr * 0.12, -hr * 0.12)), gap: hr * 0.4, eyeR: hr * (sp === "dragonfly" ? 0.42 : 0.34), turn: 0.5, pen, headR: hr, dark: faceDark, mouth: { dy: hr * 0.55, w: hr * 0.42, dx: hr * 0.05 }, talking, rot: tilt },
      expression,
    ),
  );
  const mouth = addP(Hc, P(hr * 0.5, hr * 0.5));
  // gesture: front leg raised
  if (pose === "talk" || pose === "wave" || pose === "point") {
    sk.layer();
    const a = rel(hr * 0.6, hr * 0.4);
    const tip = pose === "wave" ? addP(a, P(hr * 0.6, -hr * 2.2)) : pose === "point" ? addP(a, P(hr * 2.4, -hr * 0.3)) : addP(a, P(hr * 1.6, -hr * 1.0));
    sk.line(lineD([a, addP(lerpP(a, tip, 0.5), P(0, hr * 0.3)), tip]), pen.dw * 1.4);
    hand = tip;
  } else if (!fly) {
    hand = rel(hr * 0.9, hr * 0.5 + legLen * 0.5);
  } else hand = rel(hr * 0.2, hr * 0.5 + legLen);
  void mouthOpen;
  return { sk, head: Hc, headR: hr, mouth, hand, waist: thorax.y + hr * 0.4, shoulders: thorax.y - hr * 0.3 };
}

export const insectRig: KindRig<InsectLook> = {
  supportedPoses: () => POSES,
  supportedExpressions: () => ALL_EXPRESSIONS,
  nominalHeight: (look) => HEIGHT[look.species] ?? 8,
  draw(request: FigureRequest & { look: InsectLook }, ctx: DrawContext): FigureDrawing {
    const look = request.look;
    if (!(look.species in HEIGHT)) throw new Error(`unknown insect species ${String(look.species)}`);
    const pose = POSES.includes(request.pose) ? request.pose : "stand";
    const pen = makePen(request.lineWidth, ctx.idPrefix);
    const facing = request.facing === "left" ? "right" : request.facing;
    const b = drawInsect(look.species, look, pose, request.expression, facing, pen);
    const anchors = anchorsFrom(b.sk, { head: b.head, headRadius: b.headR, mouth: b.mouth, hand: b.hand, waist: b.waist, shoulders: b.shoulders });
    return finishFigure(b.sk, anchors);
  },
};
