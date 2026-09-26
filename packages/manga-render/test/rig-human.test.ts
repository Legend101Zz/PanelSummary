import { describe, expect, it } from "vitest";
import {
  ACCESSORIES,
  CROWD_TYPES,
  EXPRESSIONS,
  FACIAL_HAIR,
  FACINGS,
  HAIR_STYLES,
  HEADWEAR,
  HUMAN_AGES,
  HUMAN_BUILDS,
  HUMAN_FRAMES,
  HUMAN_HEIGHTS,
  MATERIALS,
  OUTFITS,
  POSES,
  SKIN_TONES,
  TONES,
  type CrowdLook,
  type Expression,
  type Facing,
  type HumanLook,
  type Pose,
} from "../src/contracts.js";
import type { FigureDrawing } from "../src/internal.js";
import { humanRig } from "../src/rig/human.js";
import { crowdRig, CROWD_POSES } from "../src/rig/crowd.js";
import { rig, seatContact } from "../src/rig/index.js";
import { lodFor } from "../src/rig/human/draw.js";
import { pathPoints } from "../src/env/compact.js";

const PREFIX = "pg7-";
const ctx = { idPrefix: PREFIX, rand: () => 0.5 };

const base: HumanLook = {
  kind: "human",
  age: "adult",
  build: "average",
  height: "average",
  frame: "neutral",
  hair: "short",
  hair_tone: "dark",
  facial_hair: "none",
  outfit: "tunic",
  outfit_tone: "light",
  headwear: "none",
  accessories: [],
  skin: "light",
  material: "flesh",
};
const L = (p: Partial<HumanLook> = {}): HumanLook => ({ ...base, ...p });

function draw(look: HumanLook, pose: Pose = "stand", expression: Expression = "neutral", facing: Facing = "right", seed = 42): FigureDrawing {
  return humanRig.draw({ look, pose, expression, facing, lineWidth: 0.8, seed }, ctx);
}

/** Structural checks every drawing must pass. */
function checkDrawing(d: FigureDrawing, label: string): void {
  const { svg, anchors: a } = d;
  expect(svg.length, label).toBeGreaterThan(200);
  expect(svg, label).not.toMatch(/NaN|Infinity|undefined/);
  expect(svg, label).not.toMatch(/<image|<foreignObject|<script|\sclass=|preserveAspectRatio="none"/);
  for (const m of svg.matchAll(/\sid="([^"]+)"/g)) expect(m[1].startsWith(PREFIX), `${label} id ${m[1]}`).toBe(true);
  for (const m of svg.matchAll(/url\(#([^)]+)\)/g)) expect(m[1].startsWith(PREFIX), `${label} ref ${m[1]}`).toBe(true);
  // Balanced tags (cheap well-formedness check).
  expect((svg.match(/<g[\s>]/g) ?? []).length, label).toBe((svg.match(/<\/g>/g) ?? []).length);
  const nums = [a.head.x, a.head.y, a.headRadius, a.mouth.x, a.mouth.y, a.top, a.left, a.right, a.waist, a.shoulders];
  if (a.hand) nums.push(a.hand.x, a.hand.y);
  for (const v of nums) expect(Number.isFinite(v), `${label} anchor finite`).toBe(true);
  expect(a.headRadius, label).toBeGreaterThan(0);
  expect(a.top, label).toBeLessThan(0);
  expect(a.left, label).toBeLessThan(a.right);
  // Head, mouth and hand sit inside the drawing's extent.
  for (const p of [a.head, a.mouth, ...(a.hand ? [a.hand] : [])]) {
    expect(p.x, `${label} x in bounds`).toBeGreaterThanOrEqual(a.left - 1e-6);
    expect(p.x, `${label} x in bounds`).toBeLessThanOrEqual(a.right + 1e-6);
    expect(p.y, `${label} y below top`).toBeGreaterThanOrEqual(a.top - 1e-6);
    expect(p.y, `${label} y above ground`).toBeLessThanOrEqual(0.5);
  }
  const mouthDist = Math.hypot(a.mouth.x - a.head.x, a.mouth.y - a.head.y);
  expect(mouthDist, `${label} mouth near head`).toBeLessThan(a.headRadius * 1.6);
  // Every number in the fragment is finite and compact (max 2 decimals).
  expect(svg, label).not.toMatch(/\d\.\d{3,}/);
}

describe("human rig: vocabulary", () => {
  it("supports every pose except fly and perch", () => {
    const poses = humanRig.supportedPoses(base);
    expect(poses).not.toContain("fly");
    expect(poses).not.toContain("perch");
    for (const p of POSES) if (p !== "fly" && p !== "perch") expect(poses).toContain(p);
    expect(humanRig.supportedExpressions(base)).toEqual(EXPRESSIONS);
  });

  it("nominal height follows age and height", () => {
    expect(humanRig.nominalHeight(base)).toBe(100);
    expect(humanRig.nominalHeight(L({ height: "giant" }))).toBeCloseTo(180);
    expect(humanRig.nominalHeight(L({ height: "short" }))).toBeCloseTo(90);
    expect(humanRig.nominalHeight(L({ age: "child" }))).toBeLessThan(70);
    expect(rig.nominalHeight(base)).toBe(100);
  });

  it("rejects unsupported poses loudly", () => {
    expect(() => draw(base, "fly")).toThrow();
    expect(() => draw(base, "perch")).toThrow();
  });
});

describe("human rig: every pose and facing", () => {
  const poses = humanRig.supportedPoses(base);
  for (const pose of poses) {
    it(`draws ${pose} in all facings`, () => {
      for (const facing of FACINGS) {
        const d = draw(L({ outfit: "long_coat", accessories: ["scarf", "cane"] }), pose, "neutral", facing);
        checkDrawing(d, `${pose}/${facing}`);
        const a = d.anchors;
        const standing = !["lie", "fall", "jump", "bow", "cower", "kneel", "sit"].includes(pose);
        if (standing) {
          expect(a.shoulders, `${pose} shoulders above waist`).toBeLessThan(a.waist);
          expect(a.head.y, `${pose} head above shoulders`).toBeLessThan(a.shoulders);
          expect(a.top, `${pose} height`).toBeLessThan(-85);
          // Raised hands may rise above the head.
          expect(a.top, `${pose} height`).toBeGreaterThan(pose === "wave" || pose === "reach" ? -135 : -115);
        }
        if (pose === "jump" || pose === "fall") expect(a.top).toBeLessThan(-60);
        if (pose === "lie") expect(a.top).toBeGreaterThan(-45);
      }
    });
  }

  it("puts the grip in front of the body for hold/carry/point/reach (facing right)", () => {
    for (const pose of ["hold", "carry", "point", "reach"] as const) {
      const a = draw(base, pose).anchors;
      expect(a.hand, pose).toBeDefined();
      expect(a.hand!.x, pose).toBeGreaterThan(a.head.x);
    }
    const point = draw(base, "point").anchors;
    expect(point.hand!.x).toBeGreaterThan(20);
    const hold = draw(base, "hold").anchors;
    expect(hold.hand!.y).toBeGreaterThan(hold.shoulders);
    expect(hold.hand!.y).toBeLessThan(0);
  });

  it("stands on the ground and jumps off it", () => {
    const bottom = (svg: string) => {
      let low = -Infinity;
      for (const m of svg.matchAll(/ d="([^"]+)"/g)) {
        for (const seg of m[1].matchAll(/([MLCQA])([^MLCQAZ]*)/g)) {
          const nums = seg[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
          const ys = seg[1] === "A" ? [nums[6]] : nums.filter((_, i) => i % 2 === 1);
          for (const y of ys) if (Number.isFinite(y)) low = Math.max(low, y);
        }
      }
      return low;
    };
    const stand = draw(base, "stand");
    expect(Math.abs(bottom(stand.svg))).toBeLessThan(2.5);
    const jump = draw(base, "jump");
    expect(bottom(jump.svg)).toBeLessThan(-8);
  });
});

describe("human rig: faces", () => {
  it("draws every expression in front, 3/4 and back views, and they differ", () => {
    for (const facing of ["front", "right", "back"] as const) {
      const seen = new Set<string>();
      for (const e of EXPRESSIONS) {
        const d = draw(L({ age: "teen", frame: "fem", hair: "long_straight" }), "stand", e, facing);
        checkDrawing(d, `${e}/${facing}`);
        seen.add(d.svg);
      }
      // Front and 3/4 render 18 distinct faces. The back view shows no face,
      // but acting (head tilt, lean, shoulder drop) still tells most apart.
      if (facing === "back") expect(seen.size).toBeGreaterThanOrEqual(12);
      else expect(seen.size).toBe(EXPRESSIONS.length);
    }
  });

  it("covers every age, frame, build, height, skin and material", () => {
    for (const age of HUMAN_AGES)
      for (const frame of HUMAN_FRAMES)
        for (const build of HUMAN_BUILDS) checkDrawing(draw(L({ age, frame, build }), "talk", "happy"), `${age}/${frame}/${build}`);
    for (const height of HUMAN_HEIGHTS) checkDrawing(draw(L({ height }), "walk"), height);
    for (const skin of SKIN_TONES) for (const material of MATERIALS) checkDrawing(draw(L({ skin, material }), "talk", "sad", "front"), `${skin}/${material}`);
    const tall = draw(L({ height: "giant" })).anchors;
    expect(tall.top).toBeLessThan(-170);
    const kid = draw(L({ age: "child" })).anchors;
    expect(kid.top).toBeGreaterThan(-70);
  });
});

describe("human rig: hair, clothes, accessories", () => {
  it("draws every hair style and facial hair in every view with distinct silhouettes", () => {
    for (const facing of ["front", "right", "back"] as const) {
      const svgs = new Set<string>();
      for (const hair of HAIR_STYLES) {
        const d = draw(L({ hair }), "stand", "neutral", facing);
        checkDrawing(d, `${hair}/${facing}`);
        svgs.add(d.svg);
      }
      expect(svgs.size).toBe(HAIR_STYLES.length);
    }
    for (const facial_hair of FACIAL_HAIR) for (const facing of ["front", "right"] as const) checkDrawing(draw(L({ facial_hair }), "talk", "shout", facing), facial_hair);
  });

  it("draws every outfit, headwear, accessory and tone", () => {
    for (const outfit of OUTFITS)
      for (const pose of ["stand", "run", "sit", "lie"] as const)
        for (const facing of ["right", "front", "back"] as const) checkDrawing(draw(L({ outfit }), pose, "neutral", facing), `${outfit}/${pose}/${facing}`);
    for (const headwear of HEADWEAR) for (const facing of FACINGS) checkDrawing(draw(L({ headwear, hair: "long_wavy" }), "stand", "neutral", facing), headwear);
    for (const acc of ACCESSORIES) for (const pose of ["stand", "point", "run"] as const) for (const facing of FACINGS) checkDrawing(draw(L({ accessories: [acc] }), pose, "neutral", facing), `${acc}/${pose}/${facing}`);
    checkDrawing(draw(L({ accessories: [...ACCESSORIES] }), "carry"), "all accessories");
    for (const tone of TONES) checkDrawing(draw(L({ outfit_tone: tone, hair_tone: tone }), "stand"), tone);
  });

  it("references tone patterns only through the page prefix", () => {
    const d = draw(L({ outfit_tone: "dots", hair_tone: "stripes", material: "flesh", headwear: "crown" }));
    expect(d.svg).toContain(`url(#${PREFIX}tone-dots)`);
    expect(d.svg).toContain(`url(#${PREFIX}tone-gold)`);
  });
});

describe("human rig: determinism and size", () => {
  it("is byte-identical for the same seed and varies with the seed", () => {
    const look = L({ hair: "messy", facial_hair: "stubble", outfit: "rags" });
    const a = draw(look, "walk", "happy", "right", 5);
    const b = draw(look, "walk", "happy", "right", 5);
    expect(a.svg).toBe(b.svg);
    expect(a.anchors).toEqual(b.anchors);
    const c = draw(look, "walk", "happy", "right", 6);
    expect(c.svg).not.toBe(a.svg);
    // Seeded variation is small: the figure keeps its size.
    expect(Math.abs(c.anchors.top - a.anchors.top)).toBeLessThan(3);
  });

  it("does not depend on ctx.rand", () => {
    const look = L({ hair: "spiky" });
    const a = humanRig.draw({ look, pose: "stand", expression: "neutral", facing: "right", lineWidth: 1, seed: 3 }, { idPrefix: PREFIX, rand: () => 0.1 });
    const b = humanRig.draw({ look, pose: "stand", expression: "neutral", facing: "right", lineWidth: 1, seed: 3 }, { idPrefix: PREFIX, rand: () => 0.9 });
    expect(a.svg).toBe(b.svg);
  });

  it("keeps a figure compact", () => {
    const d = draw(L({ outfit: "royal", accessories: ["cape", "sword_belt", "medal"], headwear: "crown", hair: "long_wavy" }), "walk");
    expect(d.svg.length).toBeLessThan(60_000);
  });
});

describe("crowd rig", () => {
  it("supports its pose set", () => {
    const look: CrowdLook = { kind: "crowd", crowd: "townsfolk", size: "few" };
    expect([...crowdRig.supportedPoses(look)].sort()).toEqual([...CROWD_POSES].sort());
    expect(crowdRig.supportedPoses(look)).not.toContain("sit");
  });

  it("draws every crowd type, size, pose and facing deterministically", { timeout: 30_000 }, () => {
    for (const crowd of CROWD_TYPES)
      for (const size of ["few", "many"] as const) {
        const look: CrowdLook = { kind: "crowd", crowd, size };
        for (const pose of CROWD_POSES)
          for (const facing of FACINGS) {
            const req = { look, pose, expression: "happy" as const, facing, lineWidth: 0.8, seed: 9 };
            const d = crowdRig.draw(req, ctx);
            checkDrawing(d, `${crowd}/${size}/${pose}/${facing}`);
            const members = (d.svg.match(/<g transform=/g) ?? []).length;
            if (size === "few") expect(members).toBe(3);
            else {
              expect(members).toBeGreaterThanOrEqual(6);
              expect(members).toBeLessThanOrEqual(8);
            }
          }
        const req = { look, pose: "talk" as const, expression: "neutral" as const, facing: "right" as const, lineWidth: 0.8, seed: 4 };
        expect(crowdRig.draw(req, ctx).svg).toBe(crowdRig.draw(req, ctx).svg);
      }
  });

  it("dispatches through the rig index", () => {
    const d = rig.draw({ look: { kind: "crowd", crowd: "soldiers", size: "many" }, pose: "walk", expression: "determined", facing: "right", lineWidth: 1, seed: 2 }, ctx);
    checkDrawing(d, "index crowd");
    expect(d.anchors.right - d.anchors.left).toBeGreaterThan(60);
  });
});

// ---------------------------------------------------------------------------
// Pass 2: knockout rim, level of detail, acting, seats, dispatcher output
// ---------------------------------------------------------------------------


describe("human rig: knockout rim", () => {
  it("draws a paper rim under the silhouette by default, via one shared path", () => {
    const d = draw(L({ outfit: "long_coat", outfit_tone: "black" }));
    const uses = [...d.svg.matchAll(/<use href="#([^"]+)"([^>]*)\/>/g)];
    expect(uses.length).toBe(2);
    expect(uses[0][2]).toContain('stroke="#ffffff"');
    const rimW = Number(/stroke-width="([\d.]+)"/.exec(uses[0][2])![1]);
    const inkW = Number(/stroke-width="([\d.]+)"/.exec(uses[1][2])![1]);
    // 3-5 page units each side: at lineWidth 0.8 (scale 3.25) that is ~1-1.5 figure units
    expect((rimW - inkW) / 2).toBeGreaterThan((3 * 0.8) / 2.6);
    expect((rimW - inkW) / 2).toBeLessThan((5 * 0.8) / 2.6);
    for (const u of uses) expect(d.svg).toContain(`id="${u[1]}"`);
    const none = humanRig.draw({ look: base, pose: "stand", expression: "neutral", facing: "right", lineWidth: 0.8, seed: 42, rim: false }, ctx);
    expect(none.svg).not.toContain("<use");
    expect(none.anchors).toEqual(draw(base).anchors);
  });

  it("crowds get one rim under the front row", () => {
    const look: CrowdLook = { kind: "crowd", crowd: "townsfolk", size: "many" };
    const req = { look, pose: "stand" as const, expression: "neutral" as const, facing: "right" as const, lineWidth: 0.8, seed: 9 };
    const withRim = crowdRig.draw(req, ctx).svg;
    expect(withRim.startsWith(`<g fill="#ffffff" stroke="#ffffff"`)).toBe(true);
    expect(crowdRig.draw({ ...req, rim: false }, ctx).svg.startsWith(`<g fill="#ffffff"`)).toBe(false);
  });
});

describe("human rig: level of detail", () => {
  it("reduced and silhouette drop detail but keep the anchors", () => {
    const look = L({ age: "elder", facial_hair: "beard", outfit: "suit", accessories: ["glasses", "medal"] });
    const at = (detail: "full" | "reduced" | "silhouette") => humanRig.draw({ look, pose: "talk", expression: "happy", facing: "right", lineWidth: 0.3, seed: 4, detail }, ctx);
    const full = at("full");
    const reduced = at("reduced");
    const sil = at("silhouette");
    expect(reduced.svg.length).toBeLessThan(full.svg.length);
    expect(sil.svg.length).toBeLessThan(reduced.svg.length);
    for (const d of [reduced, sil]) {
      expect(d.anchors.head.x).toBeCloseTo(full.anchors.head.x, 1);
      expect(d.anchors.head.y).toBeCloseTo(full.anchors.head.y, 1);
      expect(d.anchors.headRadius).toBeCloseTo(full.anchors.headRadius, 5);
    }
    checkDrawing(reduced, "reduced");
    checkDrawing(sil, "silhouette");
  });

  it("lowers the detail by itself when the head is small on the page", () => {
    expect(lodFor("full", 9, 2.6 / 5)).toBe("full"); // 45 px head radius
    expect(lodFor("full", 9, 2.6 / 2.5)).toBe("reduced"); // 22.5 px
    expect(lodFor("full", 9, 2.6 / 1.5)).toBe("silhouette"); // 13.5 px
    expect(lodFor("silhouette", 9, 0.1)).toBe("silhouette"); // never raised above the request
  });
});

describe("human rig: acting", () => {
  const at = (expression: Expression, facing: Facing = "right", pose: Pose = "stand") => draw(L({ outfit: "suit" }), pose, expression, facing).anchors;

  it("sad and tired hang the head, afraid leans back, angry leans in", () => {
    const n0 = at("neutral");
    expect(at("sad").head.y).toBeGreaterThan(n0.head.y + 0.4);
    expect(at("tired").head.y).toBeGreaterThan(n0.head.y + 0.4);
    expect(at("afraid").head.x).toBeLessThan(n0.head.x - 0.8);
    expect(at("angry").head.x).toBeGreaterThan(n0.head.x + 0.8);
    // determined lifts the chin: the mouth moves forward/up relative to the head
    const det = at("determined");
    expect(det.mouth.y - det.head.y).toBeLessThan(n0.mouth.y - n0.head.y + 0.01);
  });

  it("anchors follow the pose: the mouth stays on the face and the feet stay down", () => {
    for (const e of EXPRESSIONS) {
      for (const pose of ["stand", "sit", "walk", "lie"] as const) {
        const d = draw(L(), pose, e, "right");
        checkDrawing(d, `${pose}/${e}`);
        const a = d.anchors;
        expect(Math.hypot(a.mouth.x - a.head.x, a.mouth.y - a.head.y)).toBeLessThan(a.headRadius);
      }
    }
  });

  it("seat contact follows the sitting pose for every age", () => {
    for (const age of HUMAN_AGES) {
      const c = seatContact(L({ age }), "sit", "right", 42);
      const d = draw(L({ age }), "sit", "neutral", "right");
      expect(c.y).toBeLessThan(0);
      expect(c.y).toBeGreaterThan(d.anchors.waist);
      expect(c.x).toBeGreaterThan(d.anchors.left);
      expect(c.x).toBeLessThan(d.anchors.right);
    }
  });
});

describe("rig dispatcher output", () => {
  it("compacts path data without moving geometry and keeps hygiene", () => {
    const req = { look: L({ outfit: "royal", headwear: "crown" }), pose: "walk" as const, expression: "happy" as const, facing: "right" as const, lineWidth: 0.8, seed: 3 };
    const raw = humanRig.draw(req, ctx);
    const out = rig.draw(req, ctx);
    expect(out.svg.length).toBeLessThan(raw.svg.length * 0.85);
    expect(out.anchors).toEqual(raw.anchors);
    const a = [...raw.svg.matchAll(/ d="([^"]*)"/g)].map((m) => pathPoints(m[1]));
    const b = [...out.svg.matchAll(/ d="([^"]*)"/g)].map((m) => pathPoints(m[1]));
    expect(b.length).toBe(a.length);
    a.forEach((pts, i) => pts.forEach((p, j) => expect(Math.hypot(p.x - b[i][j].x, p.y - b[i][j].y)).toBeLessThan(0.011)));
  });
});
