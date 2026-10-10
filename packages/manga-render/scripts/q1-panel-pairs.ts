/**
 * Before/after panel sheets for the Q1 review (#42), step 1: render the pages of a list with the old and the
 * new renderer to PNG and write a manifest of the panel boxes. Step 2 (scripts/q1-panel-pairs.py) crops the
 * panels and builds the sheets.
 *
 *   npx tsx scripts/q1-panel-pairs.ts --old <manga-render dir> --new <manga-render dir> --list <list.json> --out <dir>
 *   python3 scripts/q1-panel-pairs.py <dir> [panelsPerSheet]
 *
 * <list.json>: [{ "tag": "g2", "run": "<dir with judge/ and understanding.json>", "page": 23, "panel": "p5" }, ...]
 * No model call.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const oldDir = arg("--old");
const newDir = arg("--new");
const list = arg("--list");
const out = arg("--out");
if (!oldDir || !newDir || !list || !out) throw new Error("usage: q1-panel-pairs.ts --old <dir> --new <dir> --list <file> --out <dir>");
mkdirSync(path.join(out, "pages"), { recursive: true });

type Mod = { renderPageDetailed: (spec: unknown, book: unknown, o?: unknown) => { result: { svg: string; panels: { id: string; bbox: { x: number; y: number; w: number; h: number } }[] } } };
const oldMod = (await import(pathToFileURL(path.join(oldDir, "src/index.ts")).href)) as Mod;
const newMod = (await import(pathToFileURL(path.join(newDir, "src/index.ts")).href)) as Mod;
const { svgToPng } = (await import(pathToFileURL(path.join(newDir, "src/raster.ts")).href)) as { svgToPng: (svg: string, o: { width: number }) => Uint8Array };

interface Item { tag: string; run: string; page: number; panel: string }
const items = JSON.parse(readFileSync(list, "utf8")) as Item[];
const books = new Map<string, unknown>();
const WIDTH = 1920;
const done = new Set<string>();
const manifest: unknown[] = [];
for (const it of items) {
  let book = books.get(it.run);
  if (!book) {
    const u = JSON.parse(readFileSync(path.join(it.run, "understanding.json"), "utf8"));
    const und = u.understanding ?? u;
    book = { cast: und.cast, locations: und.locations };
    books.set(it.run, book);
  }
  const raw = JSON.parse(readFileSync(path.join(it.run, "judge", `page-${String(it.page).padStart(2, "0")}.json`), "utf8"));
  const spec = raw.spec ?? raw;
  const key = `${it.tag}-${it.page}`;
  const files: Record<string, string> = {};
  let box: { x: number; y: number; w: number; h: number } | undefined;
  let pageW = 960;
  for (const [name, mod] of [["old", oldMod], ["new", newMod]] as const) {
    const r = mod.renderPageDetailed(spec, book, { ...(raw.planned ? { planned: raw.planned } : {}) }).result;
    const file = path.join(out, "pages", `${key}-${name}.png`);
    if (!done.has(`${key}-${name}`)) {
      writeFileSync(file, svgToPng(r.svg, { width: WIDTH }));
      done.add(`${key}-${name}`);
    }
    files[name] = file;
    const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(r.svg);
    if (vb) pageW = Number(vb[1]);
    box = r.panels.find((p) => p.id === it.panel)?.bbox ?? box;
  }
  if (box) manifest.push({ label: `${it.tag} page ${it.page} ${it.panel}`, old: files.old, new: files.new, bbox: box, scale: WIDTH / pageW });
}
writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 1));
console.log(`${manifest.length} panels, pages in ${path.join(out, "pages")}`);
