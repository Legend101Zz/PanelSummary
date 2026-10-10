/**
 * Close-up sheets of the v0.2 items (#41): the new backdrops at several shots and the new props at large size.
 *   npx tsx scripts/sheet-v02-items.ts <outDir> [envs|props|all]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Box, Environment, PropId, Shot } from "../src/contracts.js";
import type { DrawContext, EnvironmentRequest } from "../src/internal.js";
import { environments } from "../src/env/index.js";
import { props } from "../src/props/index.js";
import { INK, STROKE, toneDefs } from "../src/style.js";
import { esc, n } from "../src/svg.js";
import { seeded } from "../src/prng.js";
import { adoptFragment } from "../src/scene/ids.js";
import { svgToPng } from "../src/raster.js";

const out = process.argv[2];
const what = process.argv[3] ?? "all";
if (!out) throw new Error("usage: sheet-v02-items.ts <outDir> [envs|props|all]");
mkdirSync(out, { recursive: true });
const P = "w-";
const ctx = (seed: string | number): DrawContext => ({ idPrefix: P, rand: seeded("sheet", seed) });

interface Cell { box: Box; label: string; body: string }
function sheet(name: string, width: number, height: number, cells: Cell[]): void {
  let clips = "";
  let body = "";
  cells.forEach((c, i) => {
    clips += `<clipPath id="${P}clip${i}"><rect x="${n(c.box.x)}" y="${n(c.box.y)}" width="${n(c.box.w)}" height="${n(c.box.h)}"/></clipPath>`;
    body += `<g clip-path="url(#${P}clip${i})">${c.body}</g>`;
    body += `<rect x="${n(c.box.x)}" y="${n(c.box.y)}" width="${n(c.box.w)}" height="${n(c.box.h)}" fill="none" stroke="${INK}" stroke-width="${STROKE.panelBorder}"/>`;
    body += `<text x="${n(c.box.x + 4)}" y="${n(c.box.y + c.box.h + 17)}" font-family="PS Comic" font-weight="700" font-size="15" fill="${INK}">${esc(c.label)}</text>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><defs>${toneDefs(P)}${clips}</defs><rect width="${width}" height="${height}" fill="#fbfaf6"/>${body}</svg>`;
  writeFileSync(path.join(out, `${name}.svg`), svg);
  writeFileSync(path.join(out, `${name}.png`), svgToPng(svg, { width }));
  console.log(path.join(out, `${name}.png`));
}

let cells = 0;
function envBody(box: Box, environment: Environment, shot: Shot, time: EnvironmentRequest["time"] = "day"): string {
  const req: EnvironmentRequest = { environment, features: [], box, shot, angle: "eye", time, weather: "clear", lineWidth: STROKE.environment, seed: 7 };
  const raw = environments.draw(req, ctx(environment));
  const scoped = adoptFragment(raw.svg, P, `e${(cells += 1)}`);
  return `<defs>${scoped.defs}</defs>${scoped.body}`;
}

if (what === "envs" || what === "all") {
  const list: Cell[] = [];
  const shots: Shot[] = ["establishing", "wide", "full", "medium", "close"];
  const envs: Environment[] = ["foundry", "dustheap", "paradise"];
  const pad = 16, cw = 360, ch = 260;
  envs.forEach((e, r) =>
    shots.forEach((s, c) => {
      const box = { x: pad + c * (cw + pad), y: pad + r * (ch + 40), w: cw, h: ch };
      list.push({ box, label: `${e} ${s}`, body: envBody(box, e, s) });
    }),
  );
  sheet("envs", pad + shots.length * (cw + pad), pad + envs.length * (ch + 40) + 10, list);
  const night: Cell[] = [];
  (["foundry", "dustheap", "paradise", "forge"] as Environment[]).forEach((e, c) => {
    const box = { x: pad + c * (cw + pad), y: pad, w: cw, h: ch };
    night.push({ box, label: `${e} wide night`, body: envBody(box, e, "wide", "night") });
  });
  sheet("envs-night", pad + 4 * (cw + pad), ch + 70, night);
}

if (what === "props" || what === "all") {
  const ids: PropId[] = ["pot", "bell", "stove", "roast_goose", "heart", "angel", "loom", "sledge"];
  const cw = 420, ch = 420, pad = 16;
  const list: Cell[] = [];
  ids.forEach((id, i) => {
    const box = { x: pad + (i % 4) * (cw + pad), y: pad + Math.floor(i / 4) * (ch + 40), w: cw, h: ch };
    const d = props.draw(id, 0.5, ctx(id));
    const k = (ch * 0.8) / Math.max(d.height, d.width * 0.9);
    const body = `<g transform="translate(${n(box.x + cw / 2)} ${n(box.y + ch * 0.92)}) scale(${n(k)})">${d.svg}</g>`;
    list.push({ box, label: `${id} ${d.width}x${d.height} (line weight 0.5 units, as in a panel)`, body });
  });
  sheet("props", pad + 4 * (cw + pad), pad + 2 * (ch + 40) + 10, list);
}
