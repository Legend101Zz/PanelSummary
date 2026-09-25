/**
 * Contact sheets for the human + crowd rigs (visual self-review).
 *
 *   npx tsx scripts/sheet-human.ts [outDir]
 *
 * Writes human-*.png: hair styles × ages, expressions (front + 3/4) for two
 * characters, every pose, outfits/headwear/accessories, a cast lineup with a
 * pure-silhouette proof, a phone-scale lineup and crowds.
 *
 * Tone patterns are defined per cell and scaled by 1/scale so screentone dots
 * keep their page size, the way a composer should emit them for a figure
 * group drawn with transform="scale(s)".
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  ACCESSORIES,
  EXPRESSIONS,
  HAIR_STYLES,
  HEADWEAR,
  OUTFITS,
  type CrowdLook,
  type Expression,
  type Facing,
  type HumanLook,
  type Pose,
} from "../src/contracts.js";
import { svgToPng } from "../src/raster.js";
import { STROKE, toneDefs } from "../src/style.js";
import { humanRig, HUMAN_POSES } from "../src/rig/human.js";
import { crowdRig, CROWD_POSES } from "../src/rig/crowd.js";
import type { FigureDrawing } from "../src/internal.js";

const OUT = process.argv[2] ?? "/private/tmp/claude-501/-Users-comreton-Desktop/3b1640fe-8ce0-4ed7-b544-0b35ca3ba64d/scratchpad/render/sheets";
mkdirSync(OUT, { recursive: true });

type Crop = "full" | "medium" | "close";

const n2 = (x: number) => (Math.round(x * 100) / 100).toString();

function scaledDefs(prefix: string, scale: number): string {
  const k = n2(1 / scale);
  return toneDefs(prefix)
    .replace(/patternTransform="rotate\(([-\d.]+)\)"/g, `patternTransform="scale(${k}) rotate($1)"`)
    .replace(/<pattern ([^>]*?)patternUnits="userSpaceOnUse"(?![^>]*patternTransform)/g, `<pattern $1patternUnits="userSpaceOnUse" patternTransform="scale(${k})"`);
}

let cellId = 0;

interface CellOpts {
  x: number;
  y: number;
  w: number;
  h: number;
  crop: Crop;
  label?: string;
  silhouette?: boolean;
  /** Fixed scale (figure units → page px) instead of fitting. */
  scale?: number;
}

type Draw = (lineWidth: number, prefix: string) => FigureDrawing;

function cell(draw: Draw, o: CellOpts): string {
  const id = `c${cellId++}-`;
  // First pass to measure.
  const probe = draw(1, id);
  const a = probe.anchors;
  let x0: number;
  let x1: number;
  let y0: number;
  let y1: number;
  if (o.crop === "close") {
    const r = a.headRadius;
    y0 = a.head.y - r * 1.55;
    y1 = a.head.y + r * 2.1;
    x0 = a.head.x - r * 1.9;
    x1 = a.head.x + r * 1.9;
  } else if (o.crop === "medium") {
    y0 = a.top - 2;
    y1 = a.waist + (a.waist - a.top) * 0.18;
    const cx = a.head.x;
    const half = (y1 - y0) * 0.5;
    x0 = cx - half;
    x1 = cx + half;
  } else {
    y0 = Math.min(a.top, -5) - 3;
    y1 = 3;
    x0 = a.left - 3;
    x1 = a.right + 3;
  }
  const labelH = o.label ? 18 : 0;
  const availH = o.h - labelH - 6;
  const availW = o.w - 6;
  const scale = o.scale ?? Math.min(availW / (x1 - x0), availH / (y1 - y0));
  const fig = draw(STROKE.figureOutline / scale, id);
  const cx = (x0 + x1) / 2;
  const tx = o.x + o.w / 2 - cx * scale;
  const ty = o.crop === "full" ? o.y + o.h - labelH - 4 - y1 * scale : o.y + 3 + (availH - (y1 - y0) * scale) / 2 - y0 * scale;
  const clip = `${id}clip`;
  const body = o.silhouette ? `<g filter="url(#${id}sil)">${fig.svg}</g>` : fig.svg;
  const silFilter = o.silhouette
    ? `<filter id="${id}sil" x="-0.2" y="-0.2" width="1.4" height="1.4"><feFlood flood-color="#111"/><feComposite in2="SourceAlpha" operator="in"/></filter>`
    : "";
  const label = o.label
    ? `<text x="${n2(o.x + o.w / 2)}" y="${n2(o.y + o.h - 5)}" font-family="PS Comic" font-weight="700" font-size="13" text-anchor="middle" fill="#333">${o.label}</text>`
    : "";
  return (
    `<defs>${scaledDefs(id, scale)}<clipPath id="${clip}"><rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h - labelH}"/></clipPath>${silFilter}</defs>` +
    `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="#fff" stroke="#ccc" stroke-width="1"/>` +
    `<g clip-path="url(#${clip})"><g transform="translate(${n2(tx)} ${n2(ty)}) scale(${n2(scale)})">${body}</g></g>` +
    label
  );
}

function sheet(name: string, w: number, h: number, content: string, pxWidth = w): void {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#eceae4"/>${content}</svg>`;
  const file = path.join(OUT, `human-${name}.png`);
  writeFileSync(file, svgToPng(svg, { width: pxWidth }));
  console.log(`${file}  (${(svg.length / 1024).toFixed(0)} KB svg)`);
}

function title(x: number, y: number, text: string, size = 18): string {
  return `<text x="${x}" y="${y}" font-family="PS Comic" font-weight="700" font-size="${size}" fill="#222">${text}</text>`;
}

const baseLook: HumanLook = {
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
const L = (p: Partial<HumanLook>): HumanLook => ({ ...baseLook, ...p });

const human =
  (look: HumanLook, pose: Pose, expression: Expression, facing: Facing, seed = 7): Draw =>
  (lineWidth, prefix) =>
    humanRig.draw({ look, pose, expression, facing, lineWidth, seed }, { idPrefix: prefix, rand: () => 0.5 });

// ---------------------------------------------------------------------------
// (a) hair styles × ages
// ---------------------------------------------------------------------------
{
  const cw = 150;
  const ch = 190;
  let s = title(10, 26, "Hair styles x ages (3/4 view) + adult front");
  const ages: [HumanLook["age"], HumanLook["frame"], HumanLook["hair_tone"]][] = [
    ["child", "fem", "black"],
    ["adult", "masc", "mid"],
    ["elder", "neutral", "white"],
  ];
  HAIR_STYLES.forEach((hair, i) => {
    ages.forEach(([age, frame, tone], r) => {
      const look = L({ age, frame, hair, hair_tone: tone, outfit: "shirt_trousers", outfit_tone: "mid" });
      s += cell(human(look, "stand", "neutral", "right", 3 + i), { x: 10 + i * cw, y: 40 + r * ch, w: cw - 4, h: ch - 4, crop: "medium", label: r === 0 ? hair : undefined });
    });
    const look = L({ age: "teen", frame: i % 2 ? "masc" : "fem", hair, hair_tone: i % 3 === 0 ? "dark" : i % 3 === 1 ? "black" : "light", outfit: "tunic", outfit_tone: "light" });
    s += cell(human(look, "stand", "happy", "front", 3 + i), { x: 10 + i * cw, y: 40 + 3 * ch, w: cw - 4, h: ch - 4, crop: "medium", label: "teen front" });
  });
  sheet("hair", 20 + 13 * cw, 50 + 4 * ch, s);
}

// ---------------------------------------------------------------------------
// (b) expressions: close-ups, front and 3/4, for two characters
// ---------------------------------------------------------------------------
for (const [key, look] of [
  ["expr-a", L({ age: "teen", frame: "fem", hair: "long_straight", hair_tone: "black", outfit: "dress", outfit_tone: "light" })],
  ["expr-b", L({ age: "adult", frame: "masc", hair: "side_part", hair_tone: "dark", skin: "mid", outfit: "suit", outfit_tone: "dark" })],
  ["expr-c", L({ age: "child", frame: "neutral", hair: "messy", hair_tone: "mid", skin: "dark", outfit: "rags", outfit_tone: "mid" })],
] as const) {
  const cw = 170;
  const ch = 200;
  let s = title(10, 26, `Expressions — ${look.age} ${look.frame}, ${look.skin} skin (front | 3/4)`);
  EXPRESSIONS.forEach((e, i) => {
    const col = (i % 6) * 2;
    const row = Math.floor(i / 6);
    s += cell(human(look, "stand", e, "front"), { x: 10 + col * cw, y: 40 + row * ch, w: cw - 4, h: ch - 4, crop: "close", label: e });
    s += cell(human(look, "stand", e, "right"), { x: 10 + (col + 1) * cw, y: 40 + row * ch, w: cw - 4, h: ch - 4, crop: "close", label: e });
  });
  sheet(key, 20 + 12 * cw, 50 + 3 * ch, s);
}

// ---------------------------------------------------------------------------
// (c) poses
// ---------------------------------------------------------------------------
{
  const cw = 180;
  const ch = 260;
  let s = title(10, 26, "Every pose facing right; stand/walk/point/wave front and back");
  const look = L({ age: "adult", frame: "masc", hair: "spiky", hair_tone: "black", outfit: "long_coat", outfit_tone: "mid", accessories: ["scarf"] });
  HUMAN_POSES.forEach((p, i) => {
    s += cell(human(look, p, p === "cower" ? "afraid" : p === "bow" ? "gentle" : "determined", "right"), { x: 10 + (i % 10) * cw, y: 40 + Math.floor(i / 10) * ch, w: cw - 4, h: ch - 4, crop: "full", label: p });
  });
  const extra: Pose[] = ["stand", "walk", "point", "wave"];
  const look2 = L({ age: "teen", frame: "fem", hair: "ponytail", hair_tone: "dark", outfit: "dress", outfit_tone: "dots" });
  extra.forEach((p, i) => {
    s += cell(human(look2, p, "happy", "front"), { x: 10 + i * 2 * cw, y: 40 + 2 * ch, w: cw - 4, h: ch - 4, crop: "full", label: `${p} front` });
    s += cell(human(look2, p, "happy", "back"), { x: 10 + (i * 2 + 1) * cw, y: 40 + 2 * ch, w: cw - 4, h: ch - 4, crop: "full", label: `${p} back` });
  });
  sheet("poses", 20 + 10 * cw, 50 + 3 * ch, s);
}

// ---------------------------------------------------------------------------
// Outfits, headwear, accessories, facial hair, skins, materials
// ---------------------------------------------------------------------------
{
  const cw = 150;
  const ch = 250;
  let s = title(10, 26, "Outfits (row 1-2), headwear + facial hair (row 3), accessories + materials (row 4)");
  const tones = ["light", "mid", "dark", "dots", "stripes", "check", "white", "black", "dense_dots", "flowers", "light", "mid", "dark", "light"] as const;
  OUTFITS.forEach((o, i) => {
    const fem = ["dress", "gown"].includes(o);
    const look = L({ outfit: o, outfit_tone: tones[i], frame: fem ? "fem" : i % 2 ? "masc" : "neutral", hair: fem ? "bun" : "short", hair_tone: "dark" });
    s += cell(human(look, i % 2 ? "walk" : "stand", "neutral", "right"), { x: 10 + (i % 7) * cw, y: 40 + Math.floor(i / 7) * ch, w: cw - 4, h: ch - 4, crop: "full", label: o });
  });
  const fh = ["none", "stubble", "mustache", "beard", "long_beard"] as const;
  HEADWEAR.forEach((hw, i) => {
    const look = L({ headwear: hw, frame: i % 2 ? "masc" : "fem", hair: i % 2 ? "short" : "long_wavy", age: i > 5 ? "elder" : "adult", facial_hair: fh[i % 5], outfit: "robe", outfit_tone: "mid", hair_tone: i % 3 ? "dark" : "light" });
    s += cell(human(look, "stand", "neutral", i % 3 === 2 ? "front" : "right"), { x: 10 + i * cw, y: 40 + 2 * ch, w: cw - 4, h: ch * 0.7, crop: "medium", label: `${hw}/${fh[i % 5]}` });
  });
  ACCESSORIES.forEach((acc, i) => {
    const look = L({ accessories: [acc], outfit: "shirt_trousers", outfit_tone: "mid", frame: i % 2 ? "fem" : "masc", hair: i % 2 ? "bob" : "short" });
    s += cell(human(look, "stand", "neutral", i % 3 === 1 ? "front" : "right"), { x: 10 + i * cw, y: 40 + 2 * ch + ch * 0.72, w: cw - 4, h: ch - 4, crop: "full", label: acc });
  });
  const mats = [
    L({ material: "gold", outfit: "royal", headwear: "crown", accessories: ["sword_belt"], hair: "short" }),
    L({ material: "stone", outfit: "robe", hair: "long_wavy", frame: "fem" }),
    L({ material: "bronze", outfit: "armor", headwear: "helmet", frame: "masc" }),
    L({ skin: "mid", hair: "curly", hair_tone: "black", outfit: "work_apron", outfit_tone: "dark" }),
    L({ skin: "dark", hair: "braids", hair_tone: "black", frame: "fem", outfit: "gown", outfit_tone: "flowers" }),
  ];
  mats.forEach((look, i) => {
    s += cell(human(look, "talk", "happy", "right"), { x: 10 + (10 + (i % 5)) * cw * 0.0 + (i + 10) * cw, y: 40 + 2 * ch + ch * 0.72, w: cw - 4, h: ch - 4, crop: "full", label: `${look.material}/${look.skin}` });
  });
  sheet("outfits", 20 + 15 * cw, 50 + 3.8 * ch, s);
}

// ---------------------------------------------------------------------------
// (d) cast lineup + silhouettes + phone scale
// ---------------------------------------------------------------------------
const cast: [string, HumanLook, Pose, Expression][] = [
  ["gilded prince statue", L({ material: "gold", outfit: "royal", outfit_tone: "light", headwear: "crown", accessories: ["sword_belt", "cape"], hair: "short", frame: "masc", build: "slim" }), "stand", "sad"],
  ["tired seamstress", L({ frame: "fem", build: "slim", hair: "bun", hair_tone: "dark", outfit: "work_apron", outfit_tone: "mid", accessories: ["scarf"] }), "hold", "tired"],
  ["sick child in bed-clothes", L({ age: "child", build: "slim", hair: "messy", hair_tone: "light", outfit: "robe", outfit_tone: "white", height: "short" }), "lie", "pain"],
  ["heavy elder mayor", L({ age: "elder", build: "heavy", frame: "masc", hair: "bald", hair_tone: "white", facial_hair: "mustache", outfit: "suit", outfit_tone: "black", headwear: "top_hat", accessories: ["medal", "cane"] }), "stand", "smug"],
  ["young playwright", L({ age: "teen", frame: "masc", build: "slim", hair: "messy", hair_tone: "black", outfit: "long_coat", outfit_tone: "dark", accessories: ["scarf", "glasses"] }), "think", "thinking"],
  ["giant", L({ height: "giant", build: "broad", frame: "masc", hair: "curly", hair_tone: "dark", facial_hair: "long_beard", outfit: "rags", outfit_tone: "mid" }), "stand", "angry"],
  ["soldier", L({ frame: "masc", build: "broad", outfit: "uniform", outfit_tone: "dark", headwear: "helmet", accessories: ["sword_belt"], hair: "buzz" }), "hands_on_hips", "determined"],
  ["scholar", L({ age: "elder", frame: "neutral", hair: "long_straight", hair_tone: "white", facial_hair: "beard", outfit: "scholar", outfit_tone: "black", headwear: "wide_hat", accessories: ["glasses", "satchel"] }), "talk", "gentle"],
];
{
  // One shared scale so relative heights are honest.
  const cw = 190;
  const ch = 330;
  const fixed = 1.55;
  let s = title(10, 26, "Cast lineup (same scale) and pure silhouettes");
  cast.forEach(([name, look, pose, expr], i) => {
    s += cell(human(look, pose, expr, "right", 11 + i), { x: 10 + i * cw, y: 40, w: cw - 4, h: ch - 4, crop: "full", label: name, scale: fixed });
    s += cell(human(look, pose, expr, "right", 11 + i), { x: 10 + i * cw, y: 40 + ch, w: cw - 4, h: ch - 4, crop: "full", scale: fixed, silhouette: true });
  });
  sheet("cast", 20 + 8 * cw, 50 + 2 * ch, s);
  // Phone scale: a 1000-unit page shown 390px wide; full shot ~ 380 page units tall.
  let p = "";
  cast.forEach(([name, look, pose, expr], i) => {
    p += cell(human(look, pose, expr, i % 2 ? "front" : "right", 11 + i), { x: 10 + i * 170, y: 10, w: 166, h: 660, crop: "full", scale: 3.4, label: name.split(" ")[0] });
  });
  sheet("cast-phone", 20 + 8 * 170, 680, p, Math.round((20 + 8 * 170) * 0.39));
}

// ---------------------------------------------------------------------------
// Crowds
// ---------------------------------------------------------------------------
{
  const cw = 300;
  const ch = 250;
  let s = title(10, 26, "Crowds: few (top) and many (bottom)");
  const types: CrowdLook["crowd"][] = ["townsfolk", "children", "soldiers", "officials", "workers", "nobles"];
  const poses: Pose[] = ["talk", "wave", "walk", "stand", "point", "cower"];
  types.forEach((crowd, i) => {
    for (const [r, size] of (["few", "many"] as const).entries()) {
      const look: CrowdLook = { kind: "crowd", crowd, size };
      const draw: Draw = (lineWidth, prefix) =>
        crowdRig.draw({ look, pose: poses[i], expression: i === 5 ? "afraid" : "happy", facing: i % 3 === 2 ? "front" : "right", lineWidth, seed: 5 + i }, { idPrefix: prefix, rand: () => 0.5 });
      s += cell(draw, { x: 10 + i * cw, y: 40 + r * ch, w: cw - 4, h: ch - 4, crop: "full", label: `${crowd} ${size} ${poses[i]}` });
    }
  });
  sheet("crowd", 20 + 6 * cw, 50 + 2 * ch, s);
  void CROWD_POSES;
}
