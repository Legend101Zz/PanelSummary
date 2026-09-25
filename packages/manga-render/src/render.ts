/**
 * renderPage: validate → layout → compose panels → letter → one SVG.
 *
 * Validation errors are returned in `issues`; the renderer still draws what
 * it can (unknown vocabulary is shown with a neutral stand-in so a preview
 * is possible) but a page with any error must not be accepted. Lettering
 * overflow is always an error (TEXT_DOES_NOT_FIT); text is never truncated.
 */
import { createHash } from "node:crypto";
import {
  ANGLES,
  DEPTHS,
  EXPRESSIONS,
  EYE_STATES,
  FACINGS,
  FIDELITY,
  FX,
  MATERIALS,
  PAGE_HEIGHT,
  PAGE_MARGIN,
  PAGE_WIDTH,
  PERCH_PARTS,
  POSES,
  PROPS,
  SHOTS,
  SLOTS,
  TEXT_KINDS,
  TIMES,
  TONES,
  WEATHERS,
  type CastMember,
  type FigureSpec,
  type LayoutSpec,
  type LookVariant,
  type PanelSpec,
  type PlannedPage,
  type Point,
  type PropSpec,
  type RenderResult,
  type RenderedPanel,
  type RenderedText,
  type TextSpec,
  type ValidationIssue,
} from "./contracts.js";
import { compileLayout } from "./layout/index.js";
import { composePanel, type ComposedPanel, type FigurePlacement } from "./scene/index.js";
import type { Placed } from "./lettering/place.js";
import { estimateTextArea, letterPanel } from "./lettering/index.js";
import { countWords } from "./lettering/breaking.js";
import { validatePage, type BookRefs } from "./validate/index.js";
import { rig } from "./rig/index.js";
import { hashString } from "./prng.js";
import { INK, PAGE_BG, STROKE, toneDefs } from "./style.js";
import { esc, n, polyPath } from "./svg.js";
import { FONT_FAMILY } from "./fonts.js";

export const RENDERER_VERSION = "manga-render/0.3.0";

export interface RenderOptions {
  /** Prefix for every id on the page (pages are inlined in one DOM). Default "pg<N>-". */
  idPrefix?: string;
  /** The planned page, to check page number / section / claims. */
  planned?: PlannedPage;
  /** Draw the small page number (folio) in the bottom margin. Default true. */
  folio?: boolean;
  /**
   * True when the previous page ended on a page-turn hook: the first panel
   * should then pay it off large (FIRST_PANEL_SMALL_AFTER_HOOK otherwise).
   */
  previousPageHook?: boolean;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function pickOpt<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

function sanitizePrefix(p: string): string {
  const clean = p.replace(/[^A-Za-z0-9_-]/g, "");
  return /^[A-Za-z_]/.test(clean) ? clean : `p${clean}`;
}

/** Best-effort renderable panel from untrusted JSON (validation reports the problems). */
function sanitizePanel(raw: unknown, index: number, castById: Map<string, CastMember>): PanelSpec {
  const r = isRecord(raw) ? raw : {};
  const figures: FigureSpec[] = (Array.isArray(r.figures) ? r.figures : []).filter(isRecord).map((f) => {
    let pose = pick(f.pose, POSES, "stand");
    let expression = pick(f.expression, EXPRESSIONS, "neutral");
    const cast = typeof f.character === "string" ? castById.get(f.character) : undefined;
    if (cast) {
      try {
        const poses = rig.supportedPoses(cast.look);
        if (!poses.includes(pose)) pose = poses.includes("stand") ? "stand" : (poses[0] ?? pose);
        const exprs = rig.supportedExpressions(cast.look);
        if (!exprs.includes(expression)) expression = exprs.includes("neutral") ? "neutral" : (exprs[0] ?? expression);
      } catch {
        // invalid look: the scene composer skips the figure
      }
    }
    const fig: FigureSpec = {
      character: typeof f.character === "string" ? f.character : "",
      pose,
      expression,
      facing: pick(f.facing, FACINGS, "right"),
      slot: pick(f.slot, SLOTS, "center"),
    };
    const depth = pickOpt(f.depth, DEPTHS);
    if (depth) fig.depth = depth;
    const holding = pickOpt(f.holding, PROPS);
    if (holding) fig.holding = holding;
    const holdingTone = pickOpt(f.holding_tone, TONES);
    if (holdingTone) fig.holding_tone = holdingTone;
    if (isRecord(f.on) && typeof f.on.target === "string") {
      const part = pickOpt(f.on.part, PERCH_PARTS);
      fig.on = part ? { target: f.on.target, part } : { target: f.on.target };
    }
    if (isRecord(f.variant)) {
      const v: LookVariant = {};
      const eyes = pickOpt(f.variant.eyes, EYE_STATES);
      if (eyes) v.eyes = eyes;
      const material = pickOpt(f.variant.material, MATERIALS);
      if (material) v.material = material;
      const outfit = pickOpt(f.variant.outfit_tone, TONES);
      if (outfit) v.outfit_tone = outfit;
      const hair = pickOpt(f.variant.hair_tone, TONES);
      if (hair) v.hair_tone = hair;
      const tone = pickOpt(f.variant.tone, TONES);
      if (tone) v.tone = tone;
      if (Object.keys(v).length > 0) fig.variant = v;
    }
    return fig;
  });
  const props: PropSpec[] = (Array.isArray(r.props) ? r.props : [])
    .filter(isRecord)
    .filter((p) => pickOpt(p.prop, PROPS) !== undefined)
    .map((p) => {
      const out: PropSpec = { prop: pick(p.prop, PROPS, "book"), slot: pick(p.slot, SLOTS, "center") };
      const depth = pickOpt(p.depth, DEPTHS);
      if (depth) out.depth = depth;
      const tone = pickOpt(p.tone, TONES);
      if (tone) out.tone = tone;
      return out;
    });
  const fx = (Array.isArray(r.fx) ? r.fx : []).filter((e): e is (typeof FX)[number] => pickOpt(e, FX) !== undefined);
  const text: TextSpec[] = (Array.isArray(r.text) ? r.text : [])
    .filter(isRecord)
    .filter((t) => pickOpt(t.kind, TEXT_KINDS) !== undefined && typeof t.text === "string")
    .map((t) => {
      const out: TextSpec = {
        kind: pick(t.kind, TEXT_KINDS, "speech"),
        text: t.text as string,
        fidelity: pick(t.fidelity, FIDELITY, "dramatized"),
      };
      if (typeof t.speaker === "string") out.speaker = t.speaker;
      if (typeof t.about === "string" && out.kind === "caption") out.about = t.about;
      if (isRecord(t.source) && typeof t.source.unit === "string" && typeof t.source.page === "number") {
        out.source = { unit: t.source.unit, page: t.source.page };
      }
      return out;
    });
  const panel: PanelSpec = {
    id: typeof r.id === "string" && r.id.trim() ? r.id : `panel${index + 1}`,
    beat: typeof r.beat === "string" ? r.beat : "",
    shot: pick(r.shot, SHOTS, "medium"),
    angle: pick(r.angle, ANGLES, "eye"),
    location: typeof r.location === "string" ? r.location : "",
    figures,
    props,
    fx,
    text,
    source: [],
  };
  const time = pickOpt(r.time, TIMES);
  if (time) panel.time = time;
  const weather = pickOpt(r.weather, WEATHERS);
  if (weather) panel.weather = weather;
  return panel;
}

/** Per-panel internals exposed for tests, debugging overlays and critique tools. */
export interface PanelDetail {
  id: string;
  figures: FigurePlacement[];
  placed: Placed[];
  /** Indices of texts that did not fit (drawn relaxed for the preview). */
  overflow: number[];
}

export function renderPage(spec: unknown, book: BookRefs, options: RenderOptions = {}): RenderResult {
  return renderPageDetailed(spec, book, options).result;
}

export function renderPageDetailed(
  spec: unknown,
  book: BookRefs,
  options: RenderOptions = {},
): { result: RenderResult; details: PanelDetail[] } {
  const issues: ValidationIssue[] = validatePage(spec, book, options.planned, { previousPageHook: options.previousPageHook });
  const page = isRecord(spec) ? spec : {};
  const pageNumber = typeof page.page_number === "number" && Number.isFinite(page.page_number) ? page.page_number : 0;
  const prefix = sanitizePrefix(options.idPrefix ?? `pg${pageNumber}-`);
  const castById = new Map(book.cast.map((c) => [c.id, c]));
  const rawPanels = Array.isArray(page.panels) ? page.panels : [];
  const panels = rawPanels.map((p, i) => sanitizePanel(p, i, castById));

  // unique ids for geometry even when the spec repeats one (validation reports it)
  const seen = new Set<string>();
  const layoutIds = panels.map((p, i) => {
    let id = p.id;
    if (seen.has(id)) id = `${id}#${i}`;
    seen.add(id);
    return id;
  });
  const layoutSpec: LayoutSpec | undefined = isRecord(page.layout) ? (page.layout as LayoutSpec) : undefined;
  const rtl = layoutSpec?.rtl === true;
  const layout = compileLayout(layoutSpec, layoutIds);
  // (layout issues were already reported by validatePage)

  const pageSeed = hashString(`${String(page.section_id ?? "")}|${pageNumber}`);
  // the look each character wears on this page (scenery keeps a statue's state)
  const pageVariants: Record<string, LookVariant> = {};
  for (const p of panels) for (const f of p.figures) if (f.variant) pageVariants[f.character] = f.variant;
  const composed: ComposedPanel[] = [];
  panels.forEach((panel, i) => {
    const geo = layout.panels[i];
    const textLoad = panel.text.filter((t) => t.kind !== "sfx").length;
    const textArea = estimateTextArea(panel.text);
    const c = composePanel({ panel, index: i, polygon: geo.polygon, bbox: geo.bbox, book, idPrefix: prefix, textLoad, textArea, rtl, pageVariants });
    issues.push(...c.issues);
    composed.push(c);
  });

  // where each character is drawn on the page (for off-panel tails)
  const drawnAt = new Map<string, number[]>();
  composed.forEach((c, i) => {
    for (const f of c.figures) drawnAt.set(f.character, [...(drawnAt.get(f.character) ?? []), i]);
  });

  const balloonLayers: string[] = [];
  const sfxLayers: string[] = [];
  const texts: RenderedText[] = [];
  const details: PanelDetail[] = [];
  panels.forEach((panel, i) => {
    const geo = layout.panels[i];
    const c = composed[i];
    const offPanel: Record<string, Point> = {};
    const centre = { x: geo.bbox.x + geo.bbox.w / 2, y: geo.bbox.y + geo.bbox.h / 2 };
    // a speaker whose head is out of frame (a statue seen from its feet) talks from off-panel, toward the head
    const inFrame = c.figures.filter((f) => !f.headCropped);
    for (const f of c.figures) if (f.headCropped) offPanel[f.character] = f.head;
    for (const t of panel.text) {
      if (!t.speaker || c.figures.some((f) => f.character === t.speaker)) continue;
      // Aim at the nearest panel where the speaker is drawn (its closest point),
      // so the tail leaves through the side that faces that panel.
      let best: Point | undefined;
      let bestD = Infinity;
      for (const j of drawnAt.get(t.speaker) ?? []) {
        if (j === i) continue;
        const b = layout.panels[j].bbox;
        const p = { x: Math.max(b.x, Math.min(centre.x, b.x + b.w)), y: Math.max(b.y, Math.min(centre.y, b.y + b.h)) };
        const d = Math.hypot(p.x - centre.x, p.y - centre.y);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (best) offPanel[t.speaker] = best;
    }
    const lettered = letterPanel({
      panelId: panel.id,
      polygon: geo.polygon,
      bbox: geo.bbox,
      texts: panel.text,
      speakers: inFrame.map((f) => ({ character: f.character, head: f.head, headRadius: f.headRadius, mouth: f.mouth, body: f.body, ...(f.pose ? { pose: f.pose } : {}) })),
      heads: inFrame.map((f) => ({ character: f.character, center: f.head, radius: f.headRadius })),
      bodies: c.figures.map((f) => f.body),
      obstacles: c.obstacles,
      keepOut: c.keepOut,
      ...(c.sfxSource ? { sfxSource: c.sfxSource } : {}),
      offPanel,
      rtl,
      seed: hashString(`${pageSeed}|${panel.id}|${i}|letter`),
      sfxBleed: panel.fx.includes("impact_burst") || panel.fx.includes("speed_lines"),
      page: { x: PAGE_MARGIN, y: PAGE_MARGIN, w: PAGE_WIDTH - 2 * PAGE_MARGIN, h: PAGE_HEIGHT - 2 * PAGE_MARGIN },
      focus: c.focus,
      panelIndex: i,
      names: Object.fromEntries(inFrame.map((f) => [f.character, castById.get(f.character)?.name ?? f.character])),
    });
    issues.push(...lettered.issues);
    texts.push(...lettered.texts);
    details.push({
      id: panel.id,
      figures: c.figures,
      placed: lettered.placed,
      overflow: lettered.issues.filter((x) => x.code === "TEXT_DOES_NOT_FIT").map((x) => Number(/text (\d+)$/.exec(x.path)?.[1] ?? -1)),
    });
    balloonLayers.push(lettered.balloons);
    sfxLayers.push(lettered.sfx);
  });

  const defs = [toneDefs(prefix), ...composed.map((c) => c.defs)].join("");
  const total = composed.length;
  const panelSvg = composed
    .map((c, i) => {
      const poly = polyPath(layout.panels[i].polygon);
      const beat = panels[i]?.beat?.trim() ?? "";
      const label = `Panel ${i + 1} of ${total}${beat ? `: ${beat}` : ""}`;
      return (
        `<g role="group" aria-label="${esc(label)}">` +
        `<g clip-path="url(#${c.clipId})">${c.content}</g>` +
        `<path d="${poly}" fill="none" stroke="${INK}" stroke-width="${n(STROKE.panelBorder)}" stroke-linejoin="miter"/>` +
        (balloonLayers[i] ? `<g>${balloonLayers[i]}</g>` : "") +
        `</g>`
      );
    })
    .join("");
  const purpose = typeof page.purpose === "string" ? page.purpose : "";
  const label = `Manga page ${pageNumber}${purpose ? `: ${purpose}` : ""}`;
  const folio =
    options.folio === false || pageNumber <= 0
      ? ""
      : `<text x="${PAGE_WIDTH / 2}" y="${PAGE_HEIGHT - 12}" font-family="${FONT_FAMILY.dialogue}" font-weight="700" font-size="15" text-anchor="middle" fill="#8a8a86" aria-hidden="true">${pageNumber}</text>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" role="group" aria-label="${esc(label)}">` +
    `<title>${esc(`Page ${pageNumber}`)}</title>` +
    `<desc>${esc(purpose)}</desc>` +
    `<defs>${defs}</defs>` +
    `<rect width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" fill="${PAGE_BG}"/>` +
    `<g>${panelSvg}</g>` +
    `<g>${sfxLayers.join("")}</g>` +
    folio +
    `</svg>`;

  const renderedPanels: RenderedPanel[] = layout.panels.map((p, i) => ({
    id: panels[i]?.id ?? p.id,
    polygon: p.polygon,
    bbox: roundBox(p.bbox),
    order: p.order,
  }));
  const panelWords = panels.map((p) => p.text.filter((t) => t.kind !== "sfx").reduce((s, t) => s + countWords(t.text), 0));
  const result: RenderResult = {
    renderer_version: RENDERER_VERSION,
    svg,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    panels: renderedPanels,
    texts,
    issues,
    svg_hash: createHash("sha256").update(svg).digest("hex"),
    metrics: {
      panel_count: panels.length,
      words_total: panelWords.reduce((a, b) => a + b, 0),
      words_max_panel: panelWords.length ? Math.max(...panelWords) : 0,
      figures_total: composed.reduce((s, c) => s + c.figures.length, 0),
    },
  };
  return { result, details };
}

function roundBox(b: { x: number; y: number; w: number; h: number }) {
  const r = (v: number) => Math.round(v * 100) / 100;
  return { x: r(b.x), y: r(b.y), w: r(b.w), h: r(b.h) };
}

/** True when the result has no error-severity issues (safe to accept). */
export function isAcceptable(result: Pick<RenderResult, "issues">): boolean {
  return !result.issues.some((i) => i.severity === "error");
}
