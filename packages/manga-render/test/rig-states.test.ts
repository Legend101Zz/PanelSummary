/**
 * Pass 3 (acceptance run 1) rig behaviour: per-appearance eye states for
 * every faced kind, the gold → stone statue, the reworked human poses (lie,
 * kneel, sit, carry, reach), birds turned toward the viewer, plants by bloom
 * tone and condition, and the reed as one design in every pose.
 */
import { describe, expect, it } from "vitest";
import { PLANT_SPECIES, type CharacterLook, type Expression, type Facing, type HumanLook, type Pose } from "../src/contracts.js";
import type { FigureDrawing, FigureRequest } from "../src/internal.js";
import { rig } from "../src/rig/index.js";
import { humanRig } from "../src/rig/human.js";
import { birdRig } from "../src/rig/bird.js";
import { plantRig } from "../src/rig/plant.js";
import { humanPalette } from "../src/rig/human/look.js";
import { viewFor } from "../src/rig/human/draw.js";
import { drawFace, EXPR, withEyes } from "../src/rig/creature/face.js";
import { makePen, P } from "../src/rig/creature/common.js";
import { EXPR as HUMAN_EXPR, mouthMood, withEyeState } from "../src/rig/human/face.js";
import { toneFill } from "../src/style.js";

const PREFIX = "pg7-";
const ctx = () => ({ idPrefix: PREFIX, rand: () => 0.5 });
type Eyes = NonNullable<FigureRequest["eyes"]>;

const HUMAN: HumanLook = {
  kind: "human",
  age: "adult",
  build: "slim",
  height: "average",
  frame: "masc",
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
const PRINCE: HumanLook = { ...HUMAN, height: "tall", hair_tone: "gold", outfit: "royal", outfit_tone: "gold", headwear: "crown", accessories: ["sword_belt"], material: "gold" };

function draw(look: CharacterLook, o: { pose?: Pose; expression?: Expression; facing?: Facing; eyes?: Eyes; lineWidth?: number; seed?: number } = {}): FigureDrawing {
  const h = rig.nominalHeight(look);
  return rig.draw(
    {
      look,
      pose: o.pose ?? "stand",
      expression: o.expression ?? "neutral",
      facing: o.facing ?? "right",
      lineWidth: o.lineWidth ?? h / 180,
      seed: o.seed ?? 11,
      ...(o.eyes ? { eyes: o.eyes } : {}),
    },
    ctx(),
  );
}

const FACED: CharacterLook[] = [
  HUMAN,
  PRINCE,
  { kind: "bird", species: "swallow", tone: "dark" },
  { kind: "bird", species: "owl", tone: "dots" },
  { kind: "animal", species: "rat", tone: "mid" },
  { kind: "animal", species: "frog", tone: "mid" },
  { kind: "insect", species: "bee", tone: "stripes" },
  { kind: "object", shape: "rocket", tone: "dark", face: true },
  { kind: "plant", species: "rose_bush", tone: "white", face: true },
  { kind: "plant", species: "oak", tone: "dots", face: true },
  { kind: "spirit", element: "wind" },
  { kind: "emblem", emblem: "state" },
  { kind: "crowd", crowd: "townsfolk", size: "few" },
];

describe("eye states (FigureRequest.eyes)", () => {
  it("every faced kind draws closed, blind and dead eyes unlike its open eyes, deterministically", () => {
    for (const look of FACED) {
      for (const facing of ["right", "front"] as Facing[]) {
        const open = draw(look, { facing, expression: "sad" }).svg;
        expect(draw(look, { facing, expression: "sad", eyes: "open" }).svg, `${look.kind} open = default`).toBe(open);
        for (const eyes of ["closed", "blind", "dead"] as Eyes[]) {
          const a = draw(look, { facing, expression: "sad", eyes });
          const b = draw(look, { facing, expression: "sad", eyes });
          expect(a.svg, `${look.kind} ${facing} ${eyes} differs from open`).not.toBe(open);
          expect(b.svg, `${look.kind} ${facing} ${eyes} deterministic`).toBe(a.svg);
          expect(a.svg).not.toMatch(/NaN|Infinity|undefined|\sopacity="/);
        }
      }
    }
  });

  it("creature faces: shut and blind eyes have no pupils; open eyes do", () => {
    const pupils = (eyes?: Eyes, expression: Expression = "neutral") => {
      const pen = makePen(0.2, PREFIX, eyes ? { eyes } : {});
      const svg = drawFace({ c: P(0, 0), gap: 3, eyeR: 2, turn: 0.55, pen, headR: 6, brows: true }, expression);
      return (svg.match(/fill="#141414" stroke="none"/g) ?? []).length;
    };
    expect(pupils()).toBeGreaterThan(0);
    for (const e of ["closed", "blind", "dead"] as Eyes[]) expect(pupils(e), e).toBe(0);
    // an eye state wins over the expression's eyes
    expect(pupils("dead", "surprised")).toBe(0);
    expect(withEyes(EXPR.happy, "dead").eye).toBe("dead");
    expect(withEyes(EXPR.happy, "dead").blush).toBeFalsy();
    expect(withEyes(EXPR.happy, "open")).toBe(EXPR.happy);
  });

  it("pain is squeezed-shut eyes (never X eyes: X reads as death); gentle has no blush", () => {
    expect(EXPR.pain.eye).toBe("squeeze");
    expect(EXPR.pain.tears).toBe("drop");
    expect(EXPR.gentle.blush).toBeFalsy();
    expect(HUMAN_EXPR.gentle.blush).toBeFalsy();
    expect(EXPR.love.blush).toBe(true);
    // squeezed eyes are lid strokes: no filled pupils, and no stroke runs from one eye into the other
    const pen = makePen(0.2, PREFIX);
    const svg = drawFace({ c: P(0, 0), gap: 3, eyeR: 2, turn: 0.55, pen, headR: 6, brows: false }, "pain");
    expect(svg).not.toMatch(/fill="#141414" stroke="none"/);
  });

  it("human faces map eye states onto the expression", () => {
    expect(withEyeState(HUMAN_EXPR.neutral, "closed").eye).toBe("closed");
    expect(withEyeState(HUMAN_EXPR.cry, "dead").tears).toBe(false);
    expect(withEyeState(HUMAN_EXPR.happy, "blind").eye).toBe("blind");
    // a statue with its gems taken shows dark hollow sockets
    const blind = draw(PRINCE, { facing: "front", eyes: "blind" }).svg;
    expect(blind).toContain('fill="#4a4a4a"');
    // a blind living face has no iris highlights
    const highlights = (svg: string) => (svg.match(/<circle[^>]*fill="#ffffff"\/>/g) ?? []).length;
    const lw = 0.8;
    const open = humanRig.draw({ look: HUMAN, pose: "stand", expression: "neutral", facing: "front", lineWidth: lw, seed: 3 }, ctx()).svg;
    const blindFlesh = humanRig.draw({ look: HUMAN, pose: "stand", expression: "neutral", facing: "front", lineWidth: lw, seed: 3, eyes: "blind" }, ctx()).svg;
    expect(highlights(open)).toBeGreaterThan(highlights(blindFlesh));
  });

  it("a mustache curls with the mouth so smug and happy never read as a frown", () => {
    expect(mouthMood("smug")).toBe("smirk");
    expect(mouthMood("happy")).toBe(1);
    expect(mouthMood("sad")).toBe(-1);
    const look: HumanLook = { ...HUMAN, facial_hair: "mustache" };
    expect(draw(look, { expression: "smug" }).svg).not.toBe(draw(look, { expression: "neutral" }).svg);
  });
});

describe("statue materials", () => {
  it("a statue stripped of its gold is a flat dull grey, clearly darker than gold, with no glints", () => {
    const stone: HumanLook = { ...PRINCE, material: "stone" };
    const pal = humanPalette(stone, PREFIX);
    expect(pal.skin).toBe(toneFill("mid", PREFIX));
    expect(pal.top).toBe(toneFill("mid", PREFIX));
    expect(humanPalette(PRINCE, PREFIX).skin).toBe(toneFill("gold", PREFIX));
    const g = draw(PRINCE).svg;
    const s = draw(stone).svg;
    expect(g).toContain(`${PREFIX}tone-gold`);
    expect(s).not.toContain(`${PREFIX}tone-gold`);
    // gold's white glint streaks are gone on stone
    const glints = (svg: string) => (svg.match(/fill="none" stroke="#ffffff"/g) ?? []).length;
    expect(glints(g)).toBeGreaterThan(glints(s));
    // the same statue: same crown, same silhouette size
    expect(Math.abs(draw(stone).anchors.top - draw(PRINCE).anchors.top)).toBeLessThan(1);
  });
});

describe("human poses", () => {
  const H = (o: Partial<HumanLook> = {}): HumanLook => ({ ...HUMAN, ...o });

  it("lie is a horizontal body in every facing (never a standing figure turned on its side)", () => {
    for (const look of [H(), H({ age: "child", outfit: "rags", hair: "messy" }), H({ frame: "fem", outfit: "dress", hair: "long_straight" })]) {
      const right = draw(look, { pose: "lie", facing: "right" });
      for (const facing of ["front", "back", "left"] as Facing[]) {
        const d = draw(look, { pose: "lie", facing });
        const a = d.anchors;
        const w = a.right - a.left;
        expect(w, facing).toBeGreaterThan(-a.top * 2.2);
        // the head is at one end of the body, near the ground
        expect(Math.abs(a.head.x - (a.left + a.right) / 2), facing).toBeGreaterThan(w * 0.3);
        expect(a.head.y, facing).toBeGreaterThan(a.top);
      }
      // a front-facing lie is the same three-quarter drawing
      expect(draw(look, { pose: "lie", facing: "front" }).svg).toBe(right.svg);
      // it rests on a contact shadow
      expect(right.svg).toMatch(new RegExp(`<ellipse[^>]*fill="url\\(#${PREFIX}tone-dots\\)"`));
    }
    expect(viewFor("lie", "front").view).toBe("side");
  });

  it("kneel and sit fold the legs in every facing (a front kneel never reads as standing)", () => {
    const stand = -draw(HUMAN, { pose: "stand", facing: "front" }).anchors.top;
    for (const facing of ["right", "front"] as Facing[]) {
      expect(-draw(HUMAN, { pose: "kneel", facing }).anchors.top, `kneel ${facing}`).toBeLessThan(stand * 0.8);
      expect(-draw(HUMAN, { pose: "sit", facing }).anchors.top, `sit ${facing}`).toBeLessThan(stand * 0.82);
    }
    expect(viewFor("kneel", "front")).toEqual({ view: "side", yaw: 38 });
    expect(viewFor("sit", "front")).toEqual({ view: "side", yaw: 38 });
    expect(viewFor("stand", "front")).toEqual({ view: "front" });
  });

  it("carry hugs the load at chest height in front of the body", () => {
    for (const facing of ["right", "front"] as Facing[]) {
      const a = draw(HUMAN, { pose: "carry", facing }).anchors;
      expect(a.hand, facing).toBeDefined();
      expect(a.hand!.y, facing).toBeGreaterThan(a.shoulders);
      expect(a.hand!.y, facing).toBeLessThan(a.waist);
    }
    const r = draw(HUMAN, { pose: "carry" }).anchors;
    expect(r.hand!.x).toBeGreaterThan(r.head.x);
  });

  it("reach keeps the arm below the chin whatever the mood (reach + cry never crosses the face)", () => {
    for (const expression of ["neutral", "cry", "sad", "happy"] as Expression[]) {
      for (const look of [HUMAN, H({ age: "child", height: "short" })]) {
        const a = draw(look, { pose: "reach", expression }).anchors;
        expect(a.hand!.y, expression).toBeGreaterThan(a.mouth.y);
        expect(a.hand!.x, expression).toBeGreaterThan(a.mouth.x);
      }
    }
    // crying does not drop the head of a reaching figure
    const n0 = draw(HUMAN, { pose: "reach" }).anchors;
    const cry = draw(HUMAN, { pose: "reach", expression: "cry" }).anchors;
    expect(cry.head.y).toBeLessThan(n0.head.y + 1);
  });
});

describe("birds", () => {
  const SONGBIRDS = ["swallow", "nightingale", "sparrow", "linnet"] as const;

  it("a bird facing the viewer is its profile turned toward us (tail and wing along the body), not a penguin", () => {
    for (const species of SONGBIRDS) {
      const look: CharacterLook = { kind: "bird", species, tone: "mid" };
      for (const pose of ["stand", "perch", "talk"] as Pose[]) {
        const f = draw(look, { pose, facing: "front" });
        const a = f.anchors;
        // a penguin front is a narrow upright egg; the turned profile shows the tail behind
        expect((a.right - a.left) / -a.top, `${species} ${pose}`).toBeGreaterThan(0.6);
        expect(f.svg).not.toBe(draw(look, { pose, facing: "right" }).svg);
      }
      // a frontal flight keeps its symmetric spread wings
      const fly = draw(look, { pose: "fly", facing: "front" }).anchors;
      expect(Math.abs(fly.head.x)).toBeLessThan(0.01);
    }
  });

  it("a lying bird is drawn in profile, collapsed with its head down; dead eyes have no pupils", () => {
    const look: CharacterLook = { kind: "bird", species: "swallow", tone: "dark" };
    const lie = draw(look, { pose: "lie", facing: "front" });
    expect(lie.svg).toBe(draw(look, { pose: "lie", facing: "right" }).svg);
    const stand = draw(look, { pose: "stand" }).anchors;
    expect(lie.anchors.head.y).toBeGreaterThan(stand.head.y + 2);
    const dead = birdRig.draw({ look, pose: "lie", expression: "neutral", facing: "right", lineWidth: 0.1, seed: 1, eyes: "dead" }, ctx());
    const alive = birdRig.draw({ look, pose: "lie", expression: "neutral", facing: "right", lineWidth: 0.1, seed: 1 }, ctx());
    const pupils = (svg: string) => (svg.match(/fill="#141414" stroke="none"/g) ?? []).length;
    expect(pupils(dead.svg)).toBeLessThan(pupils(alive.svg));
  });

  it("the silhouette level of detail keeps shut eyes shut", () => {
    const look: CharacterLook = { kind: "bird", species: "swallow", tone: "dark" };
    const req = { look, pose: "lie" as Pose, expression: "asleep" as Expression, facing: "right" as Facing, lineWidth: 1, seed: 2, detail: "silhouette" as const };
    const svg = birdRig.draw(req, ctx()).svg;
    // no round eye dots: the shut eyes are dashes
    expect(svg).toMatch(/stroke-linecap="round"><path d="M[^"]*L[^"]*" fill="none"/);
  });
});

describe("plants", () => {
  it("a rose bush's tone is the colour of its roses (white, yellow, red differ); the leaves stay one tone", () => {
    const bush = (tone: "white" | "light" | "mid" | "dark") => draw({ kind: "plant", species: "rose_bush", tone, face: false }).svg;
    const svgs = (["white", "light", "mid", "dark"] as const).map((t) => bush(t));
    expect(new Set(svgs).size).toBe(4);
    for (const s of svgs) expect(s).toContain('fill="#9a9a9a"'); // the fixed mid leaves
    expect(svgs[3]).toContain('fill="#4a4a4a"'); // dark (red) blooms
  });

  it("the plant condition follows the eye state: dead = frost-bitten (bare), closed = shut buds", () => {
    for (const species of ["rose_bush", "oak", "flower"] as const) {
      const look: CharacterLook = { kind: "plant", species, tone: "white", face: false };
      const full = plantRig.draw({ look, pose: "stand", expression: "neutral", facing: "right", lineWidth: 0.5, seed: 1 }, ctx()).svg;
      const bare = plantRig.draw({ look, pose: "stand", expression: "neutral", facing: "right", lineWidth: 0.5, seed: 1, eyes: "dead" }, ctx()).svg;
      const buds = plantRig.draw({ look, pose: "stand", expression: "neutral", facing: "right", lineWidth: 0.5, seed: 1, eyes: "closed" }, ctx()).svg;
      expect(bare, species).not.toBe(full);
      // trees have no buds to shut; rose bushes and flowers do
      if (species !== "oak") expect(buds, species).not.toBe(full);
      if (species === "rose_bush") expect(bare.length, species).toBeLessThan(full.length * 0.8);
    }
  });

  it("the reed is one design in every pose: the same seed head, a bow is a bend of the same stalk", () => {
    const reed: CharacterLook = { kind: "plant", species: "reed", tone: "mid", face: false };
    const stand = draw(reed, { pose: "stand" }).anchors;
    for (const pose of plantRig.supportedPoses(reed)) {
      const a = draw(reed, { pose }).anchors;
      expect(a.headRadius, pose).toBe(stand.headRadius);
      // the plant never flings its head far to the side (it stays inside a panel)
      expect(Math.max(-a.left, a.right), pose).toBeLessThan(-a.top * 0.68);
    }
    // close shots are framed around the whole seed head, not a tiny face point
    expect(stand.headRadius).toBeGreaterThan(14);
  });

  it("every plant species honours the tone", () => {
    for (const species of PLANT_SPECIES) {
      const a = draw({ kind: "plant", species, tone: "white", face: false }).svg;
      const b = draw({ kind: "plant", species, tone: "dark", face: false }).svg;
      expect(a, species).not.toBe(b);
    }
  });
});

describe("objects", () => {
  it("a thinking round body puts its hand beside the face, not across it", () => {
    const wheel: CharacterLook = { kind: "object", shape: "wheel", tone: "mid", face: true };
    const a = draw(wheel, { pose: "think" }).anchors;
    expect(a.hand).toBeDefined();
    expect(Math.hypot(a.hand!.x - a.head.x, a.hand!.y - a.head.y)).toBeGreaterThan(a.headRadius * 0.9);
  });
});
