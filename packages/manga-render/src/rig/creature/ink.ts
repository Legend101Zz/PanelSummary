/**
 * `Ink`: a Sketch wrapper that maps every local point through a transform,
 * so a whole object/plant/spirit can be leaned, lifted, tipped over or
 * squashed by a pose while strokes stay page-constant.
 */
import type { Point } from "../../contracts.js";
import { polyPath } from "../../svg.js";
import {
  type LineOpts,
  type Pen,
  type ShapeOpts,
  Sketch,
  type Xf,
  affine,
  blobD,
  compose,
  curveD,
  ellipsePts,
  lineD,
  puffD,
  taperPts,
} from "./common.js";

export class Ink {
  constructor(
    readonly sk: Sketch,
    public xf: Xf,
    /** Rotation carried by xf (radians), for faces and circles. */
    public rot = 0,
    /** Uniform scale carried by xf. */
    public scale = 1,
  ) {}

  get pen(): Pen {
    return this.sk.pen;
  }

  p(x: number, y: number): Point {
    return this.xf({ x, y });
  }

  poly(pts: readonly Point[], fill: string, opts?: ShapeOpts): this {
    this.sk.shape(polyPath(pts.map(this.xf), true), fill, opts);
    return this;
  }

  blob(pts: readonly Point[], fill: string, opts?: ShapeOpts, tension = 0.5): this {
    this.sk.shape(blobD(pts.map(this.xf), tension), fill, opts);
    return this;
  }

  ell(c: Point, rx: number, ry: number, fill: string, opts?: ShapeOpts, count = 24): this {
    this.sk.shape(blobD(ellipsePts(c, rx, ry, count).map(this.xf), 0.5), fill, opts);
    return this;
  }

  /** Open ring (handles, loops): an ink stroke that also thickens the silhouette. */
  ring(c: Point, rx: number, ry: number, width: number): this {
    this.sk.line(blobD(ellipsePts(c, rx, ry, 20).map(this.xf), 0.5), width, { outline: true });
    return this;
  }

  /** Filled mark without outline (spots, highlights). */
  spot(c: Point, rx: number, ry: number, fill: string): this {
    this.sk.fill(blobD(ellipsePts(c, rx, ry, 16).map(this.xf), 0.5), fill);
    return this;
  }

  line(pts: readonly Point[], width: number, opts?: LineOpts): this {
    this.sk.line(lineD(pts.map(this.xf)), width, opts);
    return this;
  }

  curve(pts: readonly Point[], width: number, opts?: LineOpts): this {
    this.sk.line(curveD(pts.map(this.xf)), width, opts);
    return this;
  }

  taper(spine: readonly Point[], widths: readonly number[], fill: string, opts?: ShapeOpts, samples = 5): this {
    const pts = taperPts(spine, widths.map((w) => w), { samples }).map(this.xf);
    this.sk.shape(polyPath(pts, true), fill, opts);
    return this;
  }

  puff(c: Point, rx: number, ry: number, bumps: number, depth: number, fill: string, rand?: () => number, opts?: ShapeOpts): this {
    // build in local space then transform every coordinate pair
    const d = puffD(c, rx, ry, bumps, depth, rand);
    this.sk.shape(mapPathD(d, this.xf), fill, opts);
    return this;
  }

  raw(svg: string): this {
    this.sk.raw(svg);
    return this;
  }

  layer(): this {
    this.sk.layer();
    return this;
  }
}

/** Map every "x y" pair of an M/L/C/Z path through a transform. */
export function mapPathD(d: string, f: Xf): string {
  return d.replace(/(-?\d*\.?\d+) (-?\d*\.?\d+)/g, (_m, xs: string, ys: string) => {
    const p = f({ x: Number(xs), y: Number(ys) });
    return `${fmt(p.x)} ${fmt(p.y)}`;
  });
}

function fmt(v: number): string {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
}

/**
 * Pose transform for a rigid personified body standing on y=0: rotate by
 * `rot` around `pivot`, squash, then lift. Returns the transform and a
 * ground fix that shifts the whole thing so its hull rests on the ground.
 */
export function bodyXf(o: {
  rot: number;
  pivot: Point;
  lift: number;
  sx?: number;
  sy?: number;
  hull: readonly Point[];
  rest?: boolean;
}): { xf: Xf; rot: number } {
  const inner = affine({ x: 0, y: 0, rot: o.rot, sx: o.sx ?? 1, sy: o.sy ?? 1 });
  const centred: Xf = (p) => {
    const q = inner({ x: p.x - o.pivot.x, y: p.y - o.pivot.y });
    return { x: q.x + o.pivot.x, y: q.y + o.pivot.y };
  };
  let dy = -o.lift;
  if (o.rest) {
    const maxY = Math.max(...o.hull.map((p) => centred(p).y));
    dy = -maxY - o.lift;
  }
  const xf = compose(affine({ y: dy }), centred);
  return { xf, rot: o.rot };
}
