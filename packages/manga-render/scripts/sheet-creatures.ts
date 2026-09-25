/**
 * Contact sheets for every non-human rig. Usage:
 *   npx tsx scripts/sheet-creatures.ts [filter...]
 * Filters: bird animal insect object plant spirit emblem expr poses small anchors
 * Writes PNGs to $SHEET_DIR (default: the session scratchpad render/sheets).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CharacterLook, Expression, Facing, Pose } from "../src/contracts.js";
import {
  ANIMAL_SPECIES,
  BIRD_SPECIES,
  EMBLEMS,
  INSECT_SPECIES,
  OBJECT_SHAPES,
  PLANT_SPECIES,
  SPIRIT_TYPES,
} from "../src/contracts.js";
import { rig } from "../src/rig/index.js";
import { svgToPng } from "../src/raster.js";
import { INK, PAGE_BG, STROKE, toneDefs } from "../src/style.js";
import { esc, n } from "../src/svg.js";

const OUT =
  process.env.SHEET_DIR ??
  "/private/tmp/claude-501/-Users-comreton-Desktop/3b1640fe-8ce0-4ed7-b544-0b35ca3ba64d/scratchpad/render/sheets";
mkdirSync(OUT, { recursive: true });

interface Cell {
  look: CharacterLook;
  pose: Pose;
  expression: Expression;
  facing: Facing;
  label: string;
}

const args = process.argv.slice(2);
const want = (k: string) => args.length === 0 || args.includes(k);
const showAnchors = args.includes("anchors");

function scaledToneDefs(prefix: string, scale: number): string {
  // keep screentones page-constant inside a scaled figure group
  const k = 1 / scale;
  return toneDefs(prefix)
    .replace(/patternUnits="userSpaceOnUse" patternTransform="rotate\(([-\d.]+)\)"/g, (_m, r: string) => `patternUnits="userSpaceOnUse" patternTransform="scale(${n(k)}) rotate(${r})"`)
    .replace(/patternUnits="userSpaceOnUse">/g, `patternUnits="userSpaceOnUse" patternTransform="scale(${n(k)})">`);
}

function svgBottom(svg: string): number {
  let max = -Infinity;
  for (const m of svg.matchAll(/ d="([^"]+)"/g)) {
    const nums = m[1].match(/-?\d*\.?\d+/g) ?? [];
    for (let i = 1; i < nums.length; i += 2) max = Math.max(max, Number(nums[i]));
  }
  return Number.isFinite(max) ? max : 0;
}

function renderCell(c: Cell, x: number, y: number, w: number, h: number, idx: number, sheet: string): string {
  const prefix = `${sheet}${idx}-`;
  const labelH = 22;
  const boxH = h - labelH - 8;
  const nominal = rig.nominalHeight(c.look);
  // first pass at unit line width to learn the bounds, then fit
  const probe = rig.draw({ look: c.look, pose: c.pose, expression: c.expression, facing: c.facing, lineWidth: nominal / 200, seed: 7 }, { idPrefix: prefix, rand: () => 0.5 });
  const a = probe.anchors;
  const bottom = Math.max(0, svgBottom(probe.svg));
  const figW = Math.max(a.right - a.left, 1);
  const figH = Math.max(bottom - a.top, 1);
  const s = Math.min((w - 16) / figW, (boxH - 6) / figH);
  const lineWidth = STROKE.figureOutline / s;
  const d = rig.draw({ look: c.look, pose: c.pose, expression: c.expression, facing: c.facing, lineWidth, seed: 7 }, { idPrefix: prefix, rand: () => 0.5 });
  const an = d.anchors;
  const cx = x + w / 2 - ((an.left + an.right) / 2) * s;
  const bot = svgBottom(d.svg);
  const gy = y + 4 + boxH - Math.max(0, bot) * s;
  let marks = "";
  if (showAnchors) {
    const P = (px: number, py: number) => ({ X: cx + px * s, Y: gy + py * s });
    const hd = P(an.head.x, an.head.y);
    const m = P(an.mouth.x, an.mouth.y);
    marks += `<circle cx="${n(hd.X)}" cy="${n(hd.Y)}" r="${n(an.headRadius * s)}" fill="none" stroke="#e33" stroke-width="1.2"/>`;
    marks += `<circle cx="${n(m.X)}" cy="${n(m.Y)}" r="3" fill="#e33"/>`;
    if (an.hand) {
      const hp = P(an.hand.x, an.hand.y);
      marks += `<circle cx="${n(hp.X)}" cy="${n(hp.Y)}" r="3" fill="#23e"/>`;
    }
    const top = P(0, an.top).Y;
    marks += `<rect x="${n(cx + an.left * s)}" y="${n(top)}" width="${n((an.right - an.left) * s)}" height="${n(gy - top)}" fill="none" stroke="#3a3" stroke-width="0.8"/>`;
    marks += `<line x1="${n(x + 4)}" x2="${n(x + w - 4)}" y1="${n(P(0, an.waist).Y)}" y2="${n(P(0, an.waist).Y)}" stroke="#e9a" stroke-width="0.8"/>`;
    marks += `<line x1="${n(x + 4)}" x2="${n(x + w - 4)}" y1="${n(P(0, an.shoulders).Y)}" y2="${n(P(0, an.shoulders).Y)}" stroke="#a9e" stroke-width="0.8"/>`;
  }
  if (bot > 0.02 * nominal) marks += `<text x="${n(x + 6)}" y="${n(y + 16)}" font-size="12" fill="#e33">below ground ${n(bot)}</text>`;
  const flip = c.facing === "left" ? ` scale(-1 1)` : "";
  return (
    `<defs>${scaledToneDefs(prefix, s)}</defs>` +
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="#fff" stroke="#bbb" stroke-width="1"/>` +
    `<line x1="${n(x + 6)}" x2="${n(x + w - 6)}" y1="${n(gy)}" y2="${n(gy)}" stroke="#ccc" stroke-width="1"/>` +
    `<g transform="translate(${n(cx)} ${n(gy)}) scale(${n(s)})${flip}">${d.svg}</g>` +
    marks +
    `<text x="${n(x + w / 2)}" y="${n(y + h - 8)}" text-anchor="middle" font-family="PS Comic" font-weight="700" font-size="14" fill="${INK}">${esc(c.label)}</text>`
  );
}

const BIG = args.includes("big") ? 2 : 1;
const ONLY = args.find((a) => a.startsWith("only="))?.slice(5);
function sheet(name: string, title: string, cells: Cell[], cols: number, cw = 200, ch = 230): void {
  if (ONLY && !name.includes(ONLY)) return;
  if (BIG > 1) {
    cw *= BIG;
    ch *= BIG;
    cols = Math.max(1, Math.round(cols / BIG));
  }
  const rows = Math.ceil(cells.length / cols);
  const W = cols * cw + 20;
  const H = rows * ch + 56;
  let body = "";
  cells.forEach((c, i) => {
    const x = 10 + (i % cols) * cw;
    const y = 46 + Math.floor(i / cols) * ch;
    body += renderCell(c, x, y, cw - 6, ch - 6, i, `s${name.replace(/[^a-z0-9]/gi, "")}`);
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${PAGE_BG}"/><text x="14" y="32" font-family="PS Comic" font-weight="700" font-size="22" fill="${INK}">${esc(title)}</text>${body}</svg>`;
  const file = path.join(OUT, `creatures-${name}.png`);
  writeFileSync(file, svgToPng(svg, { width: W }));
  if (args.includes("small")) {
    // phone-scale: a 1000-wide page shown at 390px
    writeFileSync(path.join(OUT, `creatures-${name}-phone.png`), svgToPng(svg, { width: Math.round(W * 0.39) }));
  }
  console.log(file, cells.length, "cells");
}

// ---------------------------------------------------------------------------

const looks: Record<string, CharacterLook[]> = {
  bird: BIRD_SPECIES.map((species) => ({ kind: "bird", species, tone: species === "crow" ? "black" : species === "swallow" ? "dark" : species === "dove" ? "white" : species === "owl" ? "dots" : species === "duck" ? "light" : "dots" }) as CharacterLook),
  animal: ANIMAL_SPECIES.map((species) => ({ kind: "animal", species, tone: species === "fox" ? "dots" : species === "bear" ? "dark" : species === "rat" ? "mid" : species === "cat" ? "stripes" : species === "frog" ? "dots" : species === "horse" ? "white" : species === "fish" ? "light" : "light" }) as CharacterLook),
  insect: INSECT_SPECIES.map((species) => ({ kind: "insect", species, tone: species === "bee" ? "stripes" : species === "dragonfly" ? "light" : "dots" }) as CharacterLook),
  object: OBJECT_SHAPES.map((shape) => ({ kind: "object", shape, tone: shape === "coin" ? "gold" : shape === "rocket" ? "stripes" : shape === "firecracker" ? "dots" : shape === "book" ? "dark" : shape === "wheel" ? "light" : "white", face: true }) as CharacterLook),
  plant: PLANT_SPECIES.map((species) => ({ kind: "plant", species, tone: species === "rose_bush" ? "dots" : species === "oak" ? "dots" : "light", face: true }) as CharacterLook),
  spirit: SPIRIT_TYPES.map((element) => ({ kind: "spirit", element }) as CharacterLook),
  emblem: EMBLEMS.map((emblem) => ({ kind: "emblem", emblem }) as CharacterLook),
};

function nameOf(l: CharacterLook): string {
  switch (l.kind) {
    case "bird":
    case "animal":
    case "insect":
    case "plant":
      return l.species;
    case "object":
      return l.shape;
    case "spirit":
      return l.element;
    case "emblem":
      return l.emblem;
    default:
      return l.kind;
  }
}

for (const kind of Object.keys(looks)) {
  if (!want(kind)) continue;
  const cells: Cell[] = [];
  const PICK = args.find((a) => a.startsWith("pick="))?.slice(5).split(",");
  for (const look of looks[kind]) {
    const nm = nameOf(look);
    if (PICK && !PICK.includes(nm)) continue;
    cells.push({ look, pose: "stand", expression: "neutral", facing: "right", label: `${nm} stand` });
    cells.push({ look, pose: "talk", expression: "neutral", facing: "right", label: `${nm} talk` });
    cells.push({ look, pose: "stand", expression: "neutral", facing: "front", label: `${nm} front` });
    cells.push({ look, pose: "stand", expression: "neutral", facing: "back", label: `${nm} back` });
  }
  sheet(`a-${kind}`, `(a) ${kind}: stand / talk / front / back — neutral`, cells, 8, 180, 210);
}

const exprTargets: CharacterLook[] = [
  { kind: "bird", species: "swallow", tone: "dark" },
  { kind: "bird", species: "nightingale", tone: "dots" },
  { kind: "animal", species: "rat", tone: "mid" },
  { kind: "object", shape: "rocket", tone: "stripes", face: true },
  { kind: "plant", species: "reed", tone: "light", face: true },
  { kind: "plant", species: "oak", tone: "dots", face: true },
  { kind: "spirit", element: "wind" },
  { kind: "emblem", emblem: "state" },
];
if (want("expr")) {
  for (const look of exprTargets) {
    const exprs = rig.supportedExpressions(look);
    const cells = exprs.map((e) => ({ look, pose: "stand" as Pose, expression: e, facing: "right" as Facing, label: e }));
    const talk = exprs.slice(0, 6).map((e) => ({ look, pose: "talk" as Pose, expression: e, facing: "front" as Facing, label: `${e} (front talk)` }));
    sheet(`b-expr-${nameOf(look)}`, `(b) ${nameOf(look)}: expressions`, [...cells, ...talk], 8, 170, 200);
  }
}

const poseTargets: CharacterLook[] = [
  { kind: "bird", species: "swallow", tone: "dark" },
  { kind: "animal", species: "rat", tone: "mid" },
  { kind: "object", shape: "rocket", tone: "stripes", face: true },
  { kind: "spirit", element: "frost" },
  { kind: "emblem", emblem: "state" },
];
if (want("poses")) {
  for (const look of poseTargets) {
    const poses = rig.supportedPoses(look);
    const cells = poses.map((p) => ({ look, pose: p, expression: (p === "fall" || p === "cower" ? "afraid" : p === "lie" ? "tired" : "neutral") as Expression, facing: "right" as Facing, label: p }));
    const fr = (["stand", "talk", poses.includes("fly") ? "fly" : "point"] as Pose[]).map((p) => ({ look, pose: p, expression: "happy" as Expression, facing: "front" as Facing, label: `${p} front` }));
    sheet(`c-poses-${nameOf(look)}`, `(c) ${nameOf(look)}: poses`, [...cells, ...fr], 8, 170, 200);
  }
}

/**
 * Close-ups the way the composer frames them: `close` puts head and shoulders
 * in the panel, `extreme_close` makes the head circle fill it. Every faced
 * creature must stay legible here (craft P1-9).
 */
function closeCell(look: CharacterLook, shot: "close" | "extreme_close", facing: Facing, expression: Expression, x: number, y: number, w: number, h: number, key: string, label: string): string {
  const prefix = `cu${key}-`;
  const probe = rig.draw({ look, pose: "talk", expression, facing, lineWidth: 1, seed: 7 }, { idPrefix: prefix, rand: () => 0.5 });
  const a = probe.anchors;
  const r = Math.max(0.5, a.headRadius);
  let scale: number;
  let headX: number;
  let headY: number;
  if (shot === "extreme_close") {
    scale = (0.98 * Math.min(h, w * 1.1)) / (2 * r);
    headX = x + w / 2;
    headY = y + h * 0.52;
  } else {
    const bottom = Math.max(a.shoulders, a.head.y + r * 1.4);
    const top = a.head.y - r * 1.15;
    scale = Math.min((0.8 * h) / Math.max(1, bottom - top), (0.6 * w) / (2 * r));
    headX = x + w / 2;
    headY = y + h * 0.9 - (bottom - a.head.y) * scale;
  }
  const d = rig.draw({ look, pose: "talk", expression, facing, lineWidth: STROKE.figureOutline / scale, seed: 7 }, { idPrefix: prefix, rand: () => 0.5 });
  const ox = headX - d.anchors.head.x * scale;
  const oy = headY - d.anchors.head.y * scale;
  const clip = `${prefix}clip`;
  return (
    `<defs>${scaledToneDefs(prefix, scale)}<clipPath id="${clip}"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"/></clipPath></defs>` +
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="#fff" stroke="#bbb"/>` +
    `<g clip-path="url(#${clip})"><g transform="translate(${n(ox)} ${n(oy)}) scale(${n(scale)})">${d.svg}</g></g>` +
    `<text x="${n(x + 4)}" y="${n(y + h + 16)}" font-family="PS Comic" font-weight="700" font-size="13" fill="${INK}">${esc(label)}</text>`
  );
}

if (want("close")) {
  for (const kind of ["bird", "animal", "insect", "object", "plant", "spirit", "emblem"]) {
    const list = looks[kind].filter((l) => !(l.kind === "object" || l.kind === "plant") || l.face);
    const cols = 6;
    const cw = 230;
    const ch = 200;
    const cells: string[] = [];
    let i = 0;
    for (const look of list) {
      for (const [shot, facing, e] of [
        ["extreme_close", "right", "neutral"],
        ["extreme_close", "front", "happy"],
        ["close", "right", "angry"],
      ] as const) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        cells.push(closeCell(look, shot, facing, e, 10 + col * (cw + 10), 46 + row * (ch + 30), cw, ch, `${kind}${i}`, `${nameOf(look)} ${shot === "close" ? "close" : "xclose"} ${facing} ${e}`));
        i += 1;
      }
    }
    const rows = Math.ceil(i / cols);
    const W = 10 + cols * (cw + 10);
    const H = 56 + rows * (ch + 30);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${PAGE_BG}"/><text x="14" y="32" font-family="PS Comic" font-weight="700" font-size="22" fill="${INK}">${esc(`(d) ${kind}: close-ups as framed by the composer`)}</text>${cells.join("")}</svg>`;
    const file = path.join(OUT, `creatures-d-close-${kind}.png`);
    writeFileSync(file, svgToPng(svg, { width: W }));
    console.log(file);
  }
}
