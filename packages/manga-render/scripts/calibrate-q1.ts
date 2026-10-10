/**
 * Q1 calibration log (#42): hero size, cut heads and balloon-tail aim, per panel, for ONE renderer.
 * No model call. Run it with the OLD renderer (a copy of origin/release/v0.2) and with the NEW one,
 * then join both logs to the judges' findings with scripts/calibrate-q1-report.py.
 *
 *   npx tsx scripts/calibrate-q1.ts --src <manga-render dir with src/> --run <dir with judge/ and understanding.json> --tag final --out file.json
 *
 * Per panel it logs, for every figure: body box as a share of the panel (clipped to the panel), head radius,
 * the share of the head circle inside the panel, whether it is a hero (named in the beat, a speaker, or the
 * only figure), whether it speaks, its look kind and pose. Per balloon tail with a drawn speaker: the distance
 * from the tail tip to the speaker's mouth anchor in head radii, and whether the head nearest to the tip is
 * the speaker's. Per key prop: its height as a share of the panel height. The same input gives the same output.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface Box { x: number; y: number; w: number; h: number }
interface Pt { x: number; y: number }
const r3 = (v: number): number => Math.round(v * 1000) / 1000;
function inter(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
const SPEAKING = new Set(["speech", "thought", "shout", "whisper"]);

const src = arg("--src");
const run = arg("--run");
const tag = arg("--tag") ?? "run";
const out = arg("--out") ?? `${tag}.json`;
if (!src || !run) throw new Error("usage: calibrate-q1.ts --src <dir> --run <dir> [--tag t] [--out f]");

const mod = (await import(pathToFileURL(path.join(src, "src/index.ts")).href)) as {
  renderPageDetailed: (spec: unknown, book: unknown, options?: unknown) => { result: { issues: { code: string; path: string; severity: string }[] }; details: any[] };
  RENDERER_VERSION: string;
};

const rawU = JSON.parse(readFileSync(path.join(run, "understanding.json"), "utf8")) as Record<string, any>;
const understanding = rawU.understanding ?? rawU;
const book = { cast: understanding.cast, locations: understanding.locations };
const cast = new Map<string, { name: string; kind: string }>(book.cast.map((c: any) => [c.id, { name: String(c.name).toLowerCase(), kind: c.look?.kind ?? "?" }]));
const judge = path.join(run, "judge");
const files = readdirSync(judge).filter((f) => /^page-\d+\.json$/.test(f)).sort((a, b) => Number(/\d+/.exec(a)?.[0]) - Number(/\d+/.exec(b)?.[0]));
const hooks = new Map<number, boolean>();
for (const f of files) {
  const raw = JSON.parse(readFileSync(path.join(judge, f), "utf8"));
  if (raw.spec?.page_number) hooks.set(raw.spec.page_number, raw.spec.page_turn_hook === true);
}

function named(beat: string, name: string): boolean {
  const n = name.replace(/^(?:the|a|an)\s+/, "").trim();
  if (n.length < 3) return false;
  const forms = new Set([n]);
  const last = n.split(/\s+/).pop() ?? "";
  if (last.length >= 4) forms.add(last);
  for (const f of forms) if (new RegExp(`\\b${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:s|es)?\\b`, "i").test(beat)) return true;
  return false;
}

const panels: unknown[] = [];
for (const f of files) {
  const num = Number(/\d+/.exec(f)?.[0] ?? "0");
  const raw = JSON.parse(readFileSync(path.join(judge, f), "utf8"));
  const spec = raw.spec ?? raw;
  if (!spec || !Array.isArray(spec.panels)) continue;
  let res;
  try {
    res = mod.renderPageDetailed(spec, book, { ...(raw.planned ? { planned: raw.planned } : {}), previousPageHook: hooks.get(num - 1) === true });
  } catch (e) {
    panels.push({ page: num, panel: "CRASH", error: String(e) });
    continue;
  }
  const { result, details } = res;
  details.forEach((d: any, pi: number) => {
    const sp = spec.panels[pi] ?? {};
    const bbox: Box = d.bbox;
    const pArea = bbox.w * bbox.h;
    const beat = String(sp.beat ?? "").toLowerCase();
    const speakers = new Set<string>((sp.text ?? []).filter((t: any) => SPEAKING.has(t.kind)).map((t: any) => t.speaker ?? ""));
    const heroIds = new Set<string>();
    for (const fp of d.figures) if (named(beat, cast.get(fp.character)?.name ?? "")) heroIds.add(fp.character);
    for (const s of speakers) if (d.figures.some((fp: any) => fp.character === s)) heroIds.add(s);
    if (heroIds.size === 0 && d.figures.length === 1) heroIds.add(d.figures[0].character);
    const figures = d.figures.map((fp: any) => {
      const body: Box = fp.body;
      const r = Math.max(0.5, fp.headRadius);
      const head: Box = { x: fp.head.x - r, y: fp.head.y - r, w: 2 * r, h: 2 * r };
      return {
        id: fp.character,
        kind: cast.get(fp.character)?.kind ?? "?",
        pose: fp.pose ?? "",
        hero: heroIds.has(fp.character),
        speaker: speakers.has(fp.character),
        areaFrac: r3(Math.min(1, inter(body, bbox) / pArea)),
        heightFrac: r3(Math.min(body.h, bbox.h) / bbox.h),
        widthFrac: r3(Math.min(body.w, bbox.w) / bbox.w),
        // the larger of the two shares: how much of the panel the figure fills in its tighter dimension
        sizeFrac: r3(Math.max(Math.min(body.h, bbox.h) / bbox.h, Math.min(body.w, bbox.w) / bbox.w)),
        headR: r3(r),
        headInside: r3(inter(head, bbox) / (4 * r * r)),
        headCropped: fp.headCropped === true,
        bodyInside: r3(inter(body, bbox) / Math.max(1, body.w * body.h)),
        staging: fp.staging,
      };
    });
    const tails: unknown[] = [];
    for (const pl of d.placed) {
      const t = sp.text?.[pl.index];
      if (!t || !pl.tail || !SPEAKING.has(t.kind)) continue;
      const own = d.figures.find((fp: any) => fp.character === t.speaker);
      const tip: Pt = pl.tail.tip;
      let nearest: string | null = null;
      let best = Infinity;
      for (const fp of d.figures) {
        const dd = Math.hypot(tip.x - fp.head.x, tip.y - fp.head.y) / Math.max(0.5, fp.headRadius);
        if (dd < best) { best = dd; nearest = fp.character; }
      }
      // distance from the tip to the edge of the speaker's head and of the nearest other head (page units)
      const edge = (fp: any): number => Math.max(0, Math.hypot(tip.x - fp.head.x, tip.y - fp.head.y) - fp.headRadius);
      const ownEdge = own ? edge(own) : null;
      let otherEdge: number | null = null;
      for (const fp of d.figures) if (fp !== own && !fp.headCropped) otherEdge = otherEdge === null ? edge(fp) : Math.min(otherEdge, edge(fp));
      tails.push({
        ownEdge: ownEdge === null ? null : r3(ownEdge),
        otherEdge: otherEdge === null ? null : r3(otherEdge),
        // how much clearer the tip is of its own speaker than of anyone else, in the speaker's head radii (negative: nearer another head)
        margin: own && otherEdge !== null && ownEdge !== null ? r3((otherEdge - ownEdge) / Math.max(0.5, own.headRadius)) : null,
        speaker: t.speaker ?? "",
        speakerKind: cast.get(t.speaker ?? "")?.kind ?? "?",
        speakerPose: own?.pose ?? "",
        drawn: !!own,
        offPanel: pl.tail.offPanel === true,
        mouthDist: own ? r3(Math.hypot(tip.x - own.mouth.x, tip.y - own.mouth.y) / Math.max(0.5, own.headRadius)) : null,
        aimDist: own && pl.tail.aim ? r3(Math.hypot(pl.tail.aim.x - own.mouth.x, pl.tail.aim.y - own.mouth.y) / Math.max(0.5, own.headRadius)) : null,
        nearest,
        nearestIsSpeaker: own ? nearest === t.speaker : null,
      });
    }
    const keyProps = d.props.filter((p: any) => p.key).map((p: any) => ({ prop: p.prop, heightFrac: r3(p.box.h / bbox.h), inside: r3(Math.min(1, inter(p.box, bbox) / Math.max(1, p.box.w * p.box.h))) }));
    const pid = sp.id ?? `#${pi}`;
    const codes = result.issues.filter((i) => i.path === `panel ${pid}` || i.path.startsWith(`panel ${pid} `)).map((i) => i.code);
    panels.push({ page: num, panel: pid, shot: sp.shot ?? "", w: Math.round(bbox.w), h: Math.round(bbox.h), figures, tails, keyProps, codes });
  });
}
writeFileSync(out, JSON.stringify({ tag, renderer: mod.RENDERER_VERSION, panels }));
console.log(`${tag}: renderer ${mod.RENDERER_VERSION}, ${panels.length} panels -> ${out}`);
