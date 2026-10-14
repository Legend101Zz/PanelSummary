/**
 * Gate 2a (v0.3): measure the drawn size of every planned figure on judged pages.
 * Usage: npx tsx scripts/tiny-figures-measure.ts OUT.json
 * Re-renders the saved judge page specs with the CURRENT renderer. Only the tuning books
 * and the v0.2 runs are read (never the sealed, gates, baseline or cheese folders).
 * Output: one row per planned figure: run, page, panel, shot, role, share of the panel height,
 * share in the tighter dimension, head radius (page units = px at the 1000-px page width).
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { renderPageDetailed } from "../src/index.js";

const V2 = "/Volumes/Mrigesh SSD/Book-Reel-scratch/v02/";
const V3 = "/Volumes/Mrigesh SSD/Book-Reel-scratch/v03/gate1-tuning/";
const RUNS = [
  ...["live/run2", "live/run3", "live/run4", "live/run5", "live/run6", "live/run8", "final-journey", "final-journey-2"].map((r) => V2 + r),
  ...["two-tale", "two-tale-1b", "justso", "justso-1b"].map((r) => V3 + r),
];
const SPEAKING = new Set(["speech", "thought", "shout", "whisper"]);
const named = (beat: string, name: string) => {
  const n = name.replace(/^(?:the|a|an)\s+/, "").trim();
  if (n.length < 3) return false;
  const f = new Set([n]);
  const last = n.split(/\s+/).pop() ?? "";
  if (last.length >= 4) f.add(last);
  for (const x of f) if (new RegExp(`\\b${x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:s|es)?\\b`, "i").test(beat)) return true;
  return false;
};
const rows: any[] = [];
const pages: any[] = [];
for (const dir of RUNS) {
  if (!existsSync(dir + "/export/understanding.json")) continue;
  const raw0 = JSON.parse(readFileSync(dir + "/export/understanding.json", "utf8"));
  const u = raw0.understanding ?? raw0;
  const book = { cast: u.cast, locations: u.locations };
  const cast = new Map<string, string>(book.cast.map((c: any) => [c.id, String(c.name).toLowerCase()]));
  const files = readdirSync(dir + "/export/judge").filter((f) => /^page-\d+\.json$/.test(f));
  const hooks = new Map<number, boolean>();
  const raws = new Map<number, any>();
  for (const f of files) {
    const raw = JSON.parse(readFileSync(dir + "/export/judge/" + f, "utf8"));
    const n = Number(/\d+/.exec(f)![0]);
    raws.set(n, raw);
    hooks.set(n, raw.spec?.page_turn_hook === true);
  }
  const run = dir.replace(V2, "v02/").replace(V3, "v03/");
  for (const [num, raw] of [...raws].sort((a, b) => a[0] - b[0])) {
    const spec = raw.spec;
    if (!spec || !Array.isArray(spec.panels)) continue;
    let res: any;
    try {
      res = renderPageDetailed(spec, book, { ...(raw.planned ? { planned: raw.planned } : {}), previousPageHook: hooks.get(num - 1) === true });
    } catch {
      continue;
    }
    const codes = new Set<string>(res.result.issues.map((i: any) => i.code));
    pages.push({ run, page: num, codes: [...codes] });
    res.details.forEach((d: any, pi: number) => {
      const sp = spec.panels[pi] ?? {};
      const pid = sp.id ?? `#${pi}`;
      const bb = d.bbox;
      const beat = String(sp.beat ?? "").toLowerCase();
      const speakers = new Set<string>((sp.text ?? []).filter((t: any) => SPEAKING.has(t.kind) && t.speaker).map((t: any) => t.speaker));
      const labelled = new Set<string>((sp.text ?? []).filter((t: any) => typeof t.about === "string").map((t: any) => t.about));
      const pcodes = res.result.issues.filter((i: any) => i.path === `panel ${pid}` || String(i.path).startsWith(`panel ${pid} `)).map((i: any) => i.code);
      for (const f of d.figures) {
        const id = f.character;
        const role = speakers.has(id) ? "speaker" : named(beat, cast.get(id) ?? "") ? "named" : labelled.has(id) ? "labelled" : "other";
        const hShare = Math.min(f.body.h, bb.h) / bb.h;
        const wShare = Math.min(f.body.w, bb.w) / bb.w;
        rows.push({
          run, page: num, panel: pid, shot: sp.shot, role, id,
          nFig: d.figures.length, hShare: +hShare.toFixed(3), tight: +Math.max(hShare, wShare).toFixed(3),
          head: +f.headRadius.toFixed(1), cropped: f.headCropped === true, pcodes,
        });
      }
    });
  }
}
writeFileSync(process.argv[2] ?? "tiny-figures.json", JSON.stringify({ rows, pages }));
console.log("figure rows", rows.length, "pages", pages.length);
