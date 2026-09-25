/**
 * Layout compiler: LayoutSpec (named template or authored split tree) + panel
 * ids in reading order → convex panel polygons in page space.
 *
 * Reading order is the depth-first leaf order of the tree. With rtl=true the
 * geometry is mirrored, so the first child of a cols split lands on the right
 * and reading order is unchanged.
 */
import {
  DEFAULT_GUTTER,
  PAGE_HEIGHT,
  PAGE_MARGIN,
  PAGE_WIDTH,
  type Box,
  type LayoutNode,
  type LayoutSpec,
  type Point,
  type ValidationIssue,
} from "../contracts.js";
import { bboxOf, clipHalfPlane, convexDimensions, normalizePolygon } from "./geometry.js";
import { findTemplate, templatesWithSlots, TEMPLATES, type LayoutTemplate } from "./templates.js";

export const MAX_PANELS = 7;
export const MIN_PANEL_SIDE = 140;
export const MAX_PANEL_ASPECT = 5;
export const MAX_SLANT = 12;
const MAX_DEPTH = 5;

export interface CompiledPanel {
  id: string;
  polygon: Point[];
  bbox: Box;
  /** Reading order, 0-based. */
  order: number;
}

export interface CompiledLayout {
  panels: CompiledPanel[];
  issues: ValidationIssue[];
  /** Template id actually used (after any fallback), or "tree". */
  source: string;
  /** False when the requested layout was invalid and a fallback was used. */
  ok: boolean;
}

export interface CompileOptions {
  gutter?: number;
  margin?: number;
}

/** Page area inside the margins. */
export function pageFrame(margin = PAGE_MARGIN): Point[] {
  return [
    { x: margin, y: margin },
    { x: PAGE_WIDTH - margin, y: margin },
    { x: PAGE_WIDTH - margin, y: PAGE_HEIGHT - margin },
    { x: margin, y: PAGE_HEIGHT - margin },
  ];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Leaf ids of a (possibly malformed) tree in depth-first order. */
export function treeLeaves(node: unknown): string[] {
  const out: string[] = [];
  const walk = (n: unknown, depth: number) => {
    if (!isRecord(n) || depth > 12) return;
    if (typeof n.panel === "string") {
      out.push(n.panel);
      return;
    }
    if (Array.isArray(n.children)) for (const c of n.children) walk(c, depth + 1);
  };
  walk(node, 0);
  return out;
}

/**
 * Structural validation of an authored tree (no geometry). Messages are
 * written for an LLM repairing its JSON.
 */
export function validateTree(tree: unknown, panelIds: readonly string[], path = "page.layout.tree"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (code: string, where: string, message: string) => issues.push({ code, severity: "error", path: where, message });
  const walk = (node: unknown, where: string, depth: number) => {
    if (depth > MAX_DEPTH) {
      err("LAYOUT_TREE_DEPTH", where, `layout tree is nested deeper than ${MAX_DEPTH} levels; flatten it (use a template or fewer nested splits).`);
      return;
    }
    if (!isRecord(node)) {
      err("LAYOUT_TREE_NODE", where, `each layout node must be an object: either {"panel": "<panel id>"} or {"split": "rows"|"cols", "sizes": [..], "children": [..]}.`);
      return;
    }
    if ("panel" in node) {
      if (typeof node.panel !== "string" || node.panel.length === 0) {
        err("LAYOUT_TREE_NODE", where, `"panel" must be a panel id string from this page's panels.`);
      }
      if ("split" in node || "children" in node) {
        err("LAYOUT_TREE_NODE", where, `a leaf {"panel": ...} must not also have "split" or "children".`);
      }
      return;
    }
    if (node.split !== "rows" && node.split !== "cols") {
      err("LAYOUT_TREE_SPLIT", where, `"split" must be "rows" (stack top-to-bottom) or "cols" (side by side in reading order); got ${JSON.stringify(node.split)}.`);
    }
    const children = Array.isArray(node.children) ? node.children : undefined;
    if (!children) {
      err("LAYOUT_TREE_CHILDREN", where, `a split needs a "children" array of layout nodes.`);
      return;
    }
    if (children.length < 2) {
      err("LAYOUT_TREE_CHILDREN", where, `a split needs at least 2 children; replace a 1-child split with its child.`);
    }
    const sizes = node.sizes;
    if (!Array.isArray(sizes) || sizes.length !== children.length) {
      err(
        "LAYOUT_TREE_SIZES",
        where,
        `"sizes" must be an array with one positive weight per child (${children.length} children); e.g. ${JSON.stringify(children.map(() => 1))}.`,
      );
    } else if (!sizes.every((s) => typeof s === "number" && Number.isFinite(s) && s > 0)) {
      err("LAYOUT_TREE_SIZES", where, `every size must be a positive number (relative weight); got ${JSON.stringify(sizes)}.`);
    }
    if (node.slant !== undefined) {
      if (typeof node.slant !== "number" || !Number.isFinite(node.slant) || Math.abs(node.slant) > MAX_SLANT) {
        err("LAYOUT_TREE_SLANT", where, `"slant" must be a number of degrees between -${MAX_SLANT} and ${MAX_SLANT}; got ${JSON.stringify(node.slant)}.`);
      }
    }
    children.forEach((c, i) => walk(c, `${where}.children[${i}]`, depth + 1));
  };
  walk(tree, path, 0);

  const leaves = treeLeaves(tree);
  if (leaves.length > MAX_PANELS) {
    err("LAYOUT_TOO_MANY_PANELS", path, `layout tree has ${leaves.length} panels; the maximum is ${MAX_PANELS}. Split the page into two pages.`);
  }
  const seen = new Set<string>();
  for (const leaf of leaves) {
    if (seen.has(leaf)) err("LAYOUT_TREE_DUPLICATE", path, `panel "${leaf}" appears more than once in the layout tree; each panel id must appear exactly once.`);
    seen.add(leaf);
  }
  if (leaves.length !== panelIds.length) {
    err(
      "LAYOUT_LEAF_COUNT",
      path,
      `layout tree has ${leaves.length} leaf panels but the page has ${panelIds.length} panels; the tree must contain exactly one {"panel": id} leaf per panel.`,
    );
  }
  const missing = panelIds.filter((id) => !seen.has(id));
  const unknown = leaves.filter((id) => !panelIds.includes(id));
  if (missing.length > 0) err("LAYOUT_TREE_MISSING_PANEL", path, `panels ${missing.map((m) => `"${m}"`).join(", ")} are not placed in the layout tree; add a {"panel": id} leaf for each.`);
  if (unknown.length > 0) err("LAYOUT_TREE_UNKNOWN_PANEL", path, `layout tree names ${unknown.map((m) => `"${m}"`).join(", ")} which are not panel ids on this page (panel ids: ${panelIds.map((m) => `"${m}"`).join(", ")}).`);
  if (missing.length === 0 && unknown.length === 0 && leaves.length === panelIds.length && seen.size === leaves.length) {
    const sameOrder = leaves.every((id, i) => id === panelIds[i]);
    if (!sameOrder) {
      err(
        "LAYOUT_READING_ORDER",
        path,
        `the tree's reading order (depth-first: rows top-to-bottom, cols in reading direction) is ${leaves.join(" → ")} but "panels" are listed ${panelIds.join(" → ")}; reorder the panels array or the tree so they agree.`,
      );
    }
  }
  return issues;
}

interface Region {
  poly: Point[];
}

/** Extent of a convex polygon along a line through its centre in the given axis. */
function centreExtent(poly: readonly Point[], axis: "x" | "y"): { lo: number; hi: number; mid: number } {
  const b = bboxOf(poly);
  if (axis === "y") {
    // vertical line through bbox centre x
    const cx = b.x + b.w / 2;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      if ((p.x - cx) * (q.x - cx) <= 0 && p.x !== q.x) {
        const t = (cx - p.x) / (q.x - p.x);
        const y = p.y + (q.y - p.y) * t;
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      } else if (p.x === cx) {
        lo = Math.min(lo, p.y);
        hi = Math.max(hi, p.y);
      }
    }
    if (!Number.isFinite(lo)) return { lo: b.y, hi: b.y + b.h, mid: cx };
    return { lo, hi, mid: cx };
  }
  const cy = b.y + b.h / 2;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    if ((p.y - cy) * (q.y - cy) <= 0 && p.y !== q.y) {
      const t = (cy - p.y) / (q.y - p.y);
      const x = p.x + (q.x - p.x) * t;
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    } else if (p.y === cy) {
      lo = Math.min(lo, p.x);
      hi = Math.max(hi, p.x);
    }
  }
  if (!Number.isFinite(lo)) return { lo: b.x, hi: b.x + b.w, mid: cy };
  return { lo, hi, mid: cy };
}

function splitRegion(region: Region, node: Extract<LayoutNode, { split: string }>, gutter: number): Region[] {
  const k = node.children.length;
  const total = node.sizes.reduce((a, b) => a + b, 0);
  const weights = node.sizes.map((s) => s / total);
  const axis = node.split === "rows" ? "y" : "x";
  const { lo, hi, mid } = centreExtent(region.poly, axis);
  const available = Math.max(1, hi - lo - gutter * (k - 1));
  const theta = ((node.slant ?? 0) * Math.PI) / 180;
  // Cut normal: rows → (-sinθ, cosθ); cols → (cosθ, -sinθ). Normal points toward later children.
  const nx = node.split === "rows" ? -Math.sin(theta) : Math.cos(theta);
  const ny = node.split === "rows" ? Math.cos(theta) : -Math.sin(theta);
  const cuts: number[] = []; // n·p0 of each gutter centre line
  let pos = lo;
  for (let i = 0; i < k - 1; i += 1) {
    pos += weights[i] * available;
    const centre = pos + gutter / 2;
    const p0 = axis === "y" ? { x: mid, y: centre } : { x: centre, y: mid };
    cuts.push(nx * p0.x + ny * p0.y);
    pos += gutter;
  }
  const out: Region[] = [];
  for (let i = 0; i < k; i += 1) {
    let poly = region.poly;
    if (i > 0) poly = clipHalfPlane(poly, -nx, -ny, -(cuts[i - 1] + gutter / 2));
    if (i < k - 1) poly = clipHalfPlane(poly, nx, ny, cuts[i] - gutter / 2);
    out.push({ poly });
  }
  return out;
}

function layoutTree(node: LayoutNode, region: Region, gutter: number, out: Map<string, Point[]>): void {
  if ("panel" in node) {
    out.set(node.panel, region.poly);
    return;
  }
  const regions = splitRegion(region, node, gutter);
  node.children.forEach((child, i) => layoutTree(child, regions[i], gutter, out));
}

function mirror(poly: readonly Point[]): Point[] {
  return poly.map((p) => ({ x: PAGE_WIDTH - p.x, y: p.y }));
}

/** Replace template leaf numbers with real panel ids. */
function bindTemplate(t: LayoutTemplate, panelIds: readonly string[]): LayoutNode {
  const bind = (node: LayoutNode): LayoutNode => {
    if ("panel" in node) return { panel: panelIds[Number(node.panel)] };
    return { ...node, children: node.children.map(bind) };
  };
  return bind(t.tree);
}

/** Geometric checks on compiled panels: minimum side and aspect ratio. */
export function checkPanelGeometry(panels: readonly CompiledPanel[], path: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const p of panels) {
    if (p.polygon.length < 3) {
      issues.push({
        code: "LAYOUT_PANEL_COLLAPSED",
        severity: "error",
        path,
        message: `panel "${p.id}" collapsed to nothing (a slant or size cut it away); use smaller slants or larger sizes for it.`,
      });
      continue;
    }
    const { short, long } = convexDimensions(p.polygon);
    if (short < MIN_PANEL_SIDE) {
      issues.push({
        code: "LAYOUT_PANEL_TOO_SMALL",
        severity: "error",
        path,
        message: `panel "${p.id}" is only ${Math.round(short)}px on its short side (minimum ${MIN_PANEL_SIDE}px); give it a larger size weight, reduce slant, or use fewer panels in that row/column.`,
      });
    }
    if (short > 0 && long / short > MAX_PANEL_ASPECT) {
      issues.push({
        code: "LAYOUT_PANEL_ASPECT",
        severity: "error",
        path,
        message: `panel "${p.id}" is ${(long / short).toFixed(1)}:1 (maximum ${MAX_PANEL_ASPECT}:1); rebalance the sizes so no panel is a sliver.`,
      });
    }
  }
  return issues;
}

function compileNode(tree: LayoutNode, panelIds: readonly string[], rtl: boolean, opts: CompileOptions): CompiledPanel[] {
  const gutter = opts.gutter ?? DEFAULT_GUTTER;
  const polys = new Map<string, Point[]>();
  layoutTree(tree, { poly: pageFrame(opts.margin ?? PAGE_MARGIN) }, gutter, polys);
  return panelIds.map((id, order) => {
    let poly = polys.get(id) ?? [];
    if (rtl) poly = mirror(poly);
    const polygon = normalizePolygon(poly);
    return { id, polygon, bbox: bboxOf(polygon), order };
  });
}

/** Normalise sizes so every split's weights sum to 1 (returns a new tree). */
export function normalizeTree(node: LayoutNode): LayoutNode {
  if ("panel" in node) return { panel: node.panel };
  const total = node.sizes.reduce((a, b) => a + b, 0);
  const out: LayoutNode = {
    split: node.split,
    sizes: node.sizes.map((s) => s / total),
    children: node.children.map(normalizeTree),
  };
  if (node.slant !== undefined && node.slant !== 0) out.slant = node.slant;
  return out;
}

/** Default template for a panel count (used as a fallback when a layout is invalid). */
export function defaultTemplateFor(count: number): LayoutTemplate | undefined {
  return templatesWithSlots(Math.max(1, Math.min(MAX_PANELS, count)))[0];
}

/** Uniform stack used only when nothing else can hold the panels (e.g. > 7 panels). */
function fallbackStack(count: number): LayoutNode {
  const perRow = Math.ceil(count / Math.ceil(count / 2));
  const rowsOut: LayoutNode[] = [];
  let index = 0;
  while (index < count) {
    const n = Math.min(perRow, count - index);
    const leaves: LayoutNode[] = [];
    for (let i = 0; i < n; i += 1) leaves.push({ panel: String(index + i) });
    index += n;
    rowsOut.push(n === 1 ? leaves[0] : { split: "cols", sizes: leaves.map(() => 1), children: leaves });
  }
  return rowsOut.length === 1 ? rowsOut[0] : { split: "rows", sizes: rowsOut.map(() => 1), children: rowsOut };
}

/**
 * Compile a page layout. Always returns one polygon per panel id (falling
 * back to a default template when the requested layout is invalid) plus the
 * issues explaining any problem.
 */
export function compileLayout(spec: LayoutSpec | undefined, panelIds: readonly string[], opts: CompileOptions = {}): CompiledLayout {
  const issues: ValidationIssue[] = [];
  const rtl = spec?.rtl === true;
  const path = "page.layout";
  const count = panelIds.length;
  const fallback = (): CompiledLayout => {
    const t = defaultTemplateFor(count);
    if (t && t.slots === count) {
      return { panels: compileNode(bindTemplate(t, panelIds), panelIds, rtl, opts), issues, source: t.id, ok: false };
    }
    const stack = fallbackStack(Math.max(1, count));
    const bound = bindTemplate({ id: "stack", slots: count, description: "", tree: stack }, panelIds);
    return { panels: compileNode(bound, panelIds, rtl, opts), issues, source: "fallback_stack", ok: false };
  };

  if (count === 0) {
    issues.push({ code: "LAYOUT_NO_PANELS", severity: "error", path, message: "the page has no panels; add 1-7 panels." });
    return { panels: [], issues, source: "none", ok: false };
  }
  if (!spec || (spec.template === undefined && spec.tree === undefined)) {
    issues.push({
      code: "LAYOUT_MISSING",
      severity: "error",
      path,
      message: `layout needs either "template" (one of the named templates) or "tree" (an authored split tree). Templates for ${count} panels: ${templatesWithSlots(count).map((t) => t.id).join(", ") || "none"}.`,
    });
    return fallback();
  }
  if (spec.template !== undefined && spec.tree !== undefined) {
    issues.push({
      code: "LAYOUT_AMBIGUOUS",
      severity: "error",
      path,
      message: `layout has both "template" and "tree"; keep exactly one.`,
    });
    return fallback();
  }
  if (spec.template !== undefined) {
    const t = typeof spec.template === "string" ? findTemplate(spec.template) : undefined;
    if (!t) {
      issues.push({
        code: "LAYOUT_TEMPLATE_UNKNOWN",
        severity: "error",
        path: `${path}.template`,
        message: `unknown template ${JSON.stringify(spec.template)}. Templates for ${count} panels: ${templatesWithSlots(count).map((x) => x.id).join(", ") || "none (use 1-7 panels)"}. All templates: ${TEMPLATES.map((x) => `${x.id}(${x.slots})`).join(", ")}.`,
      });
      return fallback();
    }
    if (t.slots !== count) {
      issues.push({
        code: "LAYOUT_SLOT_COUNT",
        severity: "error",
        path: `${path}.template`,
        message: `template "${t.id}" has ${t.slots} panel slots but the page has ${count} panels. Use a ${count}-panel template (${templatesWithSlots(count).map((x) => x.id).join(", ") || "none — use 1-7 panels"}) or change the panel count to ${t.slots}.`,
      });
      return fallback();
    }
    const panels = compileNode(bindTemplate(t, panelIds), panelIds, rtl, opts);
    return { panels, issues, source: t.id, ok: true };
  }
  const treeIssues = validateTree(spec.tree, panelIds, `${path}.tree`);
  if (treeIssues.length > 0) {
    issues.push(...treeIssues);
    return fallback();
  }
  const tree = normalizeTree(spec.tree as LayoutNode);
  const panels = compileNode(tree, panelIds, rtl, opts);
  const geo = checkPanelGeometry(panels, `${path}.tree`);
  issues.push(...geo);
  if (geo.some((i) => i.severity === "error")) {
    const fb = fallback();
    return fb;
  }
  return { panels, issues, source: "tree", ok: true };
}
