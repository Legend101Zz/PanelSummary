import { describe, expect, it } from "vitest";
import {
  ANIMAL_SPECIES,
  BIRD_SPECIES,
  EMBLEMS,
  INSECT_SPECIES,
  OBJECT_SHAPES,
  PLANT_SPECIES,
  SPIRIT_TYPES,
  type CharacterLook,
  type Expression,
  type Facing,
  type Pose,
} from "../src/contracts.js";
import type { FigureDrawing } from "../src/internal.js";
import { birdRig } from "../src/rig/bird.js";
import { animalRig } from "../src/rig/animal.js";
import { insectRig } from "../src/rig/insect.js";
import { objectRig } from "../src/rig/object.js";
import { plantRig } from "../src/rig/plant.js";
import { spiritRig } from "../src/rig/spirit.js";
import { emblemRig } from "../src/rig/emblem.js";
import type { KindRig } from "../src/rig/kind.js";

const PREFIX = "pg7-";
const ctx = () => ({ idPrefix: PREFIX, rand: () => 0.5 });

interface Case {
  name: string;
  look: CharacterLook;
  rig: KindRig;
}

const cases: Case[] = [
  ...BIRD_SPECIES.map((species) => ({ name: `bird ${species}`, look: { kind: "bird", species, tone: "dots" } as CharacterLook, rig: birdRig as KindRig })),
  ...ANIMAL_SPECIES.map((species) => ({ name: `animal ${species}`, look: { kind: "animal", species, tone: "light" } as CharacterLook, rig: animalRig as KindRig })),
  ...INSECT_SPECIES.map((species) => ({ name: `insect ${species}`, look: { kind: "insect", species, tone: "dots" } as CharacterLook, rig: insectRig as KindRig })),
  ...OBJECT_SHAPES.flatMap((shape) =>
    [true, false].map((face) => ({ name: `object ${shape}${face ? "" : " (faceless)"}`, look: { kind: "object", shape, tone: "white", face } as CharacterLook, rig: objectRig as KindRig })),
  ),
  ...PLANT_SPECIES.flatMap((species) =>
    [true, false].map((face) => ({ name: `plant ${species}${face ? "" : " (faceless)"}`, look: { kind: "plant", species, tone: "dots", face } as CharacterLook, rig: plantRig as KindRig })),
  ),
  ...SPIRIT_TYPES.map((element) => ({ name: `spirit ${element}`, look: { kind: "spirit", element } as CharacterLook, rig: spiritRig as KindRig })),
  ...EMBLEMS.map((emblem) => ({ name: `emblem ${emblem}`, look: { kind: "emblem", emblem } as CharacterLook, rig: emblemRig as KindRig })),
];

const FACINGS: Facing[] = ["right", "front", "back"];

function draw(c: Case, pose: Pose, expression: Expression, facing: Facing, seed = 11, lineWidth?: number): FigureDrawing {
  const h = c.rig.nominalHeight(c.look);
  return c.rig.draw({ look: c.look, pose, expression, facing, lineWidth: lineWidth ?? h / 180, seed }, ctx());
}

/** Largest y of any coordinate in any path (figure space, ground = 0). */
function maxY(svg: string): number {
  let max = -Infinity;
  for (const m of svg.matchAll(/ d="([^"]+)"/g)) {
    const nums = m[1].match(/-?\d*\.?\d+/g) ?? [];
    for (let i = 1; i < nums.length; i += 2) max = Math.max(max, Number(nums[i]));
  }
  return max;
}

function checkDrawing(c: Case, d: FigureDrawing, label: string): void {
  const h = c.rig.nominalHeight(c.look);
  const a = d.anchors;
  const nums = [a.head.x, a.head.y, a.headRadius, a.mouth.x, a.mouth.y, a.top, a.left, a.right, a.waist, a.shoulders];
  if (a.hand) nums.push(a.hand.x, a.hand.y);
  for (const v of nums) expect(Number.isFinite(v), `${label}: finite anchors`).toBe(true);
  expect(d.svg.length, `${label}: non-empty`).toBeGreaterThan(50);
  expect(d.svg, `${label}: no NaN`).not.toMatch(/NaN|Infinity/);
  expect(a.headRadius, `${label}: head radius`).toBeGreaterThan(0);
  expect(a.top, `${label}: top above ground`).toBeLessThan(0);
  expect(a.left, `${label}: left<right`).toBeLessThan(a.right);
  // anchors sit inside the drawing bounds (with a small tolerance)
  const tol = h * 0.08;
  for (const [nm, p] of [
    ["head", a.head],
    ["mouth", a.mouth],
    ...(a.hand ? ([["hand", a.hand]] as const) : []),
  ] as const) {
    expect(p.x, `${label}: ${nm}.x in bounds`).toBeGreaterThanOrEqual(a.left - tol);
    expect(p.x, `${label}: ${nm}.x in bounds`).toBeLessThanOrEqual(a.right + tol);
    expect(p.y, `${label}: ${nm}.y in bounds`).toBeGreaterThanOrEqual(a.top - tol);
    expect(p.y, `${label}: ${nm}.y in bounds`).toBeLessThanOrEqual(tol);
  }
  expect(a.waist, `${label}: waist`).toBeGreaterThanOrEqual(a.top - tol);
  expect(a.waist, `${label}: waist`).toBeLessThanOrEqual(tol);
  expect(a.shoulders, `${label}: shoulders`).toBeGreaterThanOrEqual(a.top - tol);
  expect(a.shoulders, `${label}: shoulders`).toBeLessThanOrEqual(tol);
  // nothing dips noticeably below the ground line
  expect(maxY(d.svg), `${label}: above ground`).toBeLessThanOrEqual(h * 0.04);
  // SVG hygiene
  expect(d.svg).not.toMatch(/<image|<foreignObject|<script|class=|preserveAspectRatio="none"/);
  for (const m of d.svg.matchAll(/id="([^"]+)"/g)) expect(m[1].startsWith(PREFIX), `${label}: id prefix`).toBe(true);
  for (const m of d.svg.matchAll(/url\(#([^)]+)\)/g)) expect(m[1].startsWith(PREFIX), `${label}: url prefix`).toBe(true);
  expect(d.svg.length, `${label}: compact`).toBeLessThan(90_000);
}

describe("creature rigs", () => {
  it("every kind supports stand and talk", () => {
    for (const c of cases) {
      const poses = c.rig.supportedPoses(c.look);
      expect(poses, c.name).toContain("stand");
      expect(poses, c.name).toContain("talk");
      expect(c.rig.supportedExpressions(c.look), c.name).toContain("neutral");
      expect(c.rig.nominalHeight(c.look), c.name).toBeGreaterThan(0);
    }
  });

  it("faced characters support the core expression set", () => {
    const core: Expression[] = ["neutral", "happy", "sad", "angry", "surprised", "afraid", "determined", "thinking", "cry"];
    for (const c of cases) {
      const faceless = (c.look.kind === "object" || c.look.kind === "plant") && !c.look.face;
      const ex = c.rig.supportedExpressions(c.look);
      if (faceless) expect(ex, c.name).toEqual(["neutral"]);
      else for (const e of core) expect(ex, `${c.name} ${e}`).toContain(e);
    }
  });

  for (const c of cases) {
    it(`${c.name}: every pose × facing renders with sane anchors`, () => {
      for (const pose of c.rig.supportedPoses(c.look)) {
        for (const facing of FACINGS) {
          checkDrawing(c, draw(c, pose, "neutral", facing), `${c.name} ${pose} ${facing}`);
        }
      }
    });

    it(`${c.name}: every expression renders`, () => {
      for (const e of c.rig.supportedExpressions(c.look)) {
        for (const pose of ["stand", "talk"] as Pose[]) {
          checkDrawing(c, draw(c, pose, e, "right"), `${c.name} ${pose} ${e}`);
        }
        checkDrawing(c, draw(c, "stand", e, "front"), `${c.name} front ${e}`);
      }
    });

    it(`${c.name}: deterministic`, () => {
      const a = draw(c, "talk", c.rig.supportedExpressions(c.look).includes("angry") ? "angry" : "neutral", "right", 99, 0.37);
      const b = draw(c, "talk", c.rig.supportedExpressions(c.look).includes("angry") ? "angry" : "neutral", "right", 99, 0.37);
      expect(a.svg).toBe(b.svg);
      expect(a.anchors).toEqual(b.anchors);
    });
  }

  it("standing height is close to the nominal height", () => {
    for (const c of cases) {
      const h = c.rig.nominalHeight(c.look);
      const d = draw(c, "stand", "neutral", "right");
      const drawn = -d.anchors.top;
      expect(drawn / h, `${c.name}: drawn ${drawn.toFixed(1)} vs nominal ${h}`).toBeGreaterThan(0.6);
      expect(drawn / h, `${c.name}: drawn ${drawn.toFixed(1)} vs nominal ${h}`).toBeLessThan(1.45);
    }
  });

  it("the face tracks the facing: three-quarter faces sit toward the right", () => {
    for (const c of cases) {
      if ((c.look.kind === "object" || c.look.kind === "plant") && !c.look.face) continue;
      const right = draw(c, "stand", "neutral", "right");
      const back = draw(c, "stand", "neutral", "back");
      expect(right.svg, c.name).not.toBe(back.svg);
    }
  });

  it("line width scales strokes without moving anchors", () => {
    const c = cases.find((x) => x.name === "bird swallow")!;
    const thin = draw(c, "stand", "happy", "right", 5, 0.05);
    const thick = draw(c, "stand", "happy", "right", 5, 0.2);
    expect(thin.anchors.head).toEqual(thick.anchors.head);
    expect(thin.svg).not.toBe(thick.svg);
  });

  it("rejects unknown vocabulary values", () => {
    expect(() => birdRig.draw({ look: { kind: "bird", species: "phoenix" as never, tone: "dots" }, pose: "stand", expression: "neutral", facing: "right", lineWidth: 0.1, seed: 1 }, ctx())).toThrow();
    expect(() => objectRig.draw({ look: { kind: "object", shape: "anvil" as never, tone: "dots", face: true }, pose: "stand", expression: "neutral", facing: "right", lineWidth: 0.1, seed: 1 }, ctx())).toThrow();
    expect(() => spiritRig.draw({ look: { kind: "spirit", element: "thunder" as never }, pose: "stand", expression: "neutral", facing: "right", lineWidth: 0.1, seed: 1 }, ctx())).toThrow();
    expect(() => emblemRig.draw({ look: { kind: "emblem", emblem: "church" as never }, pose: "stand", expression: "neutral", facing: "right", lineWidth: 0.1, seed: 1 }, ctx())).toThrow();
  });

  it("hold poses expose a hand anchor", () => {
    for (const c of cases) {
      if (!c.rig.supportedPoses(c.look).includes("hold")) continue;
      const d = draw(c, "hold", "neutral", "right");
      expect(d.anchors.hand, c.name).toBeDefined();
    }
  });
});
