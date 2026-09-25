/**
 * Pass-3 review sheets (renderer-owned acceptance defects): eye states for
 * every faced kind, the gold → stone statue, the reworked human poses (lie,
 * kneel, carry, reach + cry, sit), birds (front view, close-ups, silhouette
 * LOD, dead), plants by bloom tone, the reed in every pose, props at their
 * real size in a hand, environments in winter / rain / storm, and fx.
 *
 *   npx tsx scripts/sheet-v3.ts [eyes|statue|poses|birds|plants|props|world|fx] ...
 *
 * Writes v3-*.png to $SHEET_DIR (default: the session scratchpad render/sheets-v3).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Angle, Box, CharacterLook, EnvFeature, Environment, Expression, Facing, FxId, HumanLook, Pose, PropId, Shot, Tone } from "../src/contracts.js";
import type { DrawContext, FigureDrawing, FigureRequest } from "../src/internal.js";
import { rig } from "../src/rig/index.js";
import { props } from "../src/props/index.js";
import { environments } from "../src/env/index.js";
import { fx } from "../src/fx/index.js";
import { adoptFragment } from "../src/scene/ids.js";
import { svgToPng } from "../src/raster.js";
import { INK, PAGE_BG, STROKE, toneDefs } from "../src/style.js";
import { esc, n } from "../src/svg.js";
import { seeded } from "../src/prng.js";

const OUT =
  process.env.SHEET_DIR ??
  "/private/tmp/claude-501/-Users-comreton-Desktop/3b1640fe-8ce0-4ed7-b544-0b35ca3ba64d/scratchpad/render/sheets-v3";
mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const want = (k: string) => args.length === 0 || args.includes(k);

type Crop = "full" | "medium" | "close" | "xclose";
type Eyes = NonNullable<FigureRequest["eyes"]>;

interface Cell {
  look: CharacterLook;
  pose?: Pose;
  expression?: Expression;
  facing?: Facing;
  eyes?: Eyes;
  crop?: Crop;
  label: string;
  /** Page-space head radius to draw at (drives the rig's level of detail); fits the cell otherwise. */
  headPx?: number;
  detail?: FigureRequest["detail"];
  held?: PropId;
  heldTone?: Tone;
  /** A background tone behind the cell (tests the paper rim). */
  bg?: string;
}

function scaledToneDefs(prefix: string, scale: number): string {
  const k = 1 / scale;
  return toneDefs(prefix)
    .replace(/patternUnits="userSpaceOnUse" patternTransform="rotate\(([-\d.]+)\)"/g, (_m, r: string) => `patternUnits="userSpaceOnUse" patternTransform="scale(${n(k)}) rotate(${r})"`)
    .replace(/patternUnits="userSpaceOnUse">/g, `patternUnits="userSpaceOnUse" patternTransform="scale(${n(k)})">`);
}

let uid = 0;
function draw(c: Cell, lineWidth: number, prefix: string): FigureDrawing {
  return rig.draw(
    {
      look: c.look,
      pose: c.pose ?? "stand",
      expression: c.expression ?? "neutral",
      facing: c.facing ?? "right",
      lineWidth,
      seed: 11,
      detail: c.detail ?? "full",
      rim: true,
      ...(c.eyes ? { eyes: c.eyes } : {}),
    },
    { idPrefix: prefix, rand: seeded("sheet-v3", prefix) },
  );
}

function renderCell(c: Cell, x: number, y: number, w: number, h: number): string {
  const prefix = `v${uid++}-`;
  const labelH = 20;
  const boxH = h - labelH - 4;
  const probe = draw(c, 1, prefix).anchors;
  const crop = c.crop ?? "full";
  let x0: number;
  let x1: number;
  let y0: number;
  let y1: number;
  const r = probe.headRadius;
  if (crop === "xclose") {
    x0 = probe.head.x - r * 1.2;
    x1 = probe.head.x + r * 1.2;
    y0 = probe.head.y - r * 1.2;
    y1 = probe.head.y + r * 1.2;
  } else if (crop === "close") {
    x0 = probe.head.x - r * 2;
    x1 = probe.head.x + r * 2;
    y0 = probe.head.y - r * 1.5;
    y1 = Math.max(probe.shoulders, probe.head.y + r * 1.4) + r * 0.4;
  } else if (crop === "medium") {
    y0 = probe.head.y - r * 1.4;
    y1 = Math.max(probe.waist, probe.head.y + r * 2.6);
    const half = (y1 - y0) * 0.55;
    x0 = probe.head.x - half;
    x1 = probe.head.x + half;
  } else {
    x0 = probe.left - 2;
    x1 = probe.right + 2;
    y0 = probe.top - 2;
    y1 = 2;
  }
  let scale = Math.min((w - 8) / Math.max(1, x1 - x0), (boxH - 6) / Math.max(1, y1 - y0));
  if (c.headPx) scale = c.headPx / r;
  const d = draw(c, STROKE.figureOutline / scale, prefix);
  const flip = c.facing === "left" ? -1 : 1;
  const cx = (x0 + x1) / 2;
  const tx = x + w / 2 - cx * scale * flip;
  const ty = crop === "full" ? y + 4 + boxH - 6 - y1 * scale : y + 4 + (boxH - (y1 - y0) * scale) / 2 - y0 * scale;
  let held = "";
  if (c.held) {
    const pr = props.draw(c.held, STROKE.figureOutline / scale, { idPrefix: prefix, rand: seeded("held") }, c.heldTone);
    const hand = d.anchors.hand ?? { x: d.anchors.right * 0.8, y: d.anchors.waist };
    held = `<g transform="translate(${n(hand.x - pr.grip.x)} ${n(hand.y - pr.grip.y)})">${pr.svg}</g>`;
  }
  const clip = `${prefix}clip`;
  return (
    `<defs>${scaledToneDefs(prefix, scale)}<clipPath id="${clip}"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(boxH)}"/></clipPath></defs>` +
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="#fff" stroke="#bbb"/>` +
    (c.bg ? `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(boxH)}" fill="${c.bg}"/>` : "") +
    (crop === "full" ? `<line x1="${n(x + 4)}" x2="${n(x + w - 4)}" y1="${n(ty)}" y2="${n(ty)}" stroke="#ddd"/>` : "") +
    `<g clip-path="url(#${clip})"><g transform="translate(${n(tx)} ${n(ty)}) scale(${n(scale * flip)} ${n(scale)})">${d.svg}${held}</g></g>` +
    `<text x="${n(x + w / 2)}" y="${n(y + h - 6)}" text-anchor="middle" font-family="PS Comic" font-weight="700" font-size="12" fill="${INK}">${esc(c.label)}</text>`
  );
}

function sheet(name: string, title: string, cells: Cell[], cols: number, cw = 200, ch = 220): void {
  const rows = Math.ceil(cells.length / cols);
  const W = cols * cw + 20;
  const H = rows * ch + 56;
  let body = "";
  cells.forEach((c, i) => {
    body += renderCell(c, 10 + (i % cols) * cw, 46 + Math.floor(i / cols) * ch, cw - 6, ch - 6);
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${PAGE_BG}"/><text x="14" y="32" font-family="PS Comic" font-weight="700" font-size="20" fill="${INK}">${esc(title)}</text>${body}</svg>`;
  const file = path.join(OUT, `v3-${name}.png`);
  writeFileSync(file, svgToPng(svg, { width: W }));
  console.log(file, cells.length, "cells");
}

// ---------------------------------------------------------------------------

const PRINCE: HumanLook = { kind: "human", age: "adult", build: "slim", height: "tall", frame: "masc", hair: "short", hair_tone: "gold", facial_hair: "none", outfit: "royal", outfit_tone: "gold", headwear: "crown", accessories: ["sword_belt"], skin: "light", material: "gold" };
const STONE_PRINCE: HumanLook = { ...PRINCE, material: "stone" };
const STUDENT: HumanLook = { kind: "human", age: "adult", build: "slim", height: "average", frame: "masc", hair: "curly", hair_tone: "dark", facial_hair: "none", outfit: "scholar", outfit_tone: "mid", headwear: "none", accessories: ["glasses"], skin: "light", material: "flesh" };
const HANS: HumanLook = { kind: "human", age: "adult", build: "slim", height: "short", frame: "masc", hair: "short", hair_tone: "light", facial_hair: "none", outfit: "work_apron", outfit_tone: "mid", headwear: "cap", accessories: [], skin: "light", material: "flesh" };
const BOY: HumanLook = { kind: "human", age: "child", build: "slim", height: "short", frame: "masc", hair: "short", hair_tone: "light", facial_hair: "none", outfit: "tunic", outfit_tone: "white", headwear: "none", accessories: [], skin: "light", material: "flesh" };
const SICK: HumanLook = { kind: "human", age: "child", build: "slim", height: "short", frame: "masc", hair: "messy", hair_tone: "light", facial_hair: "none", outfit: "rags", outfit_tone: "light", headwear: "none", accessories: [], skin: "light", material: "flesh" };
const GIRL: HumanLook = { kind: "human", age: "teen", build: "slim", height: "average", frame: "fem", hair: "long_straight", hair_tone: "light", facial_hair: "none", outfit: "dress", outfit_tone: "light", headwear: "none", accessories: [], skin: "light", material: "flesh" };
const MILLER: HumanLook = { kind: "human", age: "adult", build: "broad", height: "tall", frame: "masc", hair: "short", hair_tone: "dark", facial_hair: "beard", outfit: "long_coat", outfit_tone: "dark", headwear: "wide_hat", accessories: ["cane"], skin: "light", material: "flesh" };
const SWALLOW: CharacterLook = { kind: "bird", species: "swallow", tone: "dark" };
const NIGHTINGALE: CharacterLook = { kind: "bird", species: "nightingale", tone: "mid" };
const LINNET: CharacterLook = { kind: "bird", species: "linnet", tone: "mid" };
const DUCK: CharacterLook = { kind: "bird", species: "duck", tone: "white" };
const RAT: CharacterLook = { kind: "animal", species: "rat", tone: "mid" };
const FROG: CharacterLook = { kind: "animal", species: "frog", tone: "mid" };
const ROCKET: CharacterLook = { kind: "object", shape: "rocket", tone: "dark", face: true };
const WHEEL: CharacterLook = { kind: "object", shape: "wheel", tone: "mid", face: true };
const ROSE_FACE: CharacterLook = { kind: "plant", species: "rose_bush", tone: "mid", face: true };
const OAK: CharacterLook = { kind: "plant", species: "oak", tone: "dots", face: true };
const REED: CharacterLook = { kind: "plant", species: "reed", tone: "mid", face: false };
const BEE: CharacterLook = { kind: "insect", species: "dragonfly", tone: "light" };
const WIND: CharacterLook = { kind: "spirit", element: "wind" };
const STATE: CharacterLook = { kind: "emblem", emblem: "state" };
const EYES: Eyes[] = ["open", "closed", "blind", "dead"];

if (want("eyes")) {
  const faced: [string, CharacterLook, Facing][] = [
    ["prince gold", PRINCE, "right"],
    ["prince stone", STONE_PRINCE, "front"],
    ["student", STUDENT, "right"],
    ["girl", GIRL, "front"],
    ["swallow", SWALLOW, "right"],
    ["swallow", SWALLOW, "front"],
    ["nightingale", NIGHTINGALE, "right"],
    ["rat", RAT, "right"],
    ["frog", FROG, "front"],
    ["rocket", ROCKET, "right"],
    ["rose", ROSE_FACE, "front"],
    ["oak", OAK, "right"],
    ["dragonfly", BEE, "front"],
    ["wind", WIND, "right"],
    ["state", STATE, "front"],
  ];
  const cells: Cell[] = [];
  for (const [nm, look, facing] of faced) for (const eyes of EYES) cells.push({ look, facing, eyes, crop: "close", label: `${nm} ${facing} ${eyes}`, pose: "stand", expression: "sad" });
  sheet("eyes", "eyes: open / closed / blind / dead (expression sad)", cells, 8, 190, 200);
  const ex: Cell[] = [];
  for (const look of [SWALLOW, NIGHTINGALE, RAT] as CharacterLook[]) {
    for (const e of ["pain", "gentle", "asleep", "cry", "love"] as Expression[]) ex.push({ look, expression: e, crop: "close", label: `${(look as { species: string }).species} ${e}`, facing: "right" });
    ex.push({ look, expression: "pain", crop: "close", facing: "front", label: `${(look as { species: string }).species} pain front` });
  }
  for (const e of ["pain", "gentle", "smug", "happy"] as Expression[]) ex.push({ look: STUDENT, expression: e, crop: "close", facing: "right", label: `student ${e}` });
  sheet("expr", "creature pain (squeezed shut, no X) / gentle (no blush) / human smug+happy", ex, 8, 190, 200);
}

if (want("statue")) {
  const cells: Cell[] = [];
  for (const [nm, look] of [
    ["gold", PRINCE],
    ["stone", STONE_PRINCE],
  ] as const) {
    cells.push({ look, label: `${nm} full`, facing: "front" });
    cells.push({ look, label: `${nm} 3/4`, facing: "right" });
    cells.push({ look, label: `${nm} close`, facing: "front", crop: "close", expression: "sad" });
    cells.push({ look, label: `${nm} blind close`, facing: "front", crop: "close", eyes: "blind", expression: "sad" });
    cells.push({ look, label: `${nm} medium 3/4 blind`, facing: "right", crop: "medium", eyes: "blind", expression: "gentle" });
  }
  sheet("statue", "statue: gold vs stone (same statue, shabby grey), blind", cells, 5, 220, 320);
}

if (want("poses")) {
  const cells: Cell[] = [];
  for (const [nm, look] of [
    ["student", STUDENT],
    ["sick boy", SICK],
    ["girl", GIRL],
  ] as const) {
    for (const f of ["right", "front", "left"] as Facing[]) cells.push({ look, pose: "lie", facing: f, expression: nm === "sick boy" ? "tired" : "sad", label: `${nm} lie ${f}` });
  }
  for (const f of ["right", "front"] as Facing[]) {
    cells.push({ look: STUDENT, pose: "kneel", facing: f, expression: "cry", label: `kneel ${f}` });
    cells.push({ look: HANS, pose: "carry", facing: f, expression: "tired", held: "bag", heldTone: "light", label: `carry bag ${f}` });
    cells.push({ look: BOY, pose: "reach", facing: f, expression: "cry", label: `reach+cry ${f}` });
    cells.push({ look: HANS, pose: "sit", facing: f, expression: "asleep", label: `sit ${f}` });
    cells.push({ look: MILLER, pose: "hold", facing: f, expression: "smug", held: "lamp", label: `hold lamp ${f}` });
    cells.push({ look: GIRL, pose: "carry", facing: f, expression: "happy", held: "basket", label: `carry basket ${f}` });
  }
  cells.push({ look: BOY, pose: "reach", facing: "right", expression: "cry", crop: "medium", label: "reach+cry medium" });
  cells.push({ look: HANS, pose: "walk", facing: "right", expression: "tired", held: "wheelbarrow", label: "walk wheelbarrow" });
  cells.push({ look: HANS, pose: "hold", facing: "right", expression: "neutral", held: "wheelbarrow", label: "hold wheelbarrow" });
  cells.push({ look: STUDENT, pose: "reach", facing: "right", expression: "happy", held: "rose", heldTone: "dark", label: "reach with rose" });
  cells.push({ look: STUDENT, pose: "lie", facing: "front", expression: "sad", held: "book", label: "lie holding book" });
  sheet("poses", "human poses: lie (every facing), kneel, carry (load at chest), reach+cry, sit, hold", cells, 6, 240, 260);
}

if (want("birds")) {
  const cells: Cell[] = [];
  for (const look of [SWALLOW, NIGHTINGALE, LINNET, DUCK] as CharacterLook[]) {
    const sp = (look as { species: string }).species;
    for (const [pose, facing] of [
      ["stand", "front"],
      ["perch", "front"],
      ["talk", "front"],
      ["stand", "right"],
      ["perch", "right"],
      ["fly", "right"],
    ] as [Pose, Facing][]) cells.push({ look, pose, facing, label: `${sp} ${pose} ${facing}` });
    cells.push({ look, pose: "stand", facing: "right", crop: "close", expression: "sad", label: `${sp} close` });
    cells.push({ look, pose: "stand", facing: "front", crop: "close", expression: "neutral", label: `${sp} close front` });
    cells.push({ look, pose: "lie", facing: "right", eyes: "dead", expression: "neutral", label: `${sp} dead lie` });
    cells.push({ look, pose: "stand", facing: "right", headPx: 5, label: `${sp} silhouette`, bg: "#555" });
    cells.push({ look, pose: "fly", facing: "right", headPx: 5, label: `${sp} fly silhouette`, bg: "#555" });
    cells.push({ look, pose: "stand", facing: "front", headPx: 5, label: `${sp} front silhouette`, bg: "#555" });
  }
  sheet("birds", "birds: front (not a penguin), profile, close-ups, dead, silhouette LOD on dark", cells, 6, 200, 220);
}

if (want("plants")) {
  const cells: Cell[] = [];
  for (const species of ["rose_bush", "flower", "tree", "oak"] as const) {
    for (const tone of ["white", "light", "mid", "dark"] as Tone[]) cells.push({ look: { kind: "plant", species, tone, face: false }, label: `${species} ${tone}` });
  }
  cells.push({ look: { kind: "plant", species: "rose_bush", tone: "dark", face: false }, eyes: "dead", label: "rose_bush dark frost-bitten (dead)" });
  cells.push({ look: { kind: "plant", species: "rose_bush", tone: "white", face: true }, label: "rose_bush face" });
  for (const pose of ["stand", "talk", "bow", "reach", "cower", "wave"] as Pose[]) cells.push({ look: REED, pose, label: `reed ${pose}` });
  cells.push({ look: REED, pose: "stand", crop: "medium", label: "reed medium" });
  cells.push({ look: REED, pose: "bow", crop: "medium", label: "reed bow medium" });
  cells.push({ look: REED, pose: "stand", crop: "close", label: "reed close" });
  cells.push({ look: REED, pose: "stand", headPx: 6, label: "reed silhouette" });
  sheet("plants", "plants: bloom tone (white/light/mid/dark roses), frost-bitten, the reed in every pose and shot", cells, 6, 200, 260);
}

// ---------------------------------------------------------------------------
// props at their nominal size next to an adult, and held in a hand

if (want("props")) {
  const W = 1500;
  const rowH = 300;
  const list: [PropId, Tone | undefined][] = [
    ["rose", undefined],
    ["rose", "white"],
    ["rose", "light"],
    ["gem", "black"],
    ["gem", "dark"],
    ["gem", "mid"],
    ["gem", "light"],
    ["wheelbarrow", undefined],
    ["basket", undefined],
    ["bag", "light"],
    ["lamp", undefined],
    ["flower", undefined],
  ];
  let body = "";
  const adult = rig.draw({ look: STUDENT, pose: "stand", expression: "neutral", facing: "right", lineWidth: STROKE.figureOutline / 2.4, seed: 3 }, { idPrefix: "pa-", rand: seeded("x") });
  body += `<defs>${scaledToneDefs("pa-", 2.4)}</defs><g transform="translate(60 ${rowH - 20}) scale(2.4)">${adult.svg}</g>`;
  let x = 150;
  for (const [id, tone] of list) {
    const s = 2.4;
    const d = props.draw(id, STROKE.figureOutline / s, { idPrefix: `pp${x}-`, rand: seeded("p") }, tone);
    body += `<defs>${scaledToneDefs(`pp${x}-`, s)}</defs><g transform="translate(${x + (d.width * s) / 2} ${rowH - 20}) scale(${s})">${d.svg}</g>`;
    body += `<text x="${x}" y="${rowH}" font-family="PS Comic" font-size="12" fill="${INK}">${id}${tone ? ` ${tone}` : ""}</text>`;
    x += Math.max(70, d.width * s + 30);
  }
  // big insert-scale versions
  let x2 = 20;
  for (const [id, tone] of list) {
    const d0 = props.draw(id, 1, { idPrefix: "q-", rand: seeded("p") }, tone);
    const s = Math.min(160 / d0.height, 200 / d0.width);
    const d = props.draw(id, STROKE.figureOutline / s, { idPrefix: `pq${x2}-`, rand: seeded("p") }, tone);
    body += `<defs>${scaledToneDefs(`pq${x2}-`, s)}</defs><g transform="translate(${x2 + (d.width * s) / 2} ${rowH + 200}) scale(${s})">${d.svg}</g>`;
    x2 += d.width * s + 24;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${rowH + 230}" width="${W}" height="${rowH + 230}"><rect width="${W}" height="${rowH + 230}" fill="#fff"/>${body}</svg>`;
  writeFileSync(path.join(OUT, "v3-props.png"), svgToPng(svg, { width: W }));
  console.log(path.join(OUT, "v3-props.png"));
}

// ---------------------------------------------------------------------------
// environments (weather / interiors / statue column anchors) and fx

function envCell(env: Environment, features: EnvFeature[], shot: Shot, angle: Angle, time: "day" | "dusk" | "night" | "dawn", weather: "clear" | "rain" | "snow" | "wind" | "storm" | "fog", box: Box, key: string, fxIds: FxId[] = []): string {
  const ctx: DrawContext = { idPrefix: `e${key}-`, rand: seeded("env", key) };
  const d = environments.draw({ environment: env, features, box, shot, angle, time, weather, lineWidth: STROKE.environment, seed: 99 }, ctx);
  const f = adoptFragment(d.svg, `e${key}-`, "env");
  let marks = "";
  for (const [k, p] of Object.entries(d.anchors ?? {})) marks += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="5" fill="#e22"/><text x="${n(p.x + 6)}" y="${n(p.y - 4)}" font-size="12" fill="#e22">${esc(k)}</text>`;
  let under = "";
  let over = "";
  for (const id of fxIds) {
    const o = fx.draw({ fx: id, box, polygon: [], focus: { x: box.x + box.w * 0.5, y: box.y + box.h * 0.6 }, heads: [{ point: { x: box.x + box.w * 0.5, y: box.y + box.h * 0.6 }, radius: 26 }], lineWidth: STROKE.fx, seed: 5 }, ctx);
    under += o.under;
    over += o.over;
  }
  const clip = `e${key}-clip`;
  return (
    `<defs>${toneDefs(`e${key}-`)}${f.defs}<clipPath id="${clip}"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"/></clipPath></defs>` +
    `<g clip-path="url(#${clip})">${f.body}${under}<circle cx="${n(box.x + box.w * 0.5)}" cy="${n(box.y + box.h * 0.6)}" r="26" fill="#fff" stroke="#e22" stroke-dasharray="4 3"/>${over}</g>${marks}` +
    `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="none" stroke="${INK}" stroke-width="3"/>` +
    `<text x="${box.x}" y="${box.y + box.h + 16}" font-family="PS Comic" font-size="13" fill="${INK}">${esc(`${env} ${shot} ${angle} ${time} ${weather} ${fxIds.join(",")} [${features.join(",")}]`)}</text>`
  );
}

function envSheet(name: string, cells: Parameters<typeof envCell>[], cols = 3, cw = 420, ch = 300): void {
  const rows = Math.ceil(cells.length / cols);
  const W = cols * (cw + 20) + 20;
  const H = rows * (ch + 40) + 20;
  let body = "";
  cells.forEach((c, i) => {
    const box = { x: 20 + (i % cols) * (cw + 20), y: 20 + Math.floor(i / cols) * (ch + 40), w: cw, h: ch };
    body += envCell(c[0], c[1], c[2], c[3], c[4], c[5], box, `${name}${i}`, c[8]);
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${PAGE_BG}"/>${body}</svg>`;
  writeFileSync(path.join(OUT, `v3-${name}.png`), svgToPng(svg, { width: W }));
  console.log(path.join(OUT, `v3-${name}.png`));
}

const B0: Box = { x: 0, y: 0, w: 0, h: 0 };
if (want("world")) {
  const garden: EnvFeature[] = ["trees", "fence", "high_wall", "gate"];
  envSheet("winter", [
    ["garden", garden, "establishing", "eye", "day", "snow", B0, "", []],
    ["garden", garden, "wide", "eye", "day", "snow", B0, "", []],
    ["garden", garden, "full", "low", "day", "snow", B0, "", []],
    ["garden", garden, "wide", "eye", "day", "clear", B0, "", []],
    ["city_square", ["statue_column", "lamp_post", "bridge"], "wide", "eye", "night", "snow", B0, "", []],
    ["cottage", ["door", "fireplace"], "wide", "eye", "day", "snow", B0, "", []],
    ["street", [], "wide", "eye", "day", "rain", B0, "", []],
    ["street", [], "full", "eye", "night", "storm", B0, "", []],
    ["garden", ["trees", "flowers"], "full", "eye", "day", "rain", B0, "", []],
  ]);
  envSheet("column", [
    ["city_square", ["statue_column", "lamp_post", "bridge"], "establishing", "low", "day", "clear", B0, "", []],
    ["city_square", ["statue_column", "lamp_post", "bridge"], "wide", "eye", "day", "clear", B0, "", []],
    ["city_square", ["statue_column", "lamp_post", "bridge"], "full", "eye", "day", "clear", B0, "", []],
    ["city_square", ["statue_column", "lamp_post", "bridge"], "medium", "eye", "day", "clear", B0, "", []],
    ["city_square", ["statue_column", "lamp_post", "bridge"], "medium", "low", "dusk", "clear", B0, "", []],
    ["city_square", ["statue_column", "lamp_post", "bridge"], "close", "eye", "night", "clear", B0, "", []],
    ["room_poor", ["window", "table", "bed"], "wide", "eye", "night", "clear", B0, "", []],
    ["cottage", ["door", "fireplace"], "medium", "eye", "night", "clear", B0, "", []],
    ["garden", ["trees", "flowers"], "full", "eye", "night", "clear", B0, "", []],
  ]);
  envSheet("chimneys", [
    ["city_square", ["statue_column"], "establishing", "low", "day", "clear", B0, "", []],
    ["city_square", ["statue_column"], "medium", "eye", "day", "clear", B0, "", []],
    ["street", [], "wide", "low", "day", "clear", B0, "", []],
    ["rooftops", [], "wide", "eye", "night", "clear", B0, "", []],
    ["city_square", [], "wide", "high", "day", "clear", B0, "", []],
    ["street", [], "wide", "worms_eye", "day", "clear", B0, "", []],
  ]);
}

if (want("fx")) {
  envSheet("fx", [
    ["garden", ["flowers"], "wide", "eye", "night", "clear", B0, "", ["fireworks"]],
    ["garden", ["flowers"], "full", "low", "night", "clear", B0, "", ["fireworks"]],
    ["garden", ["flowers"], "medium", "eye", "day", "clear", B0, "", ["fireworks"]],
    ["country_road", [], "wide", "eye", "day", "clear", B0, "", ["speed_lines"]],
    ["garden", ["trees"], "full", "high", "day", "clear", B0, "", ["speed_lines"]],
    ["city_square", ["statue_column"], "establishing", "low", "day", "clear", B0, "", ["light_rays", "sparkle"]],
  ]);
}
