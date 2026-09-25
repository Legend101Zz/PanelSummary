/**
 * Crowd rig: a group drawn as one actor. 'few' = 3 people, 'many' = 6-8,
 * overlapping in two depth rows. Members are simplified humans whose looks
 * come from the crowd type (townsfolk, children, soldiers, officials,
 * workers, nobles) and a stable seed. Anchors belong to the front-centre
 * person so speech tails land on a real mouth.
 */
import { EXPRESSIONS, type CrowdLook, type Expression, type HumanLook, type Pose } from "../contracts.js";
import type { DrawContext, FigureAnchors, FigureDrawing } from "../internal.js";
import type { KindRig } from "./kind.js";
import { n } from "../svg.js";
import { seeded } from "../prng.js";
import { drawHuman } from "./human/draw.js";
import { nominalHumanHeight } from "./human/look.js";

export const CROWD_POSES = ["stand", "walk", "run", "talk", "point", "cower", "wave"] as const satisfies readonly Pose[];

type Rand = () => number;
const pick = <T>(rand: Rand, list: readonly T[]): T => list[Math.floor(rand() * list.length) % list.length];

function memberLook(crowd: CrowdLook["crowd"], rand: Rand, i: number): HumanLook {
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
    outfit_tone: "mid",
    headwear: "none",
    accessories: [],
    skin: "light",
    material: "flesh",
  };
  const frame = pick(rand, ["masc", "fem", "masc", "fem", "neutral"] as const);
  const skin = pick(rand, ["light", "light", "mid", "dark"] as const);
  const hairTone = pick(rand, ["black", "dark", "mid", "light", "white", "dense_dots"] as const);
  const fem = frame === "fem";
  const hairF = ["long_straight", "bun", "ponytail", "braids", "bob", "long_wavy"] as const;
  const hairM = ["short", "side_part", "messy", "buzz", "curly", "spiky"] as const;
  const look: HumanLook = { ...base, frame, skin, hair_tone: hairTone, hair: fem ? pick(rand, hairF) : pick(rand, hairM) };
  switch (crowd) {
    case "townsfolk":
      look.age = pick(rand, ["adult", "adult", "elder", "teen"] as const);
      look.build = pick(rand, ["average", "slim", "heavy", "broad"] as const);
      look.outfit = fem ? pick(rand, ["dress", "work_apron", "dress"] as const) : pick(rand, ["tunic", "shirt_trousers", "long_coat", "work_apron"] as const);
      look.outfit_tone = pick(rand, ["light", "mid", "dark", "dots", "stripes", "white"] as const);
      look.headwear = fem ? pick(rand, ["bonnet", "none", "none"] as const) : pick(rand, ["wide_hat", "cap", "none", "none"] as const);
      if (look.age === "elder") look.hair_tone = pick(rand, ["white", "light"] as const);
      if (!fem && rand() < 0.3) look.facial_hair = pick(rand, ["beard", "mustache", "stubble"] as const);
      break;
    case "children":
      look.age = "child";
      look.height = pick(rand, ["short", "average", "average"] as const);
      look.outfit = fem ? pick(rand, ["dress", "dress", "rags"] as const) : pick(rand, ["tunic", "shirt_trousers", "rags"] as const);
      look.outfit_tone = pick(rand, ["light", "mid", "white", "dots", "check"] as const);
      look.headwear = rand() < 0.25 ? "cap" : "none";
      break;
    case "soldiers":
      look.frame = i % 4 === 3 ? "neutral" : "masc";
      look.build = pick(rand, ["average", "broad", "average"] as const);
      look.outfit = "uniform";
      look.outfit_tone = "dark";
      look.headwear = "helmet";
      look.hair = "short";
      look.accessories = ["sword_belt"];
      if (rand() < 0.3) look.facial_hair = "mustache";
      break;
    case "officials":
      look.frame = i % 3 === 2 ? "fem" : "masc";
      look.age = pick(rand, ["adult", "elder", "elder"] as const);
      look.build = pick(rand, ["heavy", "average", "heavy", "slim"] as const);
      look.outfit = pick(rand, ["suit", "long_coat", "suit"] as const);
      look.outfit_tone = pick(rand, ["black", "dark", "black"] as const);
      look.headwear = look.frame === "fem" ? "none" : pick(rand, ["top_hat", "top_hat", "none"] as const);
      look.hair = look.frame === "fem" ? "bun" : pick(rand, ["side_part", "bald", "short"] as const);
      look.hair_tone = look.age === "elder" ? pick(rand, ["white", "light"] as const) : "dark";
      look.accessories = rand() < 0.5 ? ["medal"] : rand() < 0.5 ? ["glasses"] : [];
      if (look.frame === "masc" && rand() < 0.5) look.facial_hair = pick(rand, ["mustache", "beard"] as const);
      break;
    case "workers":
      look.build = pick(rand, ["broad", "average", "heavy"] as const);
      look.outfit = pick(rand, ["work_apron", "shirt_trousers", "work_apron"] as const);
      look.outfit_tone = pick(rand, ["mid", "dark", "light", "stripes"] as const);
      look.headwear = pick(rand, ["cap", "cap", "none", "wide_hat"] as const);
      if (!fem && rand() < 0.4) look.facial_hair = pick(rand, ["stubble", "beard", "mustache"] as const);
      break;
    case "nobles":
      look.build = pick(rand, ["slim", "average", "heavy"] as const);
      look.outfit = fem ? "gown" : pick(rand, ["royal", "suit", "long_coat"] as const);
      look.outfit_tone = pick(rand, ["flowers", "dark", "white", "stripes", "light"] as const);
      look.headwear = fem ? pick(rand, ["wreath", "none", "none"] as const) : pick(rand, ["none", "top_hat", "none"] as const);
      look.accessories = fem ? ["necklace"] : rand() < 0.5 ? ["medal"] : ["cape"];
      break;
  }
  return look;
}

/** Pose variations so a crowd doesn't move in lockstep. */
function memberPose(pose: Pose, i: number, front: boolean): Pose {
  switch (pose) {
    case "talk":
      return i % 3 === 1 ? "point" : i % 3 === 2 ? "stand" : "talk";
    case "point":
      return front ? "point" : i % 2 === 0 ? "point" : "talk";
    case "wave":
      return i % 3 === 2 ? "stand" : "wave";
    case "stand":
      return i % 4 === 3 ? "talk" : "stand";
    default:
      return pose;
  }
}

function memberExpression(e: Expression, i: number): Expression {
  if (i === 0) return e;
  const alt: Partial<Record<Expression, Expression[]>> = {
    happy: ["laugh", "happy", "gentle"],
    laugh: ["happy", "laugh"],
    angry: ["shout", "angry", "determined"],
    shout: ["angry", "shout"],
    afraid: ["afraid", "worried", "surprised"],
    surprised: ["surprised", "afraid"],
    sad: ["sad", "cry", "worried"],
    neutral: ["neutral", "thinking", "neutral"],
    talk: [],
  } as Partial<Record<Expression, Expression[]>>;
  const list = alt[e];
  return list && list.length ? list[i % list.length] : e;
}

interface Slot {
  x: number;
  y: number;
  s: number;
  row: number;
}

function slots(count: number, rand: Rand): Slot[] {
  if (count === 3) {
    return [
      { x: 0, y: 0, s: 1, row: 0 },
      { x: -21, y: -5, s: 0.94, row: 1 },
      { x: 20, y: -4, s: 0.95, row: 1 },
    ];
  }
  const out: Slot[] = [{ x: 0, y: 0, s: 1, row: 0 }];
  const front = count >= 7 ? [-27, 27] : [-28, 26];
  for (const x of front) out.push({ x: x + (rand() - 0.5) * 6, y: -1 + rand() * 2, s: 0.97 + rand() * 0.04, row: 0 });
  const backCount = count - out.length;
  for (let i = 0; i < backCount; i += 1) {
    const t = backCount === 1 ? 0.5 : i / (backCount - 1);
    out.push({ x: -40 + 80 * t + (rand() - 0.5) * 6, y: -9 - rand() * 3, s: 0.87 + rand() * 0.04, row: 1 });
  }
  return out;
}

export const crowdRig: KindRig<CrowdLook> = {
  supportedPoses: () => CROWD_POSES,
  supportedExpressions: () => EXPRESSIONS,
  nominalHeight: (look) => (look.crowd === "children" ? 66 : 100),
  draw(request, ctx: DrawContext): FigureDrawing {
    const look = request.look;
    const rand = seeded(request.seed, "crowd", look.crowd, look.size);
    const count = look.size === "few" ? 3 : 6 + Math.floor(rand() * 3);
    const places = slots(count, rand);
    // Paint back row first, front-centre last.
    const order = places.map((p, i) => ({ p, i })).sort((a, b) => b.p.row - a.p.row || Math.abs(b.p.x) - Math.abs(a.p.x));
    let svg = "";
    let lead: FigureAnchors | null = null;
    let top = Infinity;
    let left = Infinity;
    let right = -Infinity;
    for (const { p, i } of order) {
      const mrand = seeded(request.seed, "member", i, look.crowd);
      const ml = memberLook(look.crowd, mrand, i);
      const H = nominalHumanHeight(ml);
      const scale = (p.s * (look.crowd === "children" ? 66 : 100)) / Math.max(H, 1) * (H / (look.crowd === "children" ? 62 : 97));
      const facing = request.facing === "front" || request.facing === "back" ? request.facing : i % 4 === 3 ? "front" : request.facing;
      const pose = memberPose(request.pose, i, i === 0);
      const d = drawHuman(
        {
          look: ml,
          pose,
          expression: memberExpression(request.expression, i),
          facing,
          // Back row: lighter ink reads as depth.
          lineWidth: (request.lineWidth / scale) * (p.row === 1 ? 0.75 : 1),
          seed: (request.seed * 31 + i * 977) >>> 0,
        },
        ctx,
        { lite: true },
      );
      const tx = p.x;
      const ty = p.y;
      svg += `<g transform="translate(${n(tx)} ${n(ty)}) scale(${n(scale)})">${d.svg}</g>`;
      const a = d.anchors;
      const T = (pt: { x: number; y: number }) => ({ x: tx + pt.x * scale, y: ty + pt.y * scale });
      top = Math.min(top, ty + a.top * scale);
      left = Math.min(left, tx + a.left * scale);
      right = Math.max(right, tx + a.right * scale);
      if (i === 0) {
        lead = {
          head: T(a.head),
          headRadius: a.headRadius * scale,
          mouth: T(a.mouth),
          hand: a.hand ? T(a.hand) : undefined,
          top: 0,
          left: 0,
          right: 0,
          waist: ty + a.waist * scale,
          shoulders: ty + a.shoulders * scale,
        };
      }
    }
    if (!lead) throw new Error("crowd without members");
    return { svg, anchors: { ...lead, top, left, right } };
  },
};
