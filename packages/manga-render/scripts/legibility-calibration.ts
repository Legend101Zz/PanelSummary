/**
 * Offline calibration log for the legibility checks (no model call).
 *
 *   npx tsx scripts/legibility-calibration.ts --run <dir> --tag p0 [--out file.json]
 *
 * `<dir>` holds `judge/page-NN.json` and `understanding.json` (an acceptance run or an
 * eval export). Each page is rendered with this package. For every panel the script logs:
 * - per figure: head radius, body height as a share of the panel height, share of the
 *   body box inside the panel, whether it speaks, whether it is a hero (named in the beat,
 *   a speaker, or the only figure);
 * - per key prop: height as a share of the panel height;
 * - per balloon tail: distance from the tip to the speaker's mouth, whether the tail
 *   segment crosses a prop box, and whether the speaker is drawn;
 * - the legibility issue codes the renderer raised.
 * Run it with the old and the new code and join both logs to the judges' findings
 * (see scripts/legibility-join.ts). The same input always gives the same output.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BookUnderstanding, PlannedPage } from "../src/contracts.js";
import { renderPageDetailed, RENDERER_VERSION } from "../src/index.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;

function inter(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function segHitsBox(a: { x: number; y: number }, b: { x: number; y: number }, bx: Box): boolean {
  // sample the segment: cheap and enough for a calibration log
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (x >= bx.x && x <= bx.x + bx.w && y >= bx.y && y <= bx.y + bx.h) return true;
  }
  return false;
}

export interface FigureLog {
  id: string;
  headR: number;
  heightFrac: number;
  inFrame: number;
  speaker: boolean;
  hero: boolean;
  staging: string;
}
export interface PanelLog {
  page: number;
  panel: string;
  shot: string;
  location: string;
  figures: FigureLog[];
  keyProps: { prop: string; heightFrac: number; inFrame: number }[];
  tails: { speaker: string; drawn: boolean; offPanel: boolean; mouthDist: number | null; crossesProp: string | null }[];
  codes: string[];
}

export function logRun(run: string): { renderer: string; panels: PanelLog[] } {
  const rawU = JSON.parse(readFileSync(path.join(run, "understanding.json"), "utf8")) as Record<string, unknown>;
  const understanding = (rawU.understanding ?? rawU) as BookUnderstanding;
  const book = { cast: understanding.cast, locations: understanding.locations };
  const names = new Map(book.cast.map((c) => [c.id, c.name.toLowerCase()]));
  const judge = path.join(run, "judge");
  const files = readdirSync(judge)
    .filter((f) => /^page-\d+\.json$/.test(f))
    .sort((a, b) => Number(/\d+/.exec(a)?.[0]) - Number(/\d+/.exec(b)?.[0]));
  const hooks = new Map<number, boolean>();
  for (const f of files) {
    const raw = JSON.parse(readFileSync(path.join(judge, f), "utf8")) as { spec?: { page_number?: number; page_turn_hook?: boolean } };
    if (raw.spec?.page_number) hooks.set(raw.spec.page_number, raw.spec.page_turn_hook === true);
  }
  const out: PanelLog[] = [];
  for (const f of files) {
    const num = Number(/\d+/.exec(f)?.[0] ?? "0");
    const raw = JSON.parse(readFileSync(path.join(judge, f), "utf8")) as { spec?: unknown; planned?: PlannedPage };
    const spec = (raw.spec ?? raw) as { panels?: { id?: string; shot?: string; location?: string; beat?: string; figures?: { character?: string }[]; text?: { kind?: string; speaker?: string }[] }[] };
    let res;
    try {
      res = renderPageDetailed(spec, book, { ...(raw.planned ? { planned: raw.planned } : {}), previousPageHook: hooks.get(num - 1) === true });
    } catch (e) {
      out.push({ page: num, panel: "CRASH", shot: String(e), location: "", figures: [], keyProps: [], tails: [], codes: ["CRASH"] });
      continue;
    }
    const { result, details } = res;
    details.forEach((d, pi) => {
      const sp = spec.panels?.[pi] ?? {};
      const rp = result.panels[pi];
      const bbox = d.bbox;
      const beat = (sp.beat ?? "").toLowerCase();
      const speakers = new Set((sp.text ?? []).filter((t) => ["speech", "thought", "shout", "whisper"].includes(t.kind ?? "")).map((t) => t.speaker ?? ""));
      const named = new Set(
        d.figures
          .filter((fp) => {
            const nm = names.get(fp.character) ?? "";
            return nm.length > 2 && beat.includes(nm.replace(/^the /, ""));
          })
          .map((fp) => fp.character),
      );
      const heroIds = new Set([...named, ...[...speakers].filter((s) => d.figures.some((fp) => fp.character === s))]);
      if (heroIds.size === 0 && d.figures.length === 1) heroIds.add(d.figures[0].character);
      const figures: FigureLog[] = d.figures.map((fp) => {
        const area = Math.max(1, fp.body.w * fp.body.h);
        return {
          id: fp.character,
          headR: r2(fp.headRadius),
          heightFrac: r2(fp.body.h / bbox.h),
          inFrame: r2(Math.min(1, inter(fp.body, bbox) / area)),
          speaker: speakers.has(fp.character),
          hero: heroIds.has(fp.character),
          staging: fp.staging,
        };
      });
      const keyProps = d.props
        .filter((p) => p.key)
        .map((p) => ({ prop: p.prop, heightFrac: r2(p.box.h / bbox.h), inFrame: r2(Math.min(1, inter(p.box, bbox) / Math.max(1, p.box.w * p.box.h))) }));
      const tails: PanelLog["tails"] = [];
      for (const pl of d.placed) {
        const t = sp.text?.[pl.index];
        if (!t || !pl.tail || !["speech", "thought", "shout", "whisper"].includes(t.kind ?? "")) continue;
        const own = d.figures.find((fp) => fp.character === t.speaker);
        let crosses: string | null = null;
        for (const p of d.props) {
          if (own && p.heldBy === own.character) continue;
          const c = { x: pl.center.x, y: pl.center.y };
          if (segHitsBox(c, pl.tail.tip, p.box)) crosses = p.prop;
        }
        tails.push({
          speaker: t.speaker ?? "",
          drawn: !!own,
          offPanel: pl.tail.offPanel,
          mouthDist: own ? r2(Math.hypot(pl.tail.tip.x - own.mouth.x, pl.tail.tip.y - own.mouth.y) / Math.max(1, own.headRadius)) : null,
          crossesProp: crosses,
        });
      }
      const pid = rp?.id ?? sp.id ?? "";
      const codes = result.issues.filter((i) => i.path === `panel ${pid}` || i.path.startsWith(`panel ${pid} `)).map((i) => i.code);
      out.push({ page: num, panel: sp.id ?? `#${pi}`, shot: sp.shot ?? "", location: sp.location ?? "", figures, keyProps, tails, codes });
    });
    for (const i of result.issues) if (i.path === "page") out.push({ page: num, panel: "page", shot: "", location: "", figures: [], keyProps: [], tails: [], codes: [i.code] });
  }
  return { renderer: RENDERER_VERSION, panels: out };
}

if (process.argv[1]?.endsWith("legibility-calibration.ts")) {
  const run = arg("--run");
  const tag = arg("--tag") ?? "run";
  const outFile = arg("--out") ?? `${tag}.json`;
  if (!run) throw new Error("--run <dir> is required");
  const log = logRun(run);
  writeFileSync(outFile, JSON.stringify({ tag, ...log }, null, 1));
  console.log(`${tag}: ${log.panels.length} panel rows, renderer ${log.renderer} -> ${outFile}`);
}
