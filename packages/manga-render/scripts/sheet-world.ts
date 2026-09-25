/**
 * Contact sheets for environments, props and fx.
 *   tsx scripts/sheet-world.ts [envs|angles|time|props|fx|phone|all]
 * Writes PNGs to $SHEET_DIR (default: the session scratchpad render/sheets).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ENVIRONMENTS, FX, PROPS, type Angle, type Box, type EnvFeature, type Environment, type FxId, type Shot } from "../src/contracts.js";
import type { DrawContext, EnvironmentRequest } from "../src/internal.js";
import { environments } from "../src/env/index.js";
import { props, SEAT_KINDS } from "../src/props/index.js";
import { fx } from "../src/fx/index.js";
import { INK, STROKE, toneDefs } from "../src/style.js";
import { esc, n } from "../src/svg.js";
import { seeded } from "../src/prng.js";
import { rig, seatContact } from "../src/rig/index.js";
import { adoptFragment } from "../src/scene/ids.js";
import type { CharacterLook } from "../src/contracts.js";

const FX_LOOK_A: CharacterLook = { kind: "human", age: "adult", build: "average", height: "average", frame: "masc", hair: "messy", hair_tone: "dark", facial_hair: "none", outfit: "long_coat", outfit_tone: "dark", headwear: "none", accessories: [], skin: "light", material: "flesh" };
const FX_LOOK_B: CharacterLook = { kind: "bird", species: "swallow", tone: "dark" };
import { svgToPng } from "../src/raster.js";

const OUT =
  process.env.SHEET_DIR ?? "/private/tmp/claude-501/-Users-comreton-Desktop/3b1640fe-8ce0-4ed7-b544-0b35ca3ba64d/scratchpad/render/sheets";
mkdirSync(OUT, { recursive: true });
const P = "w-";

function ctx(seed: string | number): DrawContext {
  return { idPrefix: P, rand: seeded("sheet", seed) };
}

interface Cell {
  box: Box;
  label: string;
  body: string;
}

function sheet(name: string, width: number, height: number, cells: Cell[], pngWidth = width): void {
  let clips = "";
  let body = "";
  cells.forEach((c, i) => {
    const id = `${P}clip${i}`;
    clips += `<clipPath id="${id}"><rect x="${n(c.box.x)}" y="${n(c.box.y)}" width="${n(c.box.w)}" height="${n(c.box.h)}"/></clipPath>`;
    body += `<g clip-path="url(#${id})">${c.body}</g>`;
    body += `<rect x="${n(c.box.x)}" y="${n(c.box.y)}" width="${n(c.box.w)}" height="${n(c.box.h)}" fill="none" stroke="${INK}" stroke-width="${STROKE.panelBorder}"/>`;
    body += `<text x="${n(c.box.x + 4)}" y="${n(c.box.y + c.box.h + 17)}" font-family="PS Comic" font-weight="700" font-size="15" fill="${INK}">${esc(c.label)}</text>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><defs>${toneDefs(P)}${clips}</defs><rect width="${width}" height="${height}" fill="#fbfaf6"/>${body}</svg>`;
  const file = path.join(OUT, `${name}.png`);
  writeFileSync(path.join(OUT, `${name}.svg`), svg);
  writeFileSync(file, svgToPng(svg, { width: pngWidth }));
  console.log(`${file}  (${(svg.length / 1024).toFixed(0)} KB svg)`);
}

let envCells = 0;
function envBody(box: Box, environment: Environment, o: Partial<EnvironmentRequest> = {}): string {
  const req: EnvironmentRequest = {
    environment,
    features: o.features ?? [],
    box,
    shot: o.shot ?? "wide",
    angle: o.angle ?? "eye",
    time: o.time ?? "day",
    weather: o.weather ?? "clear",
    lineWidth: STROKE.environment,
    seed: o.seed ?? 7,
  };
  const raw = environments.draw(req, ctx(environment));
  // scope ids per cell (shared window definitions restart per drawing), like the composer does
  const scoped = adoptFragment(raw.svg, P, `e${(envCells += 1)}`);
  const d = { ...raw, svg: `<defs>${scoped.defs}</defs>${scoped.body}` };
  const hz = d.horizonY > box.y && d.horizonY < box.y + box.h ? `<path d="M${n(box.x)} ${n(d.horizonY)}h8M${n(box.x + box.w - 8)} ${n(d.horizonY)}h8" stroke="#e33" stroke-width="2"/>` : "";
  const gy = `<path d="M${n(box.x)} ${n(d.groundY)}h14" stroke="#36c" stroke-width="3"/>`;
  return d.svg + (process.env.MARKS ? hz + gy : "");
}

function grid(cols: number, cw: number, ch: number, count: number, gap = 26, pad = 16): { boxes: Box[]; width: number; height: number } {
  const rows = Math.ceil(count / cols);
  const boxes: Box[] = [];
  for (let i = 0; i < count; i += 1) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    boxes.push({ x: pad + c * (cw + pad), y: pad + r * (ch + gap + pad), w: cw, h: ch });
  }
  return { boxes, width: pad + cols * (cw + pad), height: pad + rows * (ch + gap + pad) };
}

function envSheets(): void {
  const half = Math.ceil(ENVIRONMENTS.length / 2);
  [ENVIRONMENTS.slice(0, half), ENVIRONMENTS.slice(half)].forEach((list, k) => {
    const g = grid(3, 600, 400, list.length);
    sheet(
      `world-envs-${k + 1}`,
      g.width,
      g.height,
      list.map((e, i) => ({ box: g.boxes[i], label: `${e} — wide/eye`, body: envBody(g.boxes[i], e) })),
    );
  });
}

function angleSheets(): void {
  const shots: Shot[] = ["establishing", "full", "close"];
  const angles: Angle[] = ["eye", "low", "high", "birds_eye"];
  for (const env of ["city_square", "garret"] as Environment[]) {
    const g = grid(4, 460, 300, shots.length * angles.length);
    const cells: Cell[] = [];
    shots.forEach((s, si) =>
      angles.forEach((a, ai) => {
        const box = g.boxes[si * angles.length + ai];
        cells.push({ box, label: `${env} ${s} / ${a}`, body: envBody(box, env, { shot: s, angle: a }) });
      }),
    );
    sheet(`world-angles-${env}`, g.width, g.height, cells);
  }
  // worms_eye + a tall and a wide panel for city_square
  const extra: { env: Environment; box: Box; o: Partial<EnvironmentRequest>; label: string }[] = [
    { env: "city_square", box: { x: 16, y: 16, w: 300, h: 700 }, o: { angle: "worms_eye", shot: "full" }, label: "city worms_eye tall" },
    { env: "street", box: { x: 332, y: 16, w: 300, h: 700 }, o: { angle: "low", shot: "full" }, label: "street low tall" },
    { env: "forest", box: { x: 648, y: 16, w: 300, h: 700 }, o: { angle: "eye", shot: "full" }, label: "forest full tall" },
    { env: "city_square", box: { x: 16, y: 760, w: 932, h: 260 }, o: { angle: "eye", shot: "establishing" }, label: "city establishing wide strip" },
  ];
  sheet(
    "world-angles-extra",
    964,
    1060,
    extra.map((e) => ({ box: e.box, label: e.label, body: envBody(e.box, e.env, e.o) })),
  );
}

function timeSheet(): void {
  const list: { env: Environment; o: Partial<EnvironmentRequest>; label: string }[] = [
    { env: "sky", o: { time: "day" }, label: "sky day" },
    { env: "sky", o: { time: "dusk" }, label: "sky dusk" },
    { env: "sky", o: { time: "night" }, label: "sky night" },
    { env: "garden", o: { weather: "snow" }, label: "garden snow" },
    { env: "garden", o: { weather: "rain" }, label: "garden rain" },
    { env: "city_square", o: { time: "night", features: ["statue_column"] }, label: "city_square night + statue_column" },
    { env: "street", o: { time: "dusk" }, label: "street dusk" },
    { env: "forest", o: { weather: "fog" }, label: "forest fog" },
    { env: "rooftops", o: { time: "night", weather: "storm" }, label: "rooftops night storm" },
    { env: "room_poor", o: { time: "night" }, label: "room_poor night" },
    { env: "meadow", o: { time: "dawn", weather: "wind" }, label: "meadow dawn wind" },
    { env: "seaside", o: { time: "dusk" }, label: "seaside dusk" },
  ];
  const g = grid(3, 600, 400, list.length);
  sheet(
    "world-time",
    g.width,
    g.height,
    list.map((e, i) => ({ box: g.boxes[i], label: e.label, body: envBody(g.boxes[i], e.env, e.o) })),
  );
}

function featureSheet(): void {
  const feats: EnvFeature[] = [
    "statue_column",
    "fountain",
    "window",
    "fireplace",
    "bed",
    "table",
    "bookshelf",
    "trees",
    "fence",
    "high_wall",
    "gate",
    "bars",
    "river",
    "bridge",
    "lamp_post",
    "clock_tower",
    "flowers",
    "snow_ground",
    "crowd_background",
    "door",
  ];
  const list: { env: Environment; f: EnvFeature[] }[] = [];
  for (const f of feats) list.push({ env: "meadow", f: [f] });
  for (const f of feats) list.push({ env: "room_poor", f: [f] });
  const g = grid(5, 380, 250, list.length, 24, 12);
  sheet(
    "world-features",
    g.width,
    g.height,
    list.map((e, i) => ({ box: g.boxes[i], label: `${e.env} + ${e.f.join(",")}`, body: envBody(g.boxes[i], e.env, { features: e.f, shot: "wide" }) })),
  );
}

function propSheet(): void {
  const cols = 8;
  const cw = 170;
  const ch = 190;
  const g = grid(cols, cw, ch, PROPS.length, 24, 12);
  const cells: Cell[] = PROPS.map((prop, i) => {
    const box = g.boxes[i];
    const d = props.draw(prop, STROKE.figureOutline / 2.2, ctx(prop));
    const nh = props.nominalHeight(prop);
    // scale so the prop's nominal height fills ~70% of the cell (figure units → px)
    const scale = Math.min((ch * 0.72) / Math.max(1, d.height), (cw * 0.8) / Math.max(1, d.width));
    const cx = box.x + cw / 2;
    const gy = box.y + ch * 0.86;
    const lw = STROKE.figureOutline / scale;
    const d2 = props.draw(prop, lw, ctx(prop));
    const grip = `<circle cx="${n(cx + d2.grip.x * scale)}" cy="${n(gy + d2.grip.y * scale)}" r="3" fill="none" stroke="#e33" stroke-width="1.2"/>`;
    const ground = `<path d="M${n(box.x + 8)} ${n(gy)}H${n(box.x + cw - 8)}" stroke="#bbb" stroke-width="1"/>`;
    const body = `<rect x="${box.x}" y="${box.y}" width="${cw}" height="${ch}" fill="#fff"/>${ground}<g transform="translate(${n(cx)} ${n(gy)}) scale(${n(scale)})">${d2.svg}</g>${process.env.MARKS ? grip : ""}`;
    return { box, label: `${prop} (${nh})`, body };
  });
  sheet("world-props", g.width, g.height, cells);
}

function fxSheet(): void {
  const cols = 4;
  const g = grid(cols, 420, 300, FX.length, 26, 14);
  const cells: Cell[] = FX.map((id: FxId, i) => {
    const box = g.boxes[i];
    const polygon = [
      { x: box.x, y: box.y },
      { x: box.x + box.w, y: box.y },
      { x: box.x + box.w, y: box.y + box.h },
      { x: box.x, y: box.y + box.h },
    ];
    // a real background (a toned night street for the dark fx) and two real figures
    const night = id === "dark_mood" || id === "rain";
    const bgEnv = envBody(box, "street", { shot: "full", time: night ? "night" : "day" });
    const figs: string[] = [];
    const heads: { point: { x: number; y: number }; radius: number }[] = [];
    [0.3, 0.72].forEach((fx0, k) => {
      const look = k === 0 ? FX_LOOK_A : FX_LOOK_B;
      const probe = rig.draw({ look, pose: "stand", expression: "neutral", facing: k === 0 ? "right" : "front", lineWidth: 1, seed: 3 + k }, ctx(`fx${k}`));
      const scale = (box.h * 0.8) / -probe.anchors.top;
      const ox = box.x + box.w * fx0;
      const oy = box.y + box.h * 0.97;
      const d = rig.draw({ look, pose: "stand", expression: "neutral", facing: k === 0 ? "right" : "front", lineWidth: STROKE.figureOutline / scale, seed: 3 + k }, ctx(`fx${k}`));
      const f = adoptFragment(d.svg, P, `fx${i}f${k}`);
      figs.push(`<defs>${f.defs}</defs><g transform="translate(${n(ox)} ${n(oy)}) scale(${n(scale)})">${f.body}</g>`);
      heads.push({ point: { x: ox + d.anchors.head.x * scale, y: oy + d.anchors.head.y * scale }, radius: d.anchors.headRadius * scale });
    });
    const r = fx.draw({ fx: id, box, polygon, focus: heads[0].point, heads, lineWidth: STROKE.fx, seed: 11 }, ctx(id));
    return { box, label: id, body: bgEnv + r.under + figs.join("") + r.over };
  });
  sheet("world-fx", g.width, g.height, cells);
}

/** Every environment at medium and close: does the level of detail drop sensibly? */
function shotSheet(): void {
  const shots: Shot[] = ["medium", "close", "extreme_close"];
  for (const shot of shots) {
    const g = grid(6, 300, 200, ENVIRONMENTS.length, 22, 10);
    sheet(
      `world-shot-${shot}`,
      g.width,
      g.height,
      ENVIRONMENTS.map((e, i) => ({ box: g.boxes[i], label: `${e}`, body: envBody(g.boxes[i], e, { shot }) })),
    );
  }
}

/** A mock page at phone width: does anything read at 390px? */
function phoneSheet(): void {
  const W = 1000;
  const H = 1500;
  const m = 40;
  const gut = 18;
  const boxes: { box: Box; env: Environment; o: Partial<EnvironmentRequest> }[] = [
    { box: { x: m, y: m, w: W - 2 * m, h: 420 }, env: "city_square", o: { shot: "establishing", features: ["statue_column"] } },
    { box: { x: m, y: m + 420 + gut, w: (W - 2 * m - gut) / 2, h: 460 }, env: "garret", o: { shot: "full", time: "night" } },
    { box: { x: m + (W - 2 * m - gut) / 2 + gut, y: m + 420 + gut, w: (W - 2 * m - gut) / 2, h: 460 }, env: "forest", o: { shot: "medium" } },
    { box: { x: m, y: m + 880 + 2 * gut, w: W - 2 * m, h: H - 2 * m - 880 - 2 * gut }, env: "riverbank", o: { shot: "wide", angle: "high" } },
  ];
  sheet(
    "world-phone",
    W,
    H,
    boxes.map((b) => ({ box: b.box, label: "", body: envBody(b.box, b.env, b.o) })),
    390,
  );
}

const PRINCE: CharacterLook = { kind: "human", age: "adult", build: "average", height: "tall", frame: "masc", hair: "bald", hair_tone: "gold", facial_hair: "none", outfit: "royal", outfit_tone: "gold", headwear: "crown", accessories: ["sword_belt"], skin: "light", material: "gold" };
const BOY: CharacterLook = { kind: "human", age: "child", build: "slim", height: "short", frame: "masc", hair: "messy", hair_tone: "mid", facial_hair: "none", outfit: "tunic", outfit_tone: "light", headwear: "none", accessories: [], skin: "light", material: "flesh" };
const SEAMSTRESS: CharacterLook = { kind: "human", age: "adult", build: "slim", height: "short", frame: "fem", hair: "long_straight", hair_tone: "dark", facial_hair: "none", outfit: "dress", outfit_tone: "dark", headwear: "none", accessories: [], skin: "light", material: "flesh" };

/** Place a rig drawing so figure point (fx, fy) lands on page point p at the given scale. */
function placeFigure(look: CharacterLook, pose: "stand" | "lie" | "sit", facing: "right" | "left" | "front", scale: number, at: { x: number; y: number }, key: string, align: "feet" | "centre" = "feet"): string {
  const d = rig.draw({ look, pose, expression: "neutral", facing: facing === "left" ? "right" : facing, lineWidth: STROKE.figureOutline / scale, seed: 5 }, ctx(key));
  const f = adoptFragment(d.svg, P, key);
  const a = d.anchors;
  const cx = align === "centre" ? (a.left + a.right) / 2 : 0;
  const sx = facing === "left" ? -scale : scale;
  return `<defs>${f.defs}</defs><g transform="translate(${n(at.x - cx * sx)} ${n(at.y)}) scale(${n(sx)} ${n(scale)})">${f.body}</g>`;
}

/**
 * Staging anchors in context: the statue stands on statue_top (scaled from
 * statue_crown), the boy lies on the bed (scaled to bed_head..bed_foot), the
 * seamstress sits on the stool anchor. Red marks show every anchor.
 */
function stagingSheet(): void {
  const list: { env: Environment; o: Partial<EnvironmentRequest>; label: string }[] = [
    { env: "city_square", o: { shot: "establishing", angle: "eye", features: ["statue_column", "lamp_post"] }, label: "city establishing eye" },
    { env: "city_square", o: { shot: "establishing", angle: "low", features: ["statue_column", "lamp_post"] }, label: "city establishing low" },
    { env: "city_square", o: { shot: "wide", angle: "eye", features: ["statue_column", "lamp_post"], time: "night" }, label: "city wide night" },
    { env: "city_square", o: { shot: "wide", angle: "high", features: ["statue_column"] }, label: "city wide high" },
    { env: "city_square", o: { shot: "full", angle: "eye", features: ["statue_column"] }, label: "city full" },
    { env: "city_square", o: { shot: "full", angle: "low", features: ["statue_column"] }, label: "city full low" },
    { env: "room_poor", o: { shot: "wide", features: ["window", "table", "bed"] }, label: "room_poor wide" },
    { env: "room_poor", o: { shot: "full", features: ["window", "table", "bed"], time: "night" }, label: "room_poor full night" },
    { env: "room_poor", o: { shot: "medium", features: ["window", "table", "bed"] }, label: "room_poor medium" },
    { env: "garret", o: { shot: "full", features: ["window", "table", "bed"] }, label: "garret full" },
    { env: "room_rich", o: { shot: "wide", features: ["bed", "table"] }, label: "room_rich wide + bed" },
    { env: "meadow", o: { shot: "wide", features: ["bed", "table"] }, label: "meadow + bed/table" },
  ];
  const g = grid(3, 600, 400, list.length);
  const cells = list.map((e, i) => {
    const box = g.boxes[i];
    const req: EnvironmentRequest = { environment: e.env, features: e.o.features ?? [], box, shot: e.o.shot ?? "wide", angle: e.o.angle ?? "eye", time: e.o.time ?? "day", weather: "clear", lineWidth: STROKE.environment, seed: 7 };
    const d0 = environments.draw(req, ctx(`st${i}`));
    const sc = adoptFragment(d0.svg, P, `st${i}`);
    const d = { ...d0, svg: `<defs>${sc.defs}</defs>${sc.body}` };
    const an = d.anchors ?? {};
    let figs = "";
    if (an.statue_top && an.statue_crown) {
      const probe = rig.draw({ look: PRINCE, pose: "stand", expression: "neutral", facing: "front", lineWidth: 1, seed: 5 }, ctx("probe"));
      const scale = (an.statue_top.y - an.statue_crown.y) / -probe.anchors.top;
      figs += placeFigure(PRINCE, "stand", "front", scale, an.statue_top, `st${i}p`);
    }
    if (an.bed && an.bed_head && an.bed_foot) {
      const probe = rig.draw({ look: BOY, pose: "lie", expression: "tired", facing: "right", lineWidth: 1, seed: 5 }, ctx("probe"));
      const len = Math.abs(an.bed_foot.x - an.bed_head.x);
      const scale = (len * 0.95) / (probe.anchors.right - probe.anchors.left);
      // lie draws the head on the right: face left when the pillow is on the left
      figs += placeFigure(BOY, "lie", an.bed_head.x < an.bed_foot.x ? "left" : "right", scale, an.bed, `st${i}b`, "centre");
    }
    if (an.stool) {
      const seat = props.seat("stool", 1, ctx("seat"));
      const probe = rig.draw({ look: SEAMSTRESS, pose: "sit", expression: "neutral", facing: "right", lineWidth: 1, seed: 5 }, ctx("probe"));
      const scale = ((d.groundY - an.stool.y) / -seat.seatY) * 0.95;
      const feet = { x: an.stool.x, y: an.stool.y + -seat.seatY * scale };
      figs += placeFigure(SEAMSTRESS, "sit", "left", scale, feet, `st${i}s`);
      void probe;
    }
    let marks = "";
    for (const [k, p] of Object.entries(an)) {
      marks += `<path d="M${n(p.x - 6)} ${n(p.y)}h12M${n(p.x)} ${n(p.y - 6)}v12" stroke="#e22" stroke-width="2"/><text x="${n(p.x + 5)}" y="${n(p.y - 5)}" font-size="11" fill="#e22" font-family="PS Comic">${esc(k)}</text>`;
    }
    return { box, label: e.label, body: d.svg + figs + marks };
  });
  sheet("world-staging", g.width, g.height, cells);
}

/** Every seat kind with a sitting adult and child aligned on seatY. */
function seatSheet(): void {
  const kinds = SEAT_KINDS;
  const g = grid(4, 260, 300, kinds.length * 2, 24, 12);
  const cells: Cell[] = [];
  kinds.forEach((k, i) => {
    for (const [j, look] of [SEAMSTRESS, BOY].entries()) {
      const box = g.boxes[i * 2 + j];
      const scale = 2.6;
      const seat = props.seat(k, STROKE.figureOutline / scale, ctx(k));
      const gy = box.y + box.h - 12;
      const cx = box.x + box.w / 2;
      const kScale = look === BOY ? seatContact(look, "sit", "right", 5).y / seat.seatY : 1;
      const s2 = scale * kScale;
      const seatSvg = `<g transform="translate(${n(cx)} ${n(gy)}) scale(${n(s2)})">${props.seat(k, STROKE.figureOutline / s2, ctx(k)).svg}</g>`;
      const contact = seatContact(look, "sit", "right", 5);
      const fig = placeFigure(look, "sit", "right", scale, { x: cx - contact.x * scale, y: gy }, `seat${i}${j}`);
      cells.push({ box, label: `${k} ${look === BOY ? "child" : "adult"}`, body: `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="#fff"/>${seatSvg}${fig}` });
    }
  });
  sheet("world-seats", g.width, g.height, cells);
}

const which = process.argv[2] ?? "all";
const jobs: Record<string, () => void> = { staging: stagingSheet, seats: seatSheet, shots: shotSheet, envs: envSheets, angles: angleSheets, time: timeSheet, features: featureSheet, props: propSheet, fx: fxSheet, phone: phoneSheet };
for (const [k, fn] of Object.entries(jobs)) if (which === "all" || which === k) fn();
