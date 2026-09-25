/**
 * Body metrics (proportions by age/build/height/frame) and the ink/tone
 * palette (skin, hair, garments, material) for one human look.
 */
import type { HumanLook, Tone } from "../../contracts.js";
import { INK, PAPER, toneFill } from "../../style.js";
import { seeded, between } from "../../prng.js";

export const AGE_HEIGHT: Record<HumanLook["age"], number> = { child: 64, teen: 90, adult: 100, elder: 95 };
export const HEIGHT_FACTOR: Record<HumanLook["height"], number> = { short: 0.9, average: 1, tall: 1.1, giant: 1.8 };

export function nominalHumanHeight(look: HumanLook): number {
  return AGE_HEIGHT[look.age] * HEIGHT_FACTOR[look.height];
}

export interface Metrics {
  look: HumanLook;
  H: number;
  /** Head height (crown to chin) and cranium radius. */
  hh: number;
  R: number;
  neckLen: number;
  torsoLen: number;
  thigh: number;
  shin: number;
  ankleH: number;
  footL: number;
  upperArm: number;
  forearm: number;
  handL: number;
  shoulderHalf: number;
  hipHalf: number;
  r: {
    upperArm: number;
    elbow: number;
    wrist: number;
    thigh: number;
    knee: number;
    calf: number;
    ankle: number;
    neck: number;
  };
  chestW: number;
  chestD: number;
  waistW: number;
  waistD: number;
  hipW: number;
  hipD: number;
  bust: number;
  belly: number;
  seat: number;
  /** Extra forward lean (deg) for elders. */
  stoop: number;
  /** Per-character seeded jitter in [-1, 1]. */
  jitter: number[];
}

interface AgeRow {
  heads: number;
  leg: number;
  neck: number;
  upperArm: number;
  forearm: number;
  hand: number;
  foot: number;
  shoulder: number;
  limb: number;
}

const AGE: Record<HumanLook["age"], AgeRow> = {
  child: { heads: 4.0, leg: 0.4, neck: 0.03, upperArm: 0.15, forearm: 0.13, hand: 0.075, foot: 0.12, shoulder: 0.98, limb: 1.12 },
  teen: { heads: 5.4, leg: 0.47, neck: 0.042, upperArm: 0.175, forearm: 0.15, hand: 0.072, foot: 0.118, shoulder: 0.96, limb: 0.95 },
  adult: { heads: 6.0, leg: 0.49, neck: 0.045, upperArm: 0.18, forearm: 0.155, hand: 0.072, foot: 0.12, shoulder: 1, limb: 1 },
  elder: { heads: 5.8, leg: 0.465, neck: 0.04, upperArm: 0.175, forearm: 0.15, hand: 0.072, foot: 0.12, shoulder: 0.96, limb: 0.95 },
};

const BUILD: Record<HumanLook["build"], { sh: number; waist: number; hip: number; limb: number; depth: number }> = {
  slim: { sh: 0.92, waist: 0.84, hip: 0.9, limb: 0.84, depth: 0.88 },
  average: { sh: 1, waist: 1, hip: 1, limb: 1, depth: 1 },
  broad: { sh: 1.16, waist: 1.08, hip: 1.04, limb: 1.2, depth: 1.1 },
  heavy: { sh: 1.1, waist: 1.6, hip: 1.32, limb: 1.32, depth: 1.45 },
};

const FRAME: Record<HumanLook["frame"], { sh: number; waist: number; hip: number; arm: number; thigh: number }> = {
  masc: { sh: 0.12, waist: 0.074, hip: 0.08, arm: 1.05, thigh: 1 },
  neutral: { sh: 0.106, waist: 0.066, hip: 0.086, arm: 0.95, thigh: 1.02 },
  fem: { sh: 0.094, waist: 0.056, hip: 0.096, arm: 0.86, thigh: 1.06 },
};

export function humanMetrics(look: HumanLook, seed: number): Metrics {
  const rand = seeded(seed, "human-metrics");
  const jitter: number[] = [];
  for (let i = 0; i < 16; i += 1) jitter.push(between(rand, -1, 1));
  const H = nominalHumanHeight(look);
  const age = AGE[look.age];
  const build = BUILD[look.build];
  const frame = FRAME[look.frame];
  const giant = look.height === "giant";
  const heads = giant ? 7.0 : age.heads;
  const hh = (H / heads) * (1 + jitter[0] * 0.02);
  const R = 0.42 * hh;
  const leg = age.leg * H;
  const ankleH = 0.036 * H;
  const neckLen = age.neck * H;
  const torsoLen = H - leg - neckLen - 0.88 * hh;
  const legBones = leg - ankleH;
  const kid = look.age === "child";
  const shMul = build.sh * age.shoulder * (giant ? 1.12 : 1);
  const shoulderHalf = frame.sh * shMul * H * (kid ? 1.12 : 1);
  const limb = age.limb * build.limb * (giant ? 1.1 : 1);
  const armR = 0.024 * H * limb * frame.arm;
  const thighR = 0.041 * H * limb * frame.thigh;
  const waistW = frame.waist * build.waist * H * (kid ? 1.25 : 1) * (look.age === "elder" ? 1.08 : 1);
  const hipW = frame.hip * build.hip * H * (kid ? 1.05 : 1);
  const fem = look.frame === "fem";
  return {
    look,
    H,
    hh,
    R,
    neckLen,
    torsoLen,
    thigh: legBones * 0.5,
    shin: legBones * 0.5,
    ankleH,
    footL: age.foot * H,
    upperArm: age.upperArm * H,
    forearm: age.forearm * H,
    handL: age.hand * H,
    shoulderHalf,
    hipHalf: hipW * 0.52,
    r: {
      upperArm: armR,
      elbow: armR * 0.8,
      wrist: armR * 0.62,
      thigh: thighR,
      knee: thighR * 0.64,
      calf: thighR * 0.7,
      ankle: thighR * 0.4,
      neck: 0.027 * H * (kid ? 1.1 : 1) * (look.frame === "masc" ? 1.1 : fem ? 0.9 : 1) * (look.build === "heavy" ? 1.25 : 1),
    },
    chestW: shoulderHalf * 0.86,
    chestD: 0.066 * H * build.depth,
    waistW,
    waistD: waistW * 0.82 * (look.build === "heavy" ? 1.2 : 1),
    hipW,
    hipD: 0.062 * H * (build.depth * 0.5 + 0.5),
    bust: fem && !kid ? 0.014 * H : 0,
    belly: look.build === "heavy" ? 0.03 * H : look.age === "elder" ? 0.006 * H : 0,
    seat: fem ? 0.012 * H : 0.006 * H,
    stoop: look.age === "elder" ? 9 : 0,
    jitter,
  };
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export interface Palette {
  skin: string;
  /** Slightly darker flat shade for shadows on skin (neck under the chin). */
  skinShade: string;
  hair: string;
  hairDark: boolean;
  top: string;
  sleeve: string;
  legs: string;
  shoes: string;
  trim: string;
  accent: string;
  metal: string;
  white: string;
  line: string;
  material: HumanLook["material"];
  statue: boolean;
  outfitTone: Tone;
  /** Fill for anything made of the statue material (gold/stone/bronze). */
  mat: string;
}

const DARK_TONES: readonly Tone[] = ["dark", "black", "dense_dots"];
export const isDarkTone = (t: Tone): boolean => DARK_TONES.includes(t);

/** A trouser/underlayer tone that reads against the outfit tone. */
export function contrastTone(t: Tone): Tone {
  switch (t) {
    case "dark":
    case "black":
    case "dense_dots":
      return "light";
    case "mid":
    case "stone":
      return "dark";
    default:
      return "dark";
  }
}

export function humanPalette(look: HumanLook, idPrefix: string): Palette {
  const tf = (t: Tone) => toneFill(t, idPrefix);
  const skinTone: Tone = look.skin === "dark" ? "mid" : look.skin === "mid" ? "light" : "white";
  const shadeTone: Tone = look.skin === "dark" ? "dark" : look.skin === "mid" ? "mid" : "light";
  const base: Palette = {
    skin: skinTone === "white" ? PAPER : tf(skinTone),
    skinShade: tf(shadeTone),
    hair: tf(look.hair_tone),
    hairDark: isDarkTone(look.hair_tone),
    top: tf(look.outfit_tone),
    sleeve: tf(look.outfit_tone),
    legs: tf(contrastTone(look.outfit_tone)),
    shoes: INK,
    trim: PAPER,
    accent: tf("dark"),
    metal: tf("light"),
    white: PAPER,
    line: INK,
    material: look.material,
    statue: look.material !== "flesh",
    outfitTone: look.outfit_tone,
    mat: PAPER,
  };
  if (look.material === "flesh") return base;
  const matTone: Tone = look.material === "gold" ? "gold" : look.material === "stone" ? "stone" : "dark";
  const mat = tf(matTone);
  const skin = look.material === "bronze" ? tf("mid") : mat;
  return {
    ...base,
    skin,
    skinShade: skin,
    hair: mat,
    hairDark: look.material === "bronze",
    top: mat,
    sleeve: mat,
    legs: mat,
    shoes: mat,
    trim: mat,
    accent: mat,
    metal: mat,
    white: look.material === "bronze" ? tf("mid") : mat,
    mat,
  };
}
