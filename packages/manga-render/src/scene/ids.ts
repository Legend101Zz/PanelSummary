/**
 * SVG id hygiene for fragments produced by drawing modules.
 *
 * - scopeIds: renames every id DEFINED in a fragment to a page-unique,
 *   prefixed id (`<prefix><scope>-<name>`) and rewrites the fragment's own
 *   references to it. Ids the fragment only references (the page's tone
 *   patterns) are left alone. So two figures that both define "hair-clip"
 *   can never collide, and an unprefixed id can never leak into the page.
 * - hoistDefs: pulls every <defs>…</defs> block out of a fragment so the
 *   page can emit exactly one root <defs>. Paint servers and clip paths
 *   resolve in the referencing element's user space, so moving their
 *   definitions does not change rendering.
 */

export function scopeIds(svg: string, prefix: string, scope: string): string {
  const defined = new Set<string>();
  for (const m of svg.matchAll(/\sid="([^"]+)"/g)) defined.add(m[1]);
  if (defined.size === 0) return svg;
  const rename = (id: string) => {
    const base = id.startsWith(prefix) ? id.slice(prefix.length) : id;
    return `${prefix}${scope}-${base}`;
  };
  return svg
    .replace(/(\sid=")([^"]+)(")/g, (all, a: string, id: string, c: string) => (defined.has(id) ? `${a}${rename(id)}${c}` : all))
    .replace(/url\(#([^)]+)\)/g, (all, id: string) => (defined.has(id) ? `url(#${rename(id)})` : all))
    .replace(/(href=")#([^"]+)(")/g, (all, a: string, id: string, c: string) => (defined.has(id) ? `${a}#${rename(id)}${c}` : all));
}

export function hoistDefs(svg: string): { body: string; defs: string } {
  const defs: string[] = [];
  const body = svg
    .replace(/<defs\s*\/>/g, "")
    .replace(/<defs(?:\s[^>]*)?>([\s\S]*?)<\/defs>/g, (_all, inner: string) => {
      defs.push(inner);
      return "";
    });
  return { body, defs: defs.join("") };
}

/**
 * resvg (the preview rasteriser) panics when an element with `opacity` shares
 * a clipped group with geometry that extends far outside the panel. On a
 * single shape, `opacity` is visually equivalent to fill-opacity plus
 * stroke-opacity, which resvg handles, so rewrite it on leaf shapes.
 */
function leafOpacity(svg: string): string {
  return svg.replace(/<(path|rect|circle|ellipse|line|polyline|polygon)\b([^>]*?)\sopacity="([^"]*)"([^>]*?)(\/?)>/g, (all, tag: string, a: string, value: string, b: string, close: string) => {
    const attrs = `${a}${b}`;
    if (/fill-opacity=|stroke-opacity=/.test(attrs)) return all;
    return `<${tag}${a}${b} fill-opacity="${value}" stroke-opacity="${value}"${close}>`;
  });
}

/** Strip anything a drawing module must never emit (defence in depth). */
export function sanitizeFragment(svg: string): string {
  return leafOpacity(svg)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<script[^>]*\/>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/<image[^>]*\/>/gi, "")
    .replace(/<image[\s\S]*?<\/image>/gi, "")
    .replace(/\son[a-z]+="[^"]*"/gi, "")
    .replace(/\sclass="[^"]*"/g, "");
}

function escapeRe(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Screentones are userSpaceOnUse patterns, so a fragment drawn inside a
 * `scale(s)` group would show dots s times too big. For such a fragment,
 * emit page-scale copies of the tones it uses (patternTransform scale(1/s))
 * under scoped ids and point the fragment at them.
 */
export function rescaleTones(
  fragment: string,
  prefix: string,
  scope: string,
  scale: number,
  toneDefsSvg: string,
): { body: string; defs: string } {
  const s = Math.abs(scale);
  if (!Number.isFinite(s) || s <= 0 || Math.abs(s - 1) < 1e-3) return { body: fragment, defs: "" };
  const used = new Set<string>();
  const ref = new RegExp(`url\\(#${escapeRe(prefix)}tone-([A-Za-z0-9_]+)\\)`, "g");
  for (const m of fragment.matchAll(ref)) used.add(m[1]);
  if (used.size === 0) return { body: fragment, defs: "" };
  const inv = Number((1 / s).toPrecision(6));
  let body = fragment;
  let defs = "";
  for (const tone of [...used].sort()) {
    const m = new RegExp(`<pattern id="${escapeRe(prefix)}tone-${tone}"([^>]*)>([\\s\\S]*?)</pattern>`).exec(toneDefsSvg);
    if (!m) continue; // gradients are bounding-box relative and need no rescale
    const attrs = m[1];
    const t = /patternTransform="([^"]*)"/.exec(attrs);
    const next = `scale(${inv})${t ? ` ${t[1]}` : ""}`;
    const newAttrs = t ? attrs.replace(t[0], `patternTransform="${next}"`) : `${attrs} patternTransform="${next}"`;
    const id = `${prefix}${scope}-tone-${tone}`;
    defs += `<pattern id="${id}"${newAttrs}>${m[2]}</pattern>`;
    body = body.split(`url(#${prefix}tone-${tone})`).join(`url(#${id})`);
  }
  return { body, defs };
}

/** Run a module fragment through sanitising, id scoping and defs hoisting. */
export function adoptFragment(svg: string, prefix: string, scope: string): { body: string; defs: string } {
  return hoistDefs(scopeIds(sanitizeFragment(svg), prefix, scope));
}
