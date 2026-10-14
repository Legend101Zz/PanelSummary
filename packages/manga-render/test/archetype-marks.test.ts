/**
 * v0.3 D1a (#81, renderer 0.7.2): body marks of the neutral stand-ins (look.marks).
 * Every mark draws in every pose and facing on every archetype, deterministically; the plain look is the 0.7.x
 * drawing; validation: only archetypes, enum, at most 3; a long_neck makes the figure taller.
 */
import { describe, expect, it } from "vitest";
import type { CharacterLook, FigureSpec } from "../src/contracts.js";
import { ARCHETYPE_SPECIES, LOOK_MARKS, LOOK_MARKS_MAX } from "../src/contracts.js";
import { catalog, castCapabilities } from "../src/index.js";
import { rig } from "../src/rig/index.js";
import { validateLook } from "../src/validate/look.js";
import { Issues } from "../src/validate/util.js";

const FACINGS = ["right", "front", "back"] as const;
const ctx = () => ({ idPrefix: "t-", rand: () => 0.5 });
const draw = (look: CharacterLook, pose: FigureSpec["pose"], facing: (typeof FACINGS)[number] = "right") =>
  rig.draw({ look, pose, expression: "neutral", facing, lineWidth: 0.4, seed: 7 }, ctx());
const lookOf = (species: string, marks?: string[]): CharacterLook =>
  ({ kind: species === "bird_tall" ? "bird" : "animal", species, tone: "mid", ...(marks ? { marks } : {}) }) as CharacterLook;
const issuesOf = (look: unknown) => {
  const i = new Issues();
  validateLook(look, i, "look");
  return i.list;
};

describe("every mark draws on every archetype", () => {
  for (const sp of ARCHETYPE_SPECIES) {
    for (const mark of LOOK_MARKS) {
      it(`${sp} + ${mark}: every pose and facing draws, deterministic, finite anchors`, () => {
        const look = lookOf(sp, [mark]);
        for (const pose of rig.supportedPoses(look)) {
          for (const facing of FACINGS) {
            const a = draw(look, pose, facing);
            expect(a.svg.length, `${sp} ${mark} ${pose} ${facing}`).toBeGreaterThan(200);
            expect(a.svg).toBe(draw(look, pose, facing).svg);
            const v = [a.anchors.top, a.anchors.left, a.anchors.right, a.anchors.head.x, a.anchors.head.y, a.anchors.mouth.x, a.anchors.mouth.y];
            expect(v.every(Number.isFinite), `${sp} ${mark} ${pose} ${facing}`).toBe(true);
            expect(a.anchors.top).toBeLessThan(0);
          }
        }
      });
      it(`${sp} + ${mark}: the silhouette changes clearly in the stand pose (side and front)`, () => {
        for (const facing of ["right", "front"] as const) {
          const plain = draw(lookOf(sp), "stand", facing);
          const marked = draw(lookOf(sp, [mark]), "stand", facing);
          expect(marked.svg, `${sp} ${mark} ${facing}`).not.toBe(plain.svg);
        }
      });
    }
  }
  it("the combinations of the task render in every pose", () => {
    const combos: Array<[string, string[]]> = [
      ["quad_large", ["long_nose", "big_ears"]],
      ["quad_large", ["long_neck"]],
      ["quad_medium", ["horns"]],
      ["bird_tall", ["long_neck"]],
      ["long_low", ["long_tail"]],
      ["quad_large", ["long_neck", "horns", "long_tail"]],
    ];
    for (const [sp, marks] of combos) {
      const look = lookOf(sp, marks);
      for (const pose of rig.supportedPoses(look)) for (const facing of FACINGS) expect(draw(look, pose, facing).svg.length).toBeGreaterThan(200);
    }
  });
});

describe("no marks = the 0.7.x drawing", () => {
  for (const sp of ARCHETYPE_SPECIES) {
    it(`${sp}: absent, empty and a mark on a non-archetype draw the same`, () => {
      for (const pose of ["stand", "walk", "talk"] as const) {
        for (const facing of FACINGS) {
          const plain = draw(lookOf(sp), pose, facing).svg;
          expect(draw(lookOf(sp, []), pose, facing).svg).toBe(plain);
        }
      }
    });
  }
  it("a mark on a named species is ignored by the rig (validation rejects it)", () => {
    const horse = { kind: "animal", species: "horse", tone: "mid" } as CharacterLook;
    const marked = { ...horse, marks: ["long_neck", "horns"] } as CharacterLook;
    expect(draw(marked, "stand").svg).toBe(draw(horse, "stand").svg);
    expect(rig.nominalHeight(marked)).toBe(rig.nominalHeight(horse));
  });
});

describe("a long neck makes the figure taller; look.scale still fixes the total height", () => {
  for (const sp of ["quad_small", "quad_medium", "quad_large", "long_low", "swimmer", "bird_tall"] as const) {
    it(`${sp}: nominal height matches the drawn height within 15 percent`, () => {
      const look = lookOf(sp, ["long_neck"]);
      const plain = lookOf(sp);
      expect(rig.nominalHeight(look)).toBeGreaterThan(rig.nominalHeight(plain) * 1.2);
      const drawnRatio = -draw(look, "stand").anchors.top / -draw(plain, "stand").anchors.top;
      const nomRatio = rig.nominalHeight(look) / rig.nominalHeight(plain);
      expect(Math.abs(drawnRatio / nomRatio - 1), `${sp} drawn ${drawnRatio.toFixed(2)} nominal ${nomRatio.toFixed(2)}`).toBeLessThan(0.15);
    });
  }
  it("other marks keep the nominal height", () => {
    for (const sp of ARCHETYPE_SPECIES) for (const m of ["long_nose", "horns", "big_ears", "long_tail"]) expect(rig.nominalHeight(lookOf(sp, [m]))).toBe(rig.nominalHeight(lookOf(sp)));
  });
  it("with look.scale the figure is as tall as the scale says, neck included", () => {
    const look = { ...lookOf("quad_large", ["long_neck"]), scale: 2 } as CharacterLook;
    expect(rig.nominalHeight(look)).toBe(200);
    const d = draw(look, "stand");
    expect(-d.anchors.top).toBeGreaterThan(120);
    expect(-d.anchors.top).toBeLessThan(230);
  });
});

describe("validation of look.marks", () => {
  it("accepts one to three marks on every archetype", () => {
    for (const sp of ARCHETYPE_SPECIES) {
      expect(issuesOf(lookOf(sp, ["long_neck"])).filter((i) => i.severity === "error")).toEqual([]);
      expect(issuesOf(lookOf(sp, ["long_nose", "big_ears", "horns"])).filter((i) => i.severity === "error")).toEqual([]);
      expect(issuesOf(lookOf(sp, [])).length).toBe(0);
    }
  });
  it("LOOK_MARKS_NOT_ARCHETYPE on a named species, a human or a plant", () => {
    const named = issuesOf({ kind: "animal", species: "horse", tone: "mid", marks: ["long_neck"] });
    expect(named.some((i) => i.severity === "error" && i.code === "LOOK_MARKS_NOT_ARCHETYPE")).toBe(true);
    const bird = issuesOf({ kind: "bird", species: "crow", tone: "dark", marks: ["horns"] });
    expect(bird.some((i) => i.code === "LOOK_MARKS_NOT_ARCHETYPE")).toBe(true);
    const plant = issuesOf({ kind: "plant", species: "oak", tone: "mid", face: false, marks: ["horns"] });
    expect(plant.some((i) => i.code === "LOOK_MARKS_NOT_ARCHETYPE")).toBe(true);
  });
  it("an unknown mark is ENUM_INVALID; more than three is an error; a duplicate is a warning", () => {
    expect(issuesOf(lookOf("quad_large", ["long_trunk"])).some((i) => i.severity === "error" && i.code === "ENUM_INVALID")).toBe(true);
    expect(LOOK_MARKS_MAX).toBe(3);
    const many = issuesOf(lookOf("quad_large", ["long_neck", "long_nose", "horns", "big_ears"]));
    expect(many.some((i) => i.severity === "error" && i.code === "LOOK_MARKS_TOO_MANY")).toBe(true);
    const dup = issuesOf(lookOf("quad_large", ["horns", "horns"]));
    expect(dup.some((i) => i.severity === "warning" && i.code === "DUPLICATE_VALUE")).toBe(true);
    expect(dup.some((i) => i.severity === "error")).toBe(false);
  });
  it("marks that is not a list is FIELD_TYPE", () => {
    expect(issuesOf({ kind: "animal", species: "quad_large", tone: "mid", marks: "long_neck" }).some((i) => i.code === "FIELD_TYPE")).toBe(true);
  });
  it("an empty list on a named species is not an error", () => {
    expect(issuesOf({ kind: "animal", species: "horse", tone: "mid", marks: [] }).filter((i) => i.severity === "error")).toEqual([]);
  });
});

describe("the writer and the capabilities see the marks", () => {
  it("catalog: the field, the meanings and the error codes", () => {
    const c = catalog();
    for (const kind of ["animal", "bird"]) {
      const f = String(c.looks[kind].fields.marks);
      for (const m of LOOK_MARKS) expect(f, `${kind} ${m}`).toContain(m);
    }
    expect(c.looks.human.fields.marks).toBeUndefined();
    expect(c.errors.LOOK_MARKS_NOT_ARCHETYPE).toBeDefined();
    expect(c.errors.LOOK_MARKS_TOO_MANY).toBeDefined();
    expect(c.fields["look.marks"]).toMatch(/long_neck/);
  });
  it("castCapabilities reports the marks of a stand-in", () => {
    const cap = castCapabilities([{ id: "g", name: "The Giraffe", look: lookOf("quad_large", ["long_neck"]) } as never]);
    expect(cap[0].stand_in).toBe(true);
    expect(cap[0].marks).toEqual(["long_neck"]);
    expect(cap[0].nominal_height).toBeGreaterThan(200);
  });
});
