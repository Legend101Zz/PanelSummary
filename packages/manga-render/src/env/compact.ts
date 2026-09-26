/**
 * Path-data compaction for drawing-module output.
 *
 * Every `d="..."` attribute is re-encoded with relative commands and numbers
 * snapped to a fixed grid (1 or 2 decimals). Positions are snapped in
 * ABSOLUTE space first and each relative step is the difference of two
 * snapped positions, so rounding never drifts along a long path and closed
 * shapes stay closed. Geometry changes by at most half a grid step.
 *
 * Typical saving is 30-45% of path bytes (drawing modules emit absolute
 * coordinates with two decimals).
 */

type Seg = { c: string; v: number[] };

const TOKEN = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;

const ARITY: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

/** Parse path data into segments with absolute coordinates (H/V become L). */
export function parsePath(d: string): Seg[] | null {
  const out: Seg[] = [];
  let cmd = "";
  let nums: number[] = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const flush = (): boolean => {
    if (!cmd) return nums.length === 0;
    const lower = cmd.toLowerCase();
    const k = ARITY[lower];
    if (k === undefined) return false;
    if (k === 0) {
      out.push({ c: "Z", v: [] });
      x = sx;
      y = sy;
      if (nums.length) return false;
      return true;
    }
    if (nums.length === 0 || nums.length % k !== 0) return false;
    const rel = cmd !== cmd.toUpperCase();
    for (let i = 0; i < nums.length; i += k) {
      const a = nums.slice(i, i + k);
      let c = lower;
      if (c === "m" && i > 0) c = "l"; // implicit lineto after moveto
      switch (c) {
        case "m":
        case "l":
        case "t": {
          const nx = rel ? x + a[0] : a[0];
          const ny = rel ? y + a[1] : a[1];
          out.push({ c: c.toUpperCase(), v: [nx, ny] });
          x = nx;
          y = ny;
          if (c === "m") {
            sx = x;
            sy = y;
          }
          break;
        }
        case "h": {
          const nx = rel ? x + a[0] : a[0];
          out.push({ c: "L", v: [nx, y] });
          x = nx;
          break;
        }
        case "v": {
          const ny = rel ? y + a[0] : a[0];
          out.push({ c: "L", v: [x, ny] });
          y = ny;
          break;
        }
        case "c": {
          const v = rel ? [x + a[0], y + a[1], x + a[2], y + a[3], x + a[4], y + a[5]] : a;
          out.push({ c: "C", v });
          x = v[4];
          y = v[5];
          break;
        }
        case "s":
        case "q": {
          const v = rel ? [x + a[0], y + a[1], x + a[2], y + a[3]] : a;
          out.push({ c: c.toUpperCase(), v });
          x = v[2];
          y = v[3];
          break;
        }
        case "a": {
          const nx = rel ? x + a[5] : a[5];
          const ny = rel ? y + a[6] : a[6];
          out.push({ c: "A", v: [a[0], a[1], a[2], a[3], a[4], nx, ny] });
          x = nx;
          y = ny;
          break;
        }
      }
    }
    return true;
  };
  for (const m of d.matchAll(TOKEN)) {
    if (m[1]) {
      if (!flush()) return null;
      cmd = m[1];
      nums = [];
      if (cmd === "Z" || cmd === "z") {
        if (!flush()) return null;
        cmd = "";
      }
    } else {
      const v = Number(m[2]);
      if (!Number.isFinite(v)) return null;
      nums.push(v);
    }
  }
  if (!flush()) return null;
  return out;
}

function fmt(v: number, dec: number): string {
  const f = 10 ** dec;
  const r = Math.round(v * f) / f;
  if (Object.is(r, -0) || r === 0) return "0";
  let s = r.toFixed(dec);
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  if (s.startsWith("0.")) s = s.slice(1);
  else if (s.startsWith("-0.")) s = `-${s.slice(2)}`;
  return s;
}

/** Join numbers compactly: a minus sign doubles as the separator. */
function joinNums(parts: string[]): string {
  let out = "";
  for (const p of parts) out += out === "" || p.startsWith("-") ? p : ` ${p}`;
  return out;
}

/**
 * Re-encode path data relative and grid-snapped. Returns the input unchanged
 * when it cannot be parsed (never breaks a drawing).
 */
export function compactPathD(d: string, dec = 2): string {
  const segs = parsePath(d);
  if (!segs || segs.length === 0) return d;
  const f = 10 ** dec;
  const snap = (v: number) => Math.round(v * f) / f;
  // emitted (snapped) current point and subpath start
  let px = 0;
  let py = 0;
  let sx = 0;
  let sy = 0;
  let out = "";
  let last = "";
  let first = true;
  const rel = (v: number, base: number) => fmt(snap(v) - base, dec);
  for (const s of segs) {
    let c = s.c;
    let nums: string[] = [];
    switch (c) {
      case "M": {
        const ax = snap(s.v[0]);
        const ay = snap(s.v[1]);
        if (first) {
          nums = [fmt(ax, dec), fmt(ay, dec)];
          c = "M";
        } else {
          nums = [fmt(ax - px, dec), fmt(ay - py, dec)];
          c = "m";
        }
        px = ax;
        py = ay;
        sx = ax;
        sy = ay;
        break;
      }
      case "L": {
        const ax = snap(s.v[0]);
        const ay = snap(s.v[1]);
        if (ay === py && ax !== px) {
          c = "h";
          nums = [fmt(ax - px, dec)];
        } else if (ax === px && ay !== py) {
          c = "v";
          nums = [fmt(ay - py, dec)];
        } else {
          c = "l";
          nums = [fmt(ax - px, dec), fmt(ay - py, dec)];
        }
        px = ax;
        py = ay;
        break;
      }
      case "C": {
        nums = [rel(s.v[0], px), rel(s.v[1], py), rel(s.v[2], px), rel(s.v[3], py), rel(s.v[4], px), rel(s.v[5], py)];
        c = "c";
        px = snap(s.v[4]);
        py = snap(s.v[5]);
        break;
      }
      case "S":
      case "Q": {
        nums = [rel(s.v[0], px), rel(s.v[1], py), rel(s.v[2], px), rel(s.v[3], py)];
        c = c.toLowerCase();
        px = snap(s.v[2]);
        py = snap(s.v[3]);
        break;
      }
      case "T": {
        nums = [rel(s.v[0], px), rel(s.v[1], py)];
        c = "t";
        px = snap(s.v[0]);
        py = snap(s.v[1]);
        break;
      }
      case "A": {
        nums = [fmt(s.v[0], dec), fmt(s.v[1], dec), fmt(s.v[2], 1), s.v[3] ? "1" : "0", s.v[4] ? "1" : "0", rel(s.v[5], px), rel(s.v[6], py)];
        c = "a";
        px = snap(s.v[5]);
        py = snap(s.v[6]);
        break;
      }
      case "Z": {
        out += "z";
        last = "z";
        px = sx;
        py = sy;
        continue;
      }
    }
    first = false;
    const body = joinNums(nums);
    // repeated commands may drop their letter (never after a moveto)
    if (c === last && c !== "m" && c !== "M") out += body.startsWith("-") ? body : ` ${body}`;
    else out += c + body;
    last = c;
  }
  return out;
}

/** Compact every d="..." attribute of an SVG fragment. */
export function compactSvg(svg: string, dec = 2): string {
  return svg.replace(/ d="([^"]*)"/g, (_all, d: string) => ` d="${compactPathD(d, dec)}"`);
}

/** Absolute vertices (end points and control points) of path data, for tests and bounds. */
export function pathPoints(d: string): { x: number; y: number }[] {
  const segs = parsePath(d) ?? [];
  const pts: { x: number; y: number }[] = [];
  for (const s of segs) {
    if (s.c === "A") pts.push({ x: s.v[5], y: s.v[6] });
    else for (let i = 0; i + 1 < s.v.length; i += 2) pts.push({ x: s.v[i], y: s.v[i + 1] });
  }
  return pts;
}

interface BoxLike {
  x: number;
  y: number;
  w: number;
  h: number;
}

function segsBounds(segs: Seg[]): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const take = (x: number, y: number, r = 0) => {
    if (x - r < x0) x0 = x - r;
    if (y - r < y0) y0 = y - r;
    if (x + r > x1) x1 = x + r;
    if (y + r > y1) y1 = y + r;
  };
  for (const s of segs) {
    if (s.c === "A") take(s.v[5], s.v[6], Math.max(Math.abs(s.v[0]), Math.abs(s.v[1])) * 2);
    else for (let i = 0; i + 1 < s.v.length; i += 2) take(s.v[i], s.v[i + 1]);
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

/**
 * Drop geometry that lies wholly outside `box` (+margin): whole elements,
 * and the absolute-moveto subpaths of a path. Panels are clipped later, so
 * this never changes what is seen; it only removes bytes.
 */
export function cullOutside(svg: string, box: BoxLike, margin = 24): string {
  const X0 = box.x - margin;
  const Y0 = box.y - margin;
  const X1 = box.x + box.w + margin;
  const Y1 = box.y + box.h + margin;
  const inside = (b: { x0: number; y0: number; x1: number; y1: number }) => b.x1 >= X0 && b.x0 <= X1 && b.y1 >= Y0 && b.y0 <= Y1;
  let out = svg.replace(/<path d="([^"]*)"([^>]*)\/>/g, (all, d: string, rest: string) => {
    // split at absolute movetos only (relative subpaths depend on their predecessor)
    const parts = d.split(/(?=M)/);
    if (parts.length === 0) return all;
    const keep: string[] = [];
    let changed = false;
    for (const part of parts) {
      const segs = parsePath(part);
      if (!segs) return all;
      const b = segsBounds(segs);
      if (!b || inside(b)) keep.push(part);
      else changed = true;
    }
    if (!changed) return all;
    if (keep.length === 0) return "";
    return `<path d="${keep.join("")}"${rest}/>`;
  });
  out = out.replace(/<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="([\d.]+)"([^>]*)\/>/g, (all, cx: string, cy: string, r: string) => {
    const x = Number(cx);
    const y = Number(cy);
    const rr = Number(r);
    return inside({ x0: x - rr, y0: y - rr, x1: x + rr, y1: y + rr }) ? all : "";
  });
  return out;
}

/** Approximate area (page units²) a path covers inside `box` (for tone budgets). */
export function pathAreaIn(d: string, box: BoxLike): number {
  const segs = parsePath(d);
  if (!segs) return 0;
  // split into subpaths at every moveto (absolute after parsing)
  const subs: Seg[][] = [];
  for (const s of segs) {
    if (s.c === "M" || subs.length === 0) subs.push([]);
    subs[subs.length - 1].push(s);
  }
  let area = 0;
  for (const sub of subs) {
    const pts: { x: number; y: number }[] = [];
    for (const s of sub) {
      if (s.c === "A") pts.push({ x: s.v[5], y: s.v[6] });
      else if (s.v.length >= 2) pts.push({ x: s.v[s.v.length - 2], y: s.v[s.v.length - 1] });
    }
    const b = segsBounds(sub);
    if (!b || pts.length === 0) continue;
    let shoelace = 0;
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i];
      const c = pts[(i + 1) % pts.length];
      shoelace += a.x * c.y - c.x * a.y;
    }
    // arcs (circles drawn as two half arcs) have no vertices to speak of
    const arcR = sub.filter((s) => s.c === "A").reduce((m, s) => Math.max(m, Math.abs(s.v[0]) * Math.abs(s.v[1])), 0);
    const poly = Math.max(Math.abs(shoelace) / 2, arcR * Math.PI);
    const ix = Math.max(0, Math.min(b.x1, box.x + box.w) - Math.max(b.x0, box.x));
    const iy = Math.max(0, Math.min(b.y1, box.y + box.h) - Math.max(b.y0, box.y));
    area += Math.min(poly, ix * iy);
  }
  return area;
}
