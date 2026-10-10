/**
 * Props in figure space: ground at y=0 (props occupy negative y), one unit =
 * 1/100 of an adult's height, canonical facing right, centred on x=0.
 * Each prop is drawn at its nominal size; `grip` is where a hand holds it.
 * Outer silhouette uses `lineWidth`; inner detail is thinner and is dropped
 * when the prop is small relative to the line weight (silhouette first).
 */
import { PROPS, type Point, type PropId, type Tone } from "../contracts.js";
import type { DrawContext, PropDrawing, PropModule, SeatKind } from "../internal.js";
import { INK, PAPER, toneFill } from "../style.js";
import { n, polyPath, smoothPath } from "../svg.js";
import { compactSvg } from "../env/compact.js";

interface Pen {
  lw: number;
  dw: number;
  p: string;
  /** Too small for interior detail. */
  simple: boolean;
  /** Optional tone variant for the prop's main body (ruby vs sapphire). */
  tone?: Tone;
}

/** Flat grey for a tone (props never use pattern tones; see G below). */
const FLAT_OF: Record<Tone, "white" | "light" | "mid" | "dark" | "black"> = {
  white: "white",
  light: "light",
  mid: "mid",
  dark: "dark",
  black: "black",
  dots: "light",
  dense_dots: "mid",
  stripes: "mid",
  check: "mid",
  flowers: "light",
  gold: "light",
  stone: "light",
};

/** Main-body fill: the requested tone variant, or the prop's own default. */
function body(k: Pen, fallback: string): string {
  if (!k.tone) return fallback;
  const f = FLAT_OF[k.tone] ?? "light";
  return f === "white" ? PAPER : toneFill(f, k.p);
}

const bodyOf = body;

/** True when the body is dark enough that ink detail on it must turn paper-white. */
function darkBody(k: Pen): boolean {
  if (!k.tone) return false;
  const f = FLAT_OF[k.tone];
  return f === "dark" || f === "black";
}

interface Spec {
  h: number;
  w: number;
  grip: Point;
  draw: (k: Pen) => string;
  /** The drawing is authored this much larger/smaller than `h`/`w` (scaled on output). */
  scale?: number;
}

/**
 * Props use flat greys only: pattern tones live in the user space of the
 * referencing element, so inside a scaled figure group their dots would grow
 * with the zoom (giant polka dots in insert shots). Flat fills scale cleanly.
 */
const G = (p: string) => ({
  gold: toneFill("light", p),
  dots: toneFill("light", p),
  dense: toneFill("mid", p),
  dark: toneFill("dark", p),
  mid: toneFill("mid", p),
  light: toneFill("light", p),
  stripes: toneFill("mid", p),
  check: toneFill("mid", p),
  stone: toneFill("light", p),
});

function P(d: string, fill: string, w: number, extra = ""): string {
  return `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${n(w)}"${extra}/>`;
}
function L(d: string, w: number, color = INK): string {
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${n(w)}"/>`;
}
function F(d: string, fill: string): string {
  return `<path d="${d}" fill="${fill}"/>`;
}
function C(cx: number, cy: number, r: number, fill: string, w: number): string {
  return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}" stroke="${INK}" stroke-width="${n(w)}"/>`;
}
function E(cx: number, cy: number, rx: number, ry: number, fill: string, w: number): string {
  return `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}" stroke="${INK}" stroke-width="${n(w)}"/>`;
}
const pts = (...xy: number[]): Point[] => {
  const out: Point[] = [];
  for (let i = 0; i + 1 < xy.length; i += 2) out.push({ x: xy[i], y: xy[i + 1] });
  return out;
};
const poly = (...xy: number[]): string => polyPath(pts(...xy));
const smooth = (close: boolean, ...xy: number[]): string => smoothPath(pts(...xy), close);
const M = (x: number, y: number) => `M${n(x)} ${n(y)}`;
const Lto = (x: number, y: number) => `L${n(x)} ${n(y)}`;
const Q = (cx: number, cy: number, x: number, y: number) => `Q${n(cx)} ${n(cy)} ${n(x)} ${n(y)}`;
const A = (r: number, x: number, y: number, sweep = 1, large = 0) => `A${n(r)} ${n(r)} 0 ${large} ${sweep} ${n(x)} ${n(y)}`;

/** 4-point sparkle star. */
function sparkle(x: number, y: number, r: number, w: number): string {
  const q = r * 0.22;
  return P(poly(x, y - r, x + q, y - q, x + r, y, x + q, y + q, x, y + r, x - q, y + q, x - r, y, x - q, y - q), PAPER, w);
}

function flame(x: number, y: number, h: number, w: number): string {
  const r = h * 0.28;
  return P(`${M(x, y - h)}${Q(x + r * 1.6, y - h * 0.45, x + r, y - r * 0.6)}${A(r, x - r, y - r * 0.6)}${Q(x - r * 1.5, y - h * 0.45, x, y - h)}Z`, PAPER, w);
}

const SPECS: Record<PropId, Spec> = {
  sword: {
    h: 56,
    w: 18,
    grip: { x: 0, y: -7.5 },
    draw: (k) => {
      const g = G(k.p);
      let s = P(poly(-1.9, -13.2, 1.9, -13.2, 1.6, -50, 0, -56, -1.6, -50), PAPER, k.lw);
      if (!k.simple) s += L(`${M(0, -15)}${Lto(0, -47)}`, k.dw) + L(`${M(1.05, -20)}${Lto(0.95, -30)}`, k.dw * 0.8);
      s += P(poly(-1.3, -11, 1.3, -11, 1.3, -3.8, -1.3, -3.8), g.dark, k.lw);
      if (!k.simple) s += L(`${M(-1.3, -9)}${Lto(1.3, -10.2)}${M(-1.3, -7)}${Lto(1.3, -8.2)}${M(-1.3, -5)}${Lto(1.3, -6.2)}`, k.dw, PAPER);
      s += P(`${M(-8, -13.2)}${Lto(8, -13.2)}${Q(9.4, -12.1, 8, -11)}${Lto(-8, -11)}${Q(-9.4, -12.1, -8, -13.2)}Z`, g.gold, k.lw);
      // the pommel carries the tone variant: a toned jewel set in the hilt
      s += C(0, -2.2, 2.1, body(k, g.gold), k.lw);
      if (k.tone && !k.simple) s += F(poly(-1.2, -3.2, -0.3, -3.8, -0.1, -3), PAPER);
      if (k.tone) s += C(0, -12.1, 0.9, body(k, g.gold), k.dw);
      return s;
    },
  },
  gem: {
    h: 9,
    w: 11,
    grip: { x: 0, y: -5 },
    draw: (k) => {
      const g = G(k.p);
      const outline = poly(-5.5, -5.5, -3.2, -9, 3.2, -9, 5.5, -5.5, 0, 0);
      const facets = `${M(-5.5, -5.5)}${Lto(5.5, -5.5)}${M(-3.2, -9)}${Lto(-2.4, -5.5)}${Lto(0, -9)}${Lto(2.4, -5.5)}${Lto(3.2, -9)}${M(-2.4, -5.5)}${Lto(0, 0)}${Lto(2.4, -5.5)}`;
      if (!k.tone || FLAT_OF[k.tone] === "white" || FLAT_OF[k.tone] === "light") {
        // a clear diamond: paper body with light and dark facets
        let s = P(outline, body(k, PAPER), k.lw);
        s += F(poly(-5.5, -5.5, -2.4, -5.5, 0, 0), g.light) + F(poly(2.4, -5.5, 5.5, -5.5, 0, 0), g.dark);
        if (!k.simple) s += L(facets, k.dw);
        s += P(outline, "none", k.lw);
        return s + sparkle(4.6, -9.6, 3, k.dw) + sparkle(-5.6, -8.4, 1.8, k.dw);
      }
      // a coloured stone: toned body, a darker pavilion side, paper facet lines and a
      // bright table glint so a ruby (dark) and a sapphire (mid) never read alike.
      // A "black" stone is still a jewel, not coal: a dark body with black facets.
      const dark = darkBody(k);
      let s = P(outline, FLAT_OF[k.tone] === "black" ? g.dark : body(k, PAPER), k.lw);
      s += F(poly(2.4, -5.5, 5.5, -5.5, 0, 0), dark ? INK : g.dark);
      s += F(poly(-3.2, -9, 3.2, -9, 2.4, -5.5, -2.4, -5.5), dark ? g.dark : g.light);
      s += L(facets, k.dw * (k.simple ? 1.1 : 0.8), dark ? PAPER : INK);
      s += F(poly(-4.6, -5.9, -2.9, -8.4, -1.9, -8.4, -3.1, -5.9), PAPER);
      s += F(poly(-3.3, -4.6, -1.4, -4.6, -0.5, -2.2), PAPER);
      s += P(outline, "none", k.lw);
      return s + sparkle(4.6, -9.6, 3, k.dw) + sparkle(-5.6, -8.4, 1.8, k.dw);
    },
  },
  coin: {
    h: 7,
    w: 7,
    grip: { x: 0, y: -3.5 },
    draw: (k) => {
      const g = G(k.p);
      const ink = darkBody(k) ? PAPER : INK;
      let s = C(0, -3.5, 3.5, body(k, g.gold), k.lw);
      if (!k.simple) {
        s += `<circle cx="0" cy="-3.5" r="2.6" fill="none" stroke="${ink}" stroke-width="${n(k.dw)}"/>`;
        // a simple five-point star emblem
        const star: number[] = [];
        for (let i = 0; i < 10; i += 1) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const r = i % 2 === 0 ? 1.5 : 0.65;
          star.push(Math.cos(a) * r, -3.5 + Math.sin(a) * r);
        }
        s += P(poly(...star), ink, k.dw * 0.3).replace(`stroke="${INK}"`, `stroke="${ink}"`);
        s += L(`${M(-2.4, -5.2)}${Q(-2.9, -3.5, -2.3, -2.2)}`, k.dw, PAPER);
      }
      return s;
    },
  },
  coins_pile: {
    h: 14,
    w: 26,
    grip: { x: 0, y: -7 },
    draw: (k) => {
      const g = { ...G(k.p), gold: body(k, G(k.p).gold) };
      const stack = (x: number, count: number, y0: number): string => {
        const rx = 4;
        const ry = 1.3;
        const t = 1.25;
        const top = y0 - count * t;
        let s = P(`${M(x - rx, top)}${Lto(x - rx, y0)}A${n(rx)} ${n(ry)} 0 0 0 ${n(x + rx)} ${n(y0)}${Lto(x + rx, top)}Z`, g.gold, k.lw);
        if (!k.simple) {
          let lines = "";
          for (let i = 1; i < count; i += 1) lines += `${M(x - rx, y0 - i * t)}A${n(rx)} ${n(ry)} 0 0 0 ${n(x + rx)} ${n(y0 - i * t)}`;
          s += L(lines, k.dw * 0.8);
        }
        s += E(x, top, rx, ry, g.gold, k.lw);
        return s;
      };
      let s = stack(-6.5, 6, -1.3) + stack(6.5, 4, -1.3) + stack(0.5, 9, 0);
      s += E(-10.5, -0.9, 3.4, 1.1, g.gold, k.lw) + E(10.8, -1, 3.2, 1.05, g.gold, k.lw);
      s += sparkle(3.5, -13.2, 2.2, k.dw);
      return s;
    },
  },
  money_bag: {
    h: 24,
    w: 20,
    grip: { x: 0, y: -18 },
    draw: (k) => {
      const g = G(k.p);
      const body = smooth(true, -2.4, -17, 2.4, -17, 5.5, -14.5, 9, -8, 7.5, -1.5, 0, 0, -7.5, -1.5, -9, -8, -5.5, -14.5);
      let s = P(body, bodyOf(k, PAPER), k.lw);
      if (!k.simple) {
        s += F(smooth(true, 4.5, -13.5, 8.6, -8, 7, -1.8, 2.5, -0.6, 6.4, -6.5), g.dots);
        s += L(`${M(-1.5, -16)}${Q(-4, -10, -3.2, -4)}${M(1.2, -16)}${Q(2.2, -11, 1, -6)}`, k.dw);
        s += P(body, "none", k.lw);
      }
      // gathered top above the tie
      s += P(`${M(-2.4, -17)}${Q(-5.5, -19.5, -4.5, -21.8)}${Q(-3, -20.4, -2, -21.2)}${Q(-1, -23.6, 0, -23.8)}${Q(1, -23.6, 2, -21.2)}${Q(3, -20.4, 4.5, -21.8)}${Q(5.5, -19.5, 2.4, -17)}Z`, PAPER, k.lw);
      // cord tie with a plain knot and dangling ends
      s += P(`${M(-3, -17.6)}${Q(0, -16.2, 3, -17.6)}${Lto(3, -16.3)}${Q(0, -15, -3, -16.3)}Z`, g.dark, k.dw);
      s += C(2.6, -16.9, 1, g.dark, k.dw) + L(`${M(3, -16.4)}${Q(4.6, -14.5, 3.8, -12.5)}${M(3.3, -16.2)}${Q(5.8, -15, 5.6, -13.2)}`, k.dw);
      return s;
    },
  },
  rose: {
    // a cut rose: thorny stem, two toothed leaves, sepals and a cupped bloom
    // of overlapping petals around a spiral centre. The tone is the bloom's
    // colour (default dark = a red rose; "white"/"light" for white/yellow).
    h: 24,
    w: 12,
    grip: { x: 0.2, y: -7 },
    draw: (k) => {
      const g = G(k.p);
      const bloom = body(k, g.dark);
      const edge = darkBody(k) || !k.tone ? PAPER : INK;
      const cup = !k.tone || darkBody(k) ? INK : FLAT_OF[k.tone] === "mid" ? g.dark : g.mid;
      let s = L(`${M(0, 0)}${Q(-0.9, -8, 0.3, -15.4)}`, k.lw * 1.1);
      // thorns
      s += F(poly(-0.35, -3.2, -1.7, -3.9, -0.3, -4.4), INK) + F(poly(0.05, -8.8, 1.5, -9.6, 0.05, -10.2), INK) + F(poly(-0.2, -12.6, -1.4, -13.2, -0.1, -13.7), INK);
      // leaves on short stalks, with a vein and toothed edges
      const leaf = (x: number, y: number, dir: number): string => {
        const tx = x + dir * 5.2;
        const ty = y - 2.4;
        const d = `${M(x, y)}${Q(x + dir * 1.6, y - 3.3, tx, ty)}${Q(x + dir * 3.2, y + 0.4, x, y)}Z`;
        let out = P(d, g.mid, k.dw);
        if (!k.simple) out += L(`${M(x, y)}${Lto(tx - dir * 0.6, ty + 0.3)}`, k.dw * 0.7) + L(`${M(x + dir * 2, y - 1.8)}l${n(dir * 0.5)} -0.6${M(x + dir * 3.6, y - 2.2)}l${n(dir * 0.5)} -0.5`, k.dw * 0.6);
        return out;
      };
      s += L(`${M(-0.4, -5.6)}${Lto(-1.4, -6.2)}${M(0.1, -10.6)}${Lto(1.2, -11.3)}`, k.dw);
      s += leaf(-1.4, -6.2, -1) + leaf(1.2, -11.3, 1);
      // sepals
      s += P(poly(0.3, -15.2, -3.2, -15.8, -1.2, -16.6, 0.3, -17.6, 1.8, -16.6, 3.8, -15.9), g.dark, k.dw);
      // bloom: the cup silhouette with scalloped petal tips
      const cupD = `${M(-1.8, -15.9)}${Q(-5.2, -17.4, -5.1, -20.6)}${Q(-4.6, -23.2, -2.6, -23.4)}${Q(-1.4, -24.4, 0.2, -23.4)}${Q(1.8, -24.6, 3.2, -23.3)}${Q(5.4, -22.8, 5.3, -20.4)}${Q(5.1, -17.3, 2.2, -15.9)}Z`;
      s += P(cupD, bloom, k.lw);
      // inner cup opening (the dark heart of the rose) and the spiral
      s += P(`${M(-3.4, -21.4)}${Q(-1, -23.4, 1.2, -22.6)}${Q(3.6, -23.2, 3.7, -21.2)}${Q(0.2, -20.2, -3.4, -21.4)}Z`, cup, k.dw * 0.8);
      if (!k.simple) s += L(`${M(-1.4, -21.6)}${Q(0.2, -23, 1.6, -21.8)}${Q(0.8, -21, -0.1, -21.8)}`, k.dw * 0.8, edge);
      // front petal wrapping the cup, and a side petal edge
      s += P(`${M(-4.9, -19.6)}${Q(-0.2, -21.4, 5, -19.8)}${Q(4.4, -16.4, 0.2, -15.9)}${Q(-4.4, -16.4, -4.9, -19.6)}Z`, bloom, k.dw);
      if (!k.simple) s += L(`${M(-3.8, -18.6)}${Q(-1.8, -17.2, 0.4, -17.4)}${M(1.6, -20.6)}${Q(3.4, -19.4, 3.6, -17.6)}`, k.dw * 0.7, edge);
      s += P(cupD, "none", k.lw);
      return s;
    },
  },
  flower: {
    h: 21,
    w: 12,
    grip: { x: 0, y: -8 },
    draw: (k) => {
      const g = G(k.p);
      let s = L(`${M(0, 0)}${Q(1, -8, 0, -16)}`, k.lw);
      s += P(`${M(0.3, -5)}${Q(4, -8, 5, -5)}${Q(2.5, -3.5, 0.3, -5)}Z`, g.dots, k.dw);
      s += P(`${M(0.1, -9)}${Q(-4, -12, -4.8, -8.6)}${Q(-2.4, -7.4, 0.1, -9)}Z`, g.dots, k.dw);
      // the tone is the bloom's colour (white / yellow = light / red = dark)
      const petal = body(k, PAPER);
      let petals = "";
      for (let i = 0; i < 8; i += 1) {
        const deg = (i / 8) * 360;
        petals += `<ellipse cx="0" cy="-3" rx="1.25" ry="2.6" transform="translate(0 -17) rotate(${n(deg)})" fill="${petal}" stroke="${INK}" stroke-width="${n(k.dw * 1.2)}"/>`;
      }
      s += petals;
      s += C(0, -17, 1.6, darkBody(k) ? g.light : g.dense, k.dw);
      return s;
    },
  },
  book: {
    h: 16,
    w: 14,
    grip: { x: 0, y: -8 },
    draw: (k) => {
      const g = G(k.p);
      // pages block seen at the top edge, cover in front, spine on the left
      let s = P(poly(-4.5, -14.6, 6, -14.6, 7.2, -16, -3.3, -16), PAPER, k.lw);
      s += P(poly(6, -14.6, 7.2, -16, 7.2, -1.4, 6, 0), PAPER, k.lw);
      if (!k.simple) s += L(`${M(6.4, -14)}${Lto(6.4, -0.6)}${M(6.8, -14.6)}${Lto(6.8, -1)}`, k.dw * 0.6);
      g.dark = bodyOf(k, g.dark);
      s += P(poly(-4.5, 0, 6, 0, 6, -14.6, -4.5, -14.6), g.dark, k.lw);
      s += P(`${M(-4.5, 0)}${Lto(-6.6, -0.6)}${Lto(-6.6, -15.2)}${Lto(-4.5, -14.6)}Z`, g.dark, k.lw);
      if (!k.simple) {
        s += P(poly(-3, -1.5, 4.6, -1.5, 4.6, -13.1, -3, -13.1), "none", k.dw * 0.8).replace(`stroke="${INK}"`, `stroke="${PAPER}"`);
        s += P(poly(0.8, -9.8, 2.3, -7.3, 0.8, -4.8, -0.7, -7.3), PAPER, k.dw * 0.5);
        s += L(`${M(-6.6, -3)}${Lto(-4.5, -2.6)}${M(-6.6, -12.4)}${Lto(-4.5, -12)}`, k.dw, PAPER);
      }
      return s;
    },
  },
  letter: {
    h: 10,
    w: 15,
    grip: { x: -4, y: -5 },
    draw: (k) => {
      const g = G(k.p);
      let s = P(poly(-7, 0, 7, 0, 7, -10, -7, -10), PAPER, k.lw);
      if (!k.simple) s += L(`${M(-7, 0)}${Lto(-1.2, -5)}${M(7, 0)}${Lto(1.2, -5)}`, k.dw);
      s += P(poly(-7, -10, 7, -10, 0, -4.2), PAPER, k.dw * 1.2);
      s += C(0, -4.4, 1.6, g.dark, k.dw);
      return s;
    },
  },
  paper: {
    h: 16,
    w: 13,
    grip: { x: -4.5, y: -8 },
    draw: (k) => {
      const g = G(k.p);
      let s = P(`${M(-6, 0)}${Lto(3.5, 0)}${Q(6.5, -0.5, 6, -3)}${Lto(6, -16)}${Lto(-6, -16)}Z`, PAPER, k.lw);
      s += P(`${M(3.5, 0)}${Q(3, -2.6, 6, -3)}${Q(4, -3.8, 3.5, 0)}Z`, g.light, k.dw);
      if (!k.simple) {
        let lines = "";
        for (let i = 0; i < 6; i += 1) {
          const y = -13.5 + i * 2;
          const len = i === 5 ? 5 : 9 - (i % 2) * 1.5;
          lines += `${M(-4.2, y)}q${n(len / 4)} -0.35 ${n(len / 2)} 0t${n(len / 2)} 0`;
        }
        s += L(lines, k.dw * 0.8);
      }
      return s;
    },
  },
  scroll: {
    h: 21,
    w: 17,
    grip: { x: 0, y: -19 },
    draw: (k) => {
      const g = G(k.p);
      let s = P(poly(-6, -17.5, 6, -17.5, 6, -3, -6, -3), PAPER, k.lw);
      if (!k.simple) {
        s += F(poly(3.8, -17.5, 6, -17.5, 6, -3, 3.8, -3), g.dots);
        let lines = "";
        for (let i = 0; i < 5; i += 1) lines += `${M(-4, -14.5 + i * 2.4)}q1.7 -0.4 3.4 0t3.4 0`;
        s += L(lines, k.dw * 0.8);
        s += P(poly(-6, -17.5, 6, -17.5, 6, -3, -6, -3), "none", k.lw);
      }
      const roll = (y: number): string =>
        P(`${M(-7, y - 1.6)}${Lto(7, y - 1.6)}${A(1.6, 7, y + 1.6)}${Lto(-7, y + 1.6)}${A(1.6, -7, y - 1.6)}Z`, PAPER, k.lw) + C(-8.2, y, 1.1, g.dark, k.dw) + C(8.2, y, 1.1, g.dark, k.dw);
      s += roll(-18.8) + roll(-1.7);
      return s;
    },
  },
  lamp: {
    // a hand lantern (~40 cm): drawn at 27 units and scaled to 22 on the page
    h: 22,
    w: 10,
    grip: { x: 0, y: -21 },
    scale: 22 / 27,
    draw: (k) => {
      const g = G(k.p);
      let s = `<circle cx="0" cy="-11" r="9" fill="${PAPER}" fill-opacity="0.55"/>`;
      s += P(poly(-5, 0, 5, 0, 4, -2.6, -4, -2.6), g.dark, k.lw);
      s += P(smooth(true, -3.4, -2.8, 3.4, -2.8, 4.6, -9, 3.3, -15.6, -3.3, -15.6, -4.6, -9), PAPER, k.lw);
      s += flame(0, -5, 7, k.dw);
      if (!k.simple) s += L(`${M(-3.8, -3.4)}${Q(-5.6, -9, -3.6, -15)}${M(3.8, -3.4)}${Q(5.6, -9, 3.6, -15)}${M(0, -2.8)}${Lto(0, -4.6)}${M(-4.3, -9)}${Lto(4.3, -9)}`, k.dw);
      s += P(poly(-4.2, -15.6, 4.2, -15.6, 2.2, -19, -2.2, -19), g.dark, k.lw);
      s += L(`${M(-3, -18.6)}${Q(-3.5, -26, 0, -26)}${Q(3.5, -26, 3, -18.6)}`, k.lw);
      return s;
    },
  },
  candle: {
    h: 18,
    w: 13,
    grip: { x: 5.5, y: -1.5 },
    draw: (k) => {
      const g = G(k.p);
      let s = `<circle cx="0" cy="-15.5" r="4.5" fill="${PAPER}" fill-opacity="0.6"/>`;
      s += `<circle cx="6" cy="-1.6" r="1.5" fill="none" stroke="${INK}" stroke-width="${n(k.lw)}"/>`;
      s += P(`${M(-5.5, -1.6)}${Q(0, -3.2, 5.5, -1.6)}${Q(0, 0.6, -5.5, -1.6)}Z`, g.gold, k.lw);
      s += P(`${M(-1.7, -2.2)}${Lto(-1.7, -12)}${Q(0, -12.8, 1.7, -12)}${Lto(1.7, -2.2)}Z`, PAPER, k.lw);
      if (!k.simple) s += L(`${M(1.7, -11.6)}${Q(2.3, -10, 1.8, -8.6)}${M(-1.7, -11.4)}${Q(-2, -10.6, -1.7, -10)}`, k.dw);
      s += L(`${M(0, -12.3)}${Lto(0.2, -13.3)}`, k.dw);
      s += flame(0.2, -13.2, 4.8, k.dw);
      return s;
    },
  },
  matches: {
    h: 11,
    w: 11,
    grip: { x: 2.2, y: -5 },
    draw: (k) => {
      const g = G(k.p);
      let s = P(poly(-5.5, 0, 2.5, 0, 2.5, -3.6, -5.5, -3.6), PAPER, k.lw);
      s += P(poly(-5.5, -3.6, 2.5, -3.6, 3.8, -4.6, -4.2, -4.6), PAPER, k.lw);
      s += P(poly(2.5, 0, 3.8, -1, 3.8, -4.6, 2.5, -3.6), g.dark, k.lw);
      if (!k.simple) s += P(poly(-3.6, -0.9, 0.6, -0.9, 0.6, -2.7, -3.6, -2.7), "none", k.dw);
      s += L(`${M(0.8, -4.2)}${Lto(4.2, -8.4)}`, k.lw * 0.9);
      s += C(4.35, -8.65, 0.75, g.dark, k.dw);
      s += flame(4.8, -9.2, 3.2, k.dw);
      return s;
    },
  },
  needle: {
    h: 14,
    w: 9,
    grip: { x: 0, y: -6 },
    draw: (k) => {
      let s = P(`${M(0, 0)}${Lto(0.55, -10.5)}${Q(0.6, -12.6, 0, -12.8)}${Q(-0.6, -12.6, -0.55, -10.5)}Z`, PAPER, k.lw * 0.8);
      s += `<ellipse cx="0" cy="-11.4" rx="0.22" ry="0.8" fill="${INK}"/>`;
      s += L(`${M(0, -11.6)}${Q(2.5, -14.5, 3.8, -10)}${Q(4.8, -5, 2, -4)}${Q(-0.5, -3, 1.5, -1.2)}${Q(4, 0.5, 4.4, -2)}`, k.dw);
      return s;
    },
  },
  bread: {
    h: 10,
    w: 21,
    grip: { x: 0, y: -5 },
    draw: (k) => {
      const g = G(k.p);
      const loaf = `${M(-10, 0)}${Lto(10, 0)}${Q(11.5, -1, 10.2, -4)}${Q(7, -10.5, 0, -10.2)}${Q(-7, -10.5, -10.2, -4)}${Q(-11.5, -1, -10, 0)}Z`;
      let s = P(loaf, PAPER, k.lw);
      if (!k.simple) {
        s += F(`${M(-9.6, -1)}${Lto(9.6, -1)}${Q(10.5, -2, 10, -3.6)}${Q(0, -1.2, -10, -3.6)}${Q(-10.5, -2, -9.6, -1)}Z`, g.dots);
        let cuts = "";
        for (const x of [-5.5, -0.5, 4.5]) cuts += `${M(x - 1.6, -5.4)}${Q(x, -9.8, x + 1.8, -8.6)}${Q(x + 0.2, -7, x - 1.6, -5.4)}Z`;
        s += P(cuts, g.light, k.dw);
        s += P(loaf, "none", k.lw);
      }
      return s;
    },
  },
  cup: {
    h: 10,
    w: 14,
    grip: { x: 6.5, y: -5 },
    draw: (k) => {
      const g = G(k.p);
      let s = P(`${M(4.6, -7.5)}${Q(9, -8, 8.6, -4.5)}${Q(8.2, -1.8, 4.3, -2.2)}`, "none", k.lw * 1.3);
      s += P(`${M(-5, -9)}${Lto(-4.3, -0.8)}${Q(0, 0.4, 4.3, -0.8)}${Lto(5, -9)}Z`, bodyOf(k, PAPER), k.lw);
      if (!k.simple) s += F(`${M(2.6, -8.6)}${Lto(4.9, -8.8)}${Lto(4.3, -1.2)}${Q(3.4, -0.9, 2.4, -0.7)}Z`, g.dots);
      s += E(0, -9, 5, 1.3, PAPER, k.lw);
      s += `<ellipse cx="0" cy="-8.8" rx="3.9" ry="0.85" fill="${g.dark}"/>`;
      if (!k.simple) s += L(`${M(-1.4, -10.8)}q-0.8 -1.1 0 -2.2t0 -2.2${M(1.4, -11.2)}q-0.8 -1.1 0 -2.2`, k.dw * 0.8);
      return s;
    },
  },
  bottle: {
    h: 22,
    w: 8,
    grip: { x: 0, y: -17 },
    draw: (k) => {
      const g = G(k.p);
      const body = `${M(-3.6, -1.2)}${Q(-3.6, 0, -2.4, 0)}${Lto(2.4, 0)}${Q(3.6, 0, 3.6, -1.2)}${Lto(3.6, -12)}${Q(3.6, -14.6, 1.25, -16)}${Lto(1.25, -20.2)}${Lto(-1.25, -20.2)}${Lto(-1.25, -16)}${Q(-3.6, -14.6, -3.6, -12)}Z`;
      let s = P(body, bodyOf(k, g.dark), k.lw);
      s += P(poly(-1.5, -20.2, 1.5, -20.2, 1.5, -19.2, -1.5, -19.2), g.dark, k.dw);
      s += P(poly(-1.05, -20.2, 1.05, -20.2, 0.9, -22, -0.9, -22), g.dots, k.dw);
      s += P(poly(-3.6, -9.5, 3.6, -9.5, 3.6, -4, -3.6, -4), PAPER, k.dw);
      if (!k.simple) s += L(`${M(-2.3, -2)}${Lto(-2.3, -3.2)}${M(-2.4, -10.6)}${Q(-2.4, -13.5, -0.6, -15)}`, k.dw * 1.2, PAPER);
      return s;
    },
  },
  basket: {
    h: 21,
    w: 24,
    grip: { x: 0, y: -20.3 },
    draw: (k) => {
      const g = G(k.p);
      let s = L(`${M(-9.5, -10)}${Q(-9.5, -21.8, 0, -21.3)}${Q(9.5, -21.8, 9.5, -10)}`, k.lw * 1.6);
      s += L(`${M(-9.5, -10)}${Q(-9.5, -21.8, 0, -21.3)}${Q(9.5, -21.8, 9.5, -10)}`, k.lw * 0.5, PAPER);
      // produce heaped in it (fruit and a cloth corner)
      s += P(`${M(-7, -10.5)}${Q(-4, -14.5, 0, -12)}${Q(4, -15, 7.5, -10.5)}Z`, g.check, k.dw);
      s += C(-4.6, -12.4, 2.6, g.mid, k.dw) + C(0.4, -13.6, 2.8, g.light, k.dw) + C(5.2, -12.2, 2.4, g.dark, k.dw);
      if (!k.simple) s += L(`${M(0.6, -16.4)}${Q(1.2, -17.8, 2.4, -18)}`, k.dw) + F(poly(1.6, -17.1, 3.4, -18.4, 3, -16.6), g.mid);
      const body = `${M(-11, -10)}${Lto(11, -10)}${Q(10, -2, 8, 0)}${Lto(-8, 0)}${Q(-10, -2, -11, -10)}Z`;
      s += P(body, PAPER, k.lw);
      if (!k.simple) {
        let weave = "";
        for (let i = 1; i < 4; i += 1) {
          const y = -10 + i * 2.5;
          const hw = 11 - i * 0.75;
          weave += `${M(-hw, y)}${Q(0, y + 1.2, hw, y)}`;
        }
        for (let i = -4; i <= 4; i += 1) weave += `${M(i * 2.4, -9.6)}${Lto(i * 1.9, -0.3)}`;
        s += L(weave, k.dw * 0.8);
        s += F(`${M(6, -9.6)}${Lto(11, -10)}${Q(10, -2, 8, 0)}${Lto(5.2, 0)}Z`, g.dots);
      }
      s += P(`${M(-11.4, -10.8)}${Lto(11.4, -10.8)}${Lto(11.4, -9.2)}${Lto(-11.4, -9.2)}Z`, PAPER, k.lw);
      return s;
    },
  },
  bag: {
    // a sack (flour, grain, a bundle): a bulging cloth body gathered and tied
    // at the neck. Held at the neck; a figure posed "carry" hugs it against
    // the chest (the grip sits at the sack's upper body).
    h: 32,
    w: 24,
    grip: { x: 0, y: -22 },
    draw: (k) => {
      const g = G(k.p);
      const fill = bodyOf(k, PAPER);
      const ink = darkBody(k) ? PAPER : INK;
      const sack = `${M(-3.2, -26)}${Q(-9.8, -24.5, -11, -15)}${Q(-12.4, -3.5, -8.5, -0.6)}${Q(0, 1, 8.5, -0.6)}${Q(12.4, -3.5, 11, -15)}${Q(9.8, -24.5, 3.2, -26)}Z`;
      let s = P(sack, fill, k.lw);
      if (!k.simple) {
        s += F(`${M(6.5, -24)}${Q(10.4, -21, 10.9, -14.5)}${Q(11.8, -4, 8.2, -1)}${Q(6.2, -0.2, 4.6, -0.4)}${Q(9.4, -8, 6.5, -24)}Z`, g.light);
        // cloth folds from the neck and a stitched patch
        s += L(`${M(-2.4, -25.2)}${Q(-6, -19, -5.6, -12)}${M(1.8, -25.2)}${Q(3.6, -18, 2.6, -13)}${M(-7.4, -4)}${Q(-4, -2.4, -1, -3.4)}`, k.dw * 0.8, ink);
        s += P(poly(-6.4, -11.5, -1.8, -12, -1.4, -7.4, -6, -7), "none", k.dw * 0.7).replace(`stroke="${INK}"`, `stroke="${ink}" stroke-dasharray="0.8 0.6"`);
        s += P(sack, "none", k.lw);
      }
      // gathered neck and tie
      s += P(`${M(-3.2, -26)}${Q(-5.6, -28.6, -4.2, -31.4)}${Q(-2.4, -29.6, -1.2, -31.8)}${Q(0, -29.8, 1.2, -31.8)}${Q(2.4, -29.6, 4.2, -31.4)}${Q(5.6, -28.6, 3.2, -26)}Z`, fill, k.lw);
      s += P(`${M(-3.8, -26.6)}${Q(0, -25, 3.8, -26.6)}${Lto(3.6, -25.1)}${Q(0, -23.6, -3.6, -25.1)}Z`, g.dark, k.dw);
      return s;
    },
  },
  key: {
    h: 14,
    w: 7,
    grip: { x: 0, y: -11 },
    draw: (k) => {
      const g = G(k.p);
      g.gold = bodyOf(k, g.gold);
      let s = P(`${M(-3.1, -11)}${A(3.1, 3.1, -11)}${A(3.1, -3.1, -11)}Z${M(-1.5, -11)}${A(1.5, 1.5, -11, 0)}${A(1.5, -1.5, -11, 0)}Z`, g.gold, k.lw, ` fill-rule="evenodd"`);
      s += P(poly(-0.75, -7.9, 0.75, -7.9, 0.75, 0, -0.75, 0), g.gold, k.lw);
      s += P(poly(0.75, -3.3, 3.4, -3.3, 3.4, -2.3, 2.3, -2.3, 2.3, -1.3, 3.4, -1.3, 3.4, 0, 0.75, 0), g.gold, k.lw);
      s += P(poly(-1.3, -8.4, 1.3, -8.4, 1.3, -7.5, -1.3, -7.5), g.gold, k.dw);
      return s;
    },
  },
  chains: {
    h: 42,
    w: 12,
    grip: { x: 0, y: -39.5 },
    draw: (k) => {
      const g = G(k.p);
      const w = Math.max(k.lw * 1.5, 1.2);
      let s = `<circle cx="0" cy="-39.4" r="2.5" fill="none" stroke="${INK}" stroke-width="${n(w * 1.2)}"/>`;
      let edge = "";
      let face = "";
      let y = -36.6;
      for (let i = 0; i < 7; i += 1) {
        // alternate face-on rings and edge-on bars
        if (i % 2 === 0) face += `${M(-2.4, y - 1.4)}${A(2.4, 2.4, y - 1.4)}${Lto(2.4, y + 1.4)}${A(2.4, -2.4, y + 1.4)}Z`;
        else edge += poly(-0.9, y - 3.4, 0.9, y - 3.4, 0.9, y + 3.4, -0.9, y + 3.4);
        y += 4.4;
      }
      s += `<path d="${face}" fill="none" stroke="${INK}" stroke-width="${n(w * 1.3)}"/>`;
      if (!k.simple) s += `<path d="${face}" fill="none" stroke="${PAPER}" stroke-width="${n(w * 0.35)}"/>`;
      s += P(edge, g.dark, k.dw);
      // shackle (open cuff) at the bottom
      s += P(`${M(-3.6, -4.4)}${A(3.6, 3.6, -4.4, 0, 1)}${Lto(2.4, -4.4)}${A(2.4, -2.4, -4.4, 1, 1)}Z`, g.dark, k.lw);
      s += C(0, -7.6, 0.9, g.gold, k.dw);
      return s;
    },
  },
  crown: {
    h: 12,
    w: 17,
    grip: { x: 0, y: -4 },
    draw: (k) => {
      const g = { ...G(k.p), gold: body(k, G(k.p).gold) };
      let s = P(poly(-8, -4, -8.6, -10, -5, -6.8, -2.6, -11.2, 0, -7.2, 2.6, -11.2, 5, -6.8, 8.6, -10, 8, -4), g.gold, k.lw);
      for (const [x, y] of [
        [-8.6, -10.6],
        [-2.6, -11.8],
        [2.6, -11.8],
        [8.6, -10.6],
      ]) s += C(x, y, 0.9, g.gold, k.dw);
      s += P(poly(-8.2, 0, 8.2, 0, 8.2, -4.2, -8.2, -4.2), g.gold, k.lw);
      if (!k.simple) {
        s += C(0, -2.1, 1.1, g.dark, k.dw) + P(poly(-4.5, -3.2, -3.4, -2.1, -4.5, -1, -5.6, -2.1), PAPER, k.dw) + P(poly(4.5, -3.2, 5.6, -2.1, 4.5, -1, 3.4, -2.1), PAPER, k.dw);
        s += L(`${M(-8.2, -3.3)}${Lto(8.2, -3.3)}${M(-8.2, -0.9)}${Lto(8.2, -0.9)}`, k.dw * 0.6, darkBody(k) ? PAPER : INK);
      }
      return s;
    },
  },
  staff: {
    h: 106,
    w: 10,
    grip: { x: 0, y: -62 },
    draw: (k) => {
      const g = G(k.p);
      const shaft = `${M(-1.4, 0)}${Q(-2.3, -45, -1.7, -94)}${Lto(1.7, -94)}${Q(2, -45, 1.5, 0)}Z`;
      let s = P(shaft, g.light, k.lw);
      if (!k.simple) {
        s += L(`${M(0.2, -8)}${Q(0.6, -20, 0, -30)}${M(-0.3, -48)}${Q(0.3, -60, -0.2, -72)}`, k.dw * 0.7);
        s += E(-0.2, -38, 1.5, 0.8, "none", k.dw) + E(0.1, -80, 1.4, 0.7, "none", k.dw);
      }
      // gnarled crook at the top
      s += P(`${M(-1.7, -94)}${Q(-5, -103, 1.5, -106)}${Q(8.4, -106.5, 7.2, -98.6)}${Q(6, -94.6, 2.4, -96.6)}${Q(4.2, -99, 3.9, -101.4)}${Q(2.6, -103.6, 0.4, -101.6)}${Q(-1.2, -99, 1.7, -94)}Z`, g.light, k.lw);
      s += P(poly(-2.2, -93.2, 2.2, -93.2, 2.2, -91.4, -2.2, -91.4), g.dark, k.dw);
      return s;
    },
  },
  umbrella: {
    h: 62,
    w: 66,
    grip: { x: 0, y: -9 },
    draw: (k) => {
      const g = G(k.p);
      const ribs = [-31, -18.6, -6.2, 6.2, 18.6, 31];
      let s = L(`${M(0, -57)}${Lto(0, -6)}${Q(0, -1, 3.2, -1)}${Q(6.2, -1, 6.2, -4)}`, k.lw * 1.3);
      // panels: alternating paper and tone
      for (let i = 0; i < ribs.length - 1; i += 1) {
        const a = ribs[i];
        const b = ribs[i + 1];
        const topA = a * 0.28;
        const topB = b * 0.28;
        const d = `${M(0, -58)}${Q(topA - 4, -54 + Math.abs(a) * 0.1, a, -36)}${Q((a + b) / 2, -40.5, b, -36)}${Q(topB + 4, -54 + Math.abs(b) * 0.1, 0, -58)}Z`;
        s += P(d, i % 2 === 0 ? PAPER : g.dots, k.lw);
      }
      s += L(`${M(0, -58)}${Lto(0, -61.5)}`, k.lw * 1.2) + C(0, -62, 0.9, INK, k.dw);
      return s;
    },
  },
  spade: {
    h: 72,
    w: 12,
    grip: { x: 0, y: -52 },
    draw: (k) => {
      const g = G(k.p);
      let s = P(`${M(-4, -72)}${Lto(4, -72)}${Q(4.6, -66, 1.2, -64.5)}${Lto(-1.2, -64.5)}${Q(-4.6, -66, -4, -72)}Z${M(-2.3, -70.5)}${Lto(2.3, -70.5)}${Q(2.6, -67, 0.8, -66.2)}${Lto(-0.8, -66.2)}${Q(-2.6, -67, -2.3, -70.5)}Z`, g.light, k.lw, ` fill-rule="evenodd"`);
      s += P(poly(-1, -64.5, 1, -64.5, 1, -19, -1, -19), g.light, k.lw);
      s += P(poly(-1.6, -19.5, 1.6, -19.5, 2, -15.8, -2, -15.8), g.dark, k.lw);
      const blade = `${M(-5.6, -15.8)}${Lto(5.6, -15.8)}${Lto(5.6, -5.5)}${Q(4.6, -1.6, 0, 0)}${Q(-4.6, -1.6, -5.6, -5.5)}Z`;
      s += P(blade, PAPER, k.lw);
      if (!k.simple) {
        s += F(`${M(2.2, -15.8)}${Lto(5.6, -15.8)}${Lto(5.6, -5.5)}${Q(4.6, -1.6, 0.8, -0.2)}Z`, g.dots);
        s += P(blade, "none", k.lw);
        s += L(`${M(-5.6, -14.4)}${Lto(5.6, -14.4)}`, k.dw);
      }
      return s;
    },
  },
  wheelbarrow: {
    // a real-size barrow (~1.4 m long) being pushed: the handles are lifted to
    // an adult's hand height (the grip), the wheel on the ground in front
    h: 44,
    w: 84,
    grip: { x: -40, y: -42 },
    draw: (k) => {
      const g = G(k.p);
      let s = "";
      // handles + frame down to the wheel axle
      s += L(`${M(-42, -42.5)}${Lto(-22, -33)}${Lto(31, -9)}`, k.lw * 1.6);
      s += P(poly(-44.5, -44, -38.5, -41.4, -39.4, -39.6, -45.2, -42.2), g.dark, k.dw);
      // back leg (lifted off the ground while pushed)
      s += L(`${M(-15, -30)}${Lto(-17.5, -14)}${Lto(-21, -13.4)}`, k.lw * 1.4);
      // tray
      const tray = `${M(-26, -40)}${Lto(30, -35.5)}${Lto(20, -16)}${Lto(-13, -19)}Z`;
      s += P(tray, bodyOf(k, PAPER), k.lw);
      if (!k.simple) {
        s += F(`${M(20, -16)}${Lto(30, -35.5)}${Lto(24, -35)}${Lto(15, -16.4)}Z`, g.dots);
        s += P(tray, "none", k.lw);
        s += L(`${M(-24.5, -37.8)}${Lto(28, -33.6)}${M(-10, -31)}${Lto(14, -29)}`, k.dw);
      }
      // wheel on the ground
      s += C(31, -9, 9, PAPER, k.lw * 1.3);
      s += `<circle cx="31" cy="-9" r="7" fill="none" stroke="${INK}" stroke-width="${n(k.dw)}"/>`;
      if (!k.simple) {
        let spokes = "";
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI;
          spokes += `${M(31 + Math.cos(a) * 7, -9 + Math.sin(a) * 7)}${Lto(31 - Math.cos(a) * 7, -9 - Math.sin(a) * 7)}`;
        }
        s += L(spokes, k.dw * 0.8);
      }
      s += C(31, -9, 1.6, g.dark, k.dw);
      return s;
    },
  },
  ballot_box: {
    h: 26,
    w: 27,
    grip: { x: 0, y: -8 },
    draw: (k) => {
      const g = G(k.p);
      // ballot paper half inside the slot
      let s = P(poly(-3.4, -17.8, 2.6, -17.8, 3.6, -25.6, -2, -26.2), PAPER, k.lw);
      if (!k.simple) s += L(`${M(-2.7, -21.8)}${Lto(3.1, -21.5)}${M(-0.9, -24.4)}l1.6 1.6m0 -1.6l-1.6 1.6`, k.dw * 0.8);
      s += P(poly(-11, -16, 11, -16, 14, -19, -8, -19), PAPER, k.lw);
      s += P(poly(-3.8, -17.2, 3.4, -17.2, 4.4, -18.1, -2.8, -18.1), INK, k.dw * 0.5);
      s += P(poly(11, 0, 14, -3, 14, -19, 11, -16), g.dots, k.lw);
      s += P(poly(-11, 0, 11, 0, 11, -16, -11, -16), PAPER, k.lw);
      if (!k.simple) {
        s += P(poly(-6.5, -11.5, 6.5, -11.5, 6.5, -5, -6.5, -5), "none", k.dw);
        s += P(poly(-1.3, -16, 1.3, -16, 1.3, -13.6, -1.3, -13.6), g.gold, k.dw);
        s += L(`${M(-11, -2)}${Lto(11, -2)}`, k.dw * 0.7);
      }
      return s;
    },
  },
  gavel: {
    h: 20,
    w: 20,
    grip: { x: 0, y: -3 },
    draw: (k) => {
      const g = G(k.p);
      let s = P(`${M(-1, -12.5)}${Lto(-0.8, -1.4)}${Q(0, 0.3, 0.8, -1.4)}${Lto(1, -12.5)}Z`, g.light, k.lw);
      s += C(0, -0.9, 1.3, g.dark, k.dw);
      const head = `${M(-6.5, -20)}${Q(0, -21, 6.5, -20)}${Lto(6.5, -12.5)}${Q(0, -11.5, -6.5, -12.5)}Z`;
      s += P(head, g.light, k.lw);
      s += E(-7.2, -16.25, 1.6, 3.9, g.mid, k.lw) + E(7.2, -16.25, 1.6, 3.9, g.light, k.lw);
      if (!k.simple) {
        s += L(`${M(-4.2, -20.4)}${Lto(-4.2, -12)}${M(4.2, -20.4)}${Lto(4.2, -12)}`, k.dw);
        s += L(`${M(-3.2, -19.2)}${Q(0, -19.8, 3.2, -19.2)}`, k.dw, PAPER);
      }
      return s;
    },
  },
  clock: {
    h: 23,
    w: 18,
    grip: { x: 0, y: -11 },
    draw: (k) => {
      const g = G(k.p);
      const caseD = `${M(-8, 0)}${Lto(8, 0)}${Lto(8, -12)}${Q(8, -22.6, 0, -22.6)}${Q(-8, -22.6, -8, -12)}Z`;
      let s = P(poly(-9, 0, 9, 0, 9, -1.4, -9, -1.4), g.dark, k.lw);
      s += P(caseD, g.light, k.lw);
      if (!k.simple) s += F(`${M(5.5, -1.4)}${Lto(8, -1.4)}${Lto(8, -12)}${Q(8, -18, 5.5, -20.4)}Z`, g.dots) + P(caseD, "none", k.lw);
      s += C(0, -12.5, 6, PAPER, k.lw);
      if (!k.simple) {
        let ticks = "";
        for (let i = 0; i < 12; i += 1) {
          const a = (i / 12) * Math.PI * 2;
          const r0 = i % 3 === 0 ? 4.3 : 4.9;
          ticks += `${M(Math.cos(a) * r0, -12.5 + Math.sin(a) * r0)}${Lto(Math.cos(a) * 5.4, -12.5 + Math.sin(a) * 5.4)}`;
        }
        s += L(ticks, k.dw * 0.8);
      }
      s += L(`${M(0, -12.5)}${Lto(0, -16.6)}${M(0, -12.5)}${Lto(2.8, -11.2)}`, k.dw * 1.4);
      s += C(0, -12.5, 0.6, INK, k.dw * 0.5);
      return s;
    },
  },
  feather: {
    h: 25,
    w: 10,
    grip: { x: 0.6, y: -3.5 },
    draw: (k) => {
      const g = G(k.p);
      const vane = `${M(0.6, -5)}${Q(-4.8, -10, -2.6, -19)}${Q(-0.8, -24, 3.8, -25)}${Q(5.2, -18, 3.6, -12)}${Q(2.6, -7.6, 0.8, -5)}Z`;
      let s = P(vane, PAPER, k.lw);
      if (!k.simple) {
        s += F(`${M(1.2, -6)}${Q(4, -9, 3.6, -12)}${Q(5, -18, 3.8, -24.6)}${Q(2.6, -15, 1.2, -6)}Z`, g.dots);
        let barbs = "";
        for (let i = 0; i < 7; i += 1) {
          const t = i / 7;
          const x = 0.3 + t * 3;
          const y = -7 - t * 16;
          barbs += `${M(x, y)}${Lto(x - 3.2 + t * 1.2, y + 1.6)}`;
        }
        s += L(barbs, k.dw * 0.7);
        s += L(`${M(-3.3, -14.6)}l1.6 -0.4`, k.dw);
        s += P(vane, "none", k.lw);
      }
      s += L(`${M(0, 0)}${Q(0.8, -8, 1.6, -13)}${Q(2.6, -19, 3.8, -25)}`, k.dw * 1.2);
      return s;
    },
  },
  bell: {
    h: 18,
    w: 15,
    grip: { x: 0, y: -15 },
    draw: (k) => {
      const g = G(k.p);
      let s = P(`${M(-1.5, -10.5)}${Lto(-1.3, -16)}${Q(0, -18.6, 1.3, -16)}${Lto(1.5, -10.5)}Z`, g.dark, k.lw);
      const body = `${M(-2.6, -10.2)}${Q(-5.4, -9.6, -5.6, -5)}${Q(-6, -2.4, -7.5, -1.2)}${Lto(7.5, -1.2)}${Q(6, -2.4, 5.6, -5)}${Q(5.4, -9.6, 2.6, -10.2)}Z`;
      s += C(0, -0.9, 1.2, g.dark, k.dw);
      s += P(body, bodyOf(k, g.gold), k.lw);
      s += P(`${M(-7.7, -1.2)}${Lto(7.7, -1.2)}${Q(7.9, -0.3, 7.2, -0.2)}${Lto(-7.2, -0.2)}${Q(-7.9, -0.3, -7.7, -1.2)}Z`, g.gold, k.lw);
      if (!k.simple) s += L(`${M(-3.6, -8.2)}${Q(-4.5, -5, -5.3, -2.8)}`, k.dw * 1.2, PAPER);
      return s;
    },
  },
  flag: {
    h: 96,
    w: 36,
    grip: { x: 0, y: -40 },
    draw: (k) => {
      const g = G(k.p);
      const cloth = `${M(1, -90)}${Q(10, -94, 18, -89.5)}${Q(26, -85.5, 34.5, -89)}${Lto(34.5, -68)}${Q(26, -64.5, 18, -68.5)}${Q(10, -73, 1, -69)}Z`;
      let s = P(cloth, bodyOf(k, PAPER), k.lw);
      if (!k.simple) {
        s += F(`${M(1, -79.5)}${Q(10, -83.5, 18, -79)}${Q(26, -75, 34.5, -78.5)}${Lto(34.5, -68)}${Q(26, -64.5, 18, -68.5)}${Q(10, -73, 1, -69)}Z`, g.dark);
        s += L(`${M(17, -88)}${Q(16, -80, 17.5, -70)}`, k.dw * 0.7);
        s += P(cloth, "none", k.lw);
      }
      s += P(poly(-0.8, 0, 0.8, 0, 0.8, -92, -0.8, -92), g.light, k.lw);
      s += C(0, -94, 2, g.gold, k.lw);
      return s;
    },
  },
  gold_leaf: {
    h: 16,
    w: 16,
    grip: { x: 0, y: -7 },
    draw: (k) => {
      const g = G(k.p);
      // one thin leaf of gold, curled at a corner, with a vein and a glint
      const leaf = `${M(-6.8, -5.4)}${Q(-1, -11.4, 5.6, -11.2)}${Q(7.2, -5, 3.8, -0.8)}${Q(-2.4, -1.2, -6.8, -5.4)}Z`;
      let s = P(leaf, bodyOf(k, g.gold), k.lw);
      if (!k.simple) {
        s += F(`${M(3.8, -0.8)}${Q(7.2, -5, 5.6, -11.2)}${Q(4.6, -6.6, 1.8, -3.6)}Z`, g.dark);
        s += L(`${M(-5.4, -5.2)}${Q(-0.4, -6.4, 4.6, -9.8)}`, k.dw * 0.8);
        s += L(`${M(-2.6, -5.9)}${Lto(-1.2, -3.2)}${M(0.6, -7)}${Lto(1.8, -4.6)}`, k.dw * 0.7);
        s += sparkle(-4.6, -10.4, 2.6, k.dw);
      }
      return s;
    },
  },
  thorn: {
    h: 30,
    w: 16,
    grip: { x: 0, y: -4 },
    draw: (k) => {
      const g = G(k.p);
      // a woody rose cane with one long thorn (the one she presses her breast against) and small ones
      let s = P(`${M(-1.6, 0)}${Q(-2.6, -12, -1, -22)}${Q(-0.6, -27, 1.4, -30)}${Lto(2.6, -29)}${Q(1.6, -26, 1.8, -21.6)}${Q(3.2, -12, 1.8, 0)}Z`, g.dark, k.lw);
      s += P(`${M(1.8, -10)}${Q(7.4, -11.6, 14, -15)}${Q(8.4, -8.4, 2.4, -6.6)}Z`, PAPER, k.lw);
      if (!k.simple) {
        s += L(`${M(2.2, -9.2)}${Q(7, -10.4, 12, -13.4)}`, k.dw * 0.7);
        s += P(`${M(-1.5, -17)}${Q(-5, -17.8, -8, -20.4)}${Q(-4.4, -14.4, -1.7, -14)}Z`, PAPER, k.lw * 0.8);
        s += P(`${M(1.4, -24)}${Q(4, -25, 6, -27.4)}${Q(3, -22, 1.6, -21.4)}Z`, PAPER, k.lw * 0.8);
        s += P(`${M(0.2, -29)}${Q(-3.4, -27, -5.6, -29)}${Q(-3, -31, 0.4, -30.6)}Z`, g.light, k.lw * 0.8);
      }
      return s;
    },
  },
  axe: {
    h: 46,
    w: 24,
    grip: { x: 0, y: -10 },
    draw: (k) => {
      const g = G(k.p);
      // a long wooden haft and a broad steel head with a curved cutting edge
      let s = P(poly(-1.2, 0, 1.2, 0, 1.0, -40, -1.0, -40), bodyOf(k, g.light), k.lw);
      const head = `${M(0.9, -42.5)}${Lto(10.8, -45.6)}${Q(13.2, -37, 10.8, -29.4)}${Lto(0.9, -33)}Z`;
      s += P(head, g.mid, k.lw);
      if (!k.simple) {
        s += L(`${M(9.6, -44.4)}${Q(11.8, -37, 9.6, -30.6)}`, k.dw * 0.9, PAPER);
        s += L(`${M(0.9, -39)}${Lto(6.8, -40.6)}`, k.dw * 0.7);
        s += P(poly(-2.2, -41.8, 1.2, -41.8, 1.2, -33.4, -2.2, -33.4), g.dark, k.lw * 0.9);
        s += L(`${M(-1, -6)}${Lto(1, -7.2)}${M(-1, -9)}${Lto(1, -10.2)}`, k.dw * 0.6);
      }
      return s;
    },
  },
  firework: {
    h: 34,
    w: 9,
    grip: { x: 0, y: -8 },
    draw: (k) => {
      const g = G(k.p);
      // a paper firework tube: bands, a plug and a twist of fuse with sparks (never a wax candle)
      let s = P(poly(-3.4, 0, 3.4, 0, 3.4, -29, -3.4, -29), bodyOf(k, g.mid), k.lw);
      s += P(poly(-3.4, -4, 3.4, -4, 3.4, -1, -3.4, -1), PAPER, k.dw);
      s += P(poly(-3.4, -27.4, 3.4, -27.4, 3.4, -29, -3.4, -29), g.dark, k.dw);
      if (!k.simple) {
        s += P(poly(-3.4, -20, 3.4, -17.6, 3.4, -13.2, -3.4, -15.6), PAPER, k.dw);
        s += L(`${M(-3.4, -9.2)}${Lto(3.4, -7.4)}${M(-3.4, -24)}${Lto(3.4, -22.4)}`, k.dw);
      }
      s += L(`${M(0.2, -29)}${Q(2.2, -31, 0.8, -32.6)}${Q(0, -33.4, 1.6, -34.4)}`, k.lw * 1.1);
      if (!k.simple) {
        let rays = "";
        for (let i = 0; i < 5; i += 1) {
          const a = -Math.PI / 2 + (i - 2) * 0.55;
          rays += `${M(1.6 + Math.cos(a) * 0.6, -34.4 + Math.sin(a) * 0.6)}${Lto(1.6 + Math.cos(a) * 1.9, -34.4 + Math.sin(a) * 1.9)}`;
        }
        s += L(rays, k.dw);
      }
      return s;
    },
  },
  sign: {
    h: 48,
    w: 36,
    grip: { x: 0, y: -4 },
    draw: (k) => {
      const g = G(k.p);
      // a notice-board on a post: a plank with lines of lettering
      let s = P(poly(-1.2, 0, 1.2, 0, 1.2, -36, -1.2, -36), g.dark, k.lw);
      s += P(poly(-16, -47, 16, -47, 16, -26, -16, -26), bodyOf(k, PAPER), k.lw);
      if (!k.simple) {
        s += L(`${M(-12.4, -42)}${Lto(12.4, -42)}${M(-12.4, -38)}${Lto(12.4, -38)}${M(-12.4, -34)}${Lto(12.4, -34)}${M(-12.4, -30)}${Lto(6, -30)}`, k.dw * 1.2);
        s += C(-13.4, -45, 0.8, INK, k.dw);
        s += C(13.4, -45, 0.8, INK, k.dw);
      }
      return s;
    },
  },
  // ---- v0.2 (#41): props that stories need ----------------------------------
  pot: {
    // a kitchen cooking pot: round belly, side lugs, lid with a knob. NOT a bell (no flare, no loop, no clapper).
    h: 21,
    w: 22,
    grip: { x: 9.6, y: -6 },
    draw: (k) => {
      const g = G(k.p);
      let s = "";
      // steam above the lid
      if (!k.simple) s += L(`${M(-2.2, -16.4)}q-1.5 -1.2 0 -2.4t0 -2.4${M(2.4, -16)}q-1.5 -1.2 0 -2.4`, k.dw * 0.9);
      // side lugs
      s += P(`${M(-7.4, -7.8)}${Q(-11.6, -8.2, -11.2, -5)}${Q(-11, -3.9, -7.2, -4.6)}`, "none", k.lw * 1.25);
      s += P(`${M(7.4, -7.8)}${Q(11.6, -8.2, 11.2, -5)}${Q(11, -3.9, 7.2, -4.6)}`, "none", k.lw * 1.25);
      // round belly, flat foot
      const belly = `${M(-6.6, -9.6)}${Q(-8.6, -6, -7.2, -2.8)}${Q(-6.2, -0.6, -3.6, -0.6)}${Lto(3.6, -0.6)}${Q(6.2, -0.6, 7.2, -2.8)}${Q(8.6, -6, 6.6, -9.6)}Z`;
      s += P(belly, bodyOf(k, g.dark), k.lw);
      if (!k.simple) s += L(`${M(-5.4, -7.2)}${Q(-6, -5, -5.2, -3.4)}`, k.dw * 1.2, PAPER);
      // rim and domed lid with a knob
      s += P(`${M(-7.4, -10.6)}${Lto(7.4, -10.6)}${Lto(7.2, -9)}${Lto(-7.2, -9)}Z`, g.mid, k.lw);
      s += P(`${M(-6, -10.6)}${Q(0, -16, 6, -10.6)}Z`, g.light, k.lw);
      s += C(0, -14.6, 1.1, g.dark, k.dw);
      return s;
    },
  },
  stove: {
    // a tiled iron-and-tile room stove with a pipe: door with a lit window, vents, a flat top
    h: 64,
    w: 36,
    grip: { x: 0, y: -30 },
    draw: (k) => {
      const g = G(k.p);
      let s = "";
      // flue pipe up and out
      s += P(poly(5, -45, 11, -45, 11, -64, 5, -64), g.mid, k.lw);
      if (!k.simple) s += L(`${M(5, -52)}${Lto(11, -52)}${M(5, -58)}${Lto(11, -58)}`, k.dw);
      // feet
      s += P(poly(-15, -4, -11, -4, -11, 0, -15, 0), g.dark, k.lw);
      s += P(poly(11, -4, 15, -4, 15, 0, 11, 0), g.dark, k.lw);
      // tiled body
      s += P(poly(-16, -4, 16, -4, 16, -42, -16, -42), bodyOf(k, PAPER), k.lw);
      if (!k.simple) {
        let tiles = "";
        for (let y = -10; y > -42; y += -6) tiles += `${M(-16, y)}${Lto(16, y)}`;
        for (let x = -10; x < 16; x += 6) tiles += `${M(x, -4)}${Lto(x, -42)}`;
        s += L(tiles, k.dw * 0.6);
        s += F(poly(11, -4, 16, -4, 16, -42, 11, -42), g.dots);
      }
      // top plate and base plate
      s += P(poly(-18, -45, 18, -45, 18, -42, -18, -42), g.dark, k.lw);
      s += P(poly(-17, -4, 17, -4, 17, -6.2, -17, -6.2), g.dark, k.lw);
      // iron door with an arched lit window
      s += P(`${M(-8.5, -12)}${Lto(-8.5, -32)}${Q(-8.5, -37.6, -3, -37.6)}${Q(2.5, -37.6, 2.5, -32)}${Lto(2.5, -12)}Z`, g.dark, k.lw);
      s += P(`${M(-5.6, -17)}${Lto(-5.6, -31.4)}${Q(-5.6, -34.8, -3, -34.8)}${Q(-0.4, -34.8, -0.4, -31.4)}${Lto(-0.4, -17)}Z`, PAPER, k.dw * 1.2);
      s += flame(-3, -17.6, 11, k.dw * 1.1);
      s += C(4.6, -24, 1.1, PAPER, k.dw);
      // air vents under the door
      if (!k.simple) s += L(`${M(7.4, -12)}${Lto(13, -12)}${M(7.4, -14.4)}${Lto(13, -14.4)}${M(7.4, -16.8)}${Lto(13, -16.8)}`, k.dw * 1.1);
      return s;
    },
  },
  roast_goose: {
    // a roast goose on a platter, legs up, knife and fork in the breast, steam over it
    h: 26,
    w: 34,
    grip: { x: -15, y: -3 },
    draw: (k) => {
      const g = G(k.p);
      let s = "";
      if (!k.simple) s += L(`${M(-4, -19)}q-1.8 -1.6 0 -3.4t0 -3.4${M(1.2, -18.4)}q-1.8 -1.6 0 -3.4${M(6, -18)}q-1.6 -1.5 0 -3.2`, k.dw * 0.9);
      // platter
      s += E(0, -1.9, 16.5, 2.4, PAPER, k.lw);
      s += E(0, -2.6, 11.5, 1.4, g.light, k.dw);
      // two drumsticks tied up at the back: a meaty club with a bone end and a paper frill
      for (const [x0, lean] of [[7.4, 0.2], [11, 0.55]] as const) {
        const tx = x0 + lean * 4;
        s += P(`${M(x0 - 2.3, -6)}${Q(x0 - 3.2, -11.5, tx - 1.4, -14.4)}${Lto(tx + 1.4, -14.4)}${Q(x0 + 3.4, -11, x0 + 2.4, -6)}Z`, bodyOf(k, g.mid), k.lw);
        s += P(poly(tx - 0.9, -14.4, tx + 0.9, -14.4, tx + 0.8, -16.4, tx - 0.8, -16.4), PAPER, k.dw);
        s += P(`${M(tx - 2.4, -16)}${Lto(tx + 2.4, -16)}${Lto(tx + 3, -18.8)}${Lto(tx - 3, -18.8)}Z`, PAPER, k.dw);
      }
      // the body: a plump brown bird, breast to the left
      const body = `${M(-14, -4.2)}${Q(-15.6, -11.4, -8, -13.4)}${Q(-0.6, -15.6, 7.6, -11.6)}${Q(14.4, -9.4, 13.2, -4.2)}${Q(0, -1.6, -14, -4.2)}Z`;
      s += P(body, bodyOf(k, g.mid), k.lw);
      if (!k.simple) {
        s += F(`${M(-13.4, -5.6)}${Q(0, -3.2, 12.8, -5.6)}${Lto(12.6, -4.4)}${Q(0, -1.8, -13.6, -4.4)}Z`, g.dark);
        s += L(`${M(-9, -12)}${Q(-3, -13.8, 3, -12.6)}`, k.dw * 1.3, PAPER);
        // carved breast slices and a wing
        s += L(`${M(-10.6, -11.4)}${Q(-9.4, -8.4, -10.2, -5.6)}${M(-7.4, -12.4)}${Q(-6.2, -9, -7, -5.2)}${M(-4.2, -12.8)}${Q(-3, -9.4, -3.8, -5)}`, k.dw * 0.9);
        s += L(`${M(1, -10)}${Q(5, -11.4, 8, -8)}${Q(4, -6.6, 1, -10)}`, k.dw);
        // a small knife and fork stuck in the breast, with short handles
        s += L(`${M(-12.2, -10.6)}${Lto(-13.2, -15.8)}${M(-11.4, -10.8)}${Lto(-11.4, -15.8)}`, k.lw * 0.7);
        s += P(poly(-13.8, -15.8, -12.6, -15.8, -12.6, -18.4, -13.8, -18.4), PAPER, k.dw);
        s += P(poly(-12, -15.8, -10.8, -15.8, -10.8, -18.4, -12, -18.4), PAPER, k.dw);
      }
      return s;
    },
  },
  heart: {
    // a heart cast in lead: dark, heavy, with a glint (tone variant for other hearts)
    h: 14,
    w: 15,
    grip: { x: 0, y: -7 },
    draw: (k) => {
      const g = G(k.p);
      const shape = `${M(0, -0.4)}${Q(-8, -5.4, -7.4, -9.6)}${Q(-6.6, -13.6, -3.2, -13.4)}${Q(-0.7, -13.2, 0, -10.2)}${Q(0.7, -13.2, 3.2, -13.4)}${Q(6.6, -13.6, 7.4, -9.6)}${Q(8, -5.4, 0, -0.4)}Z`;
      let s = P(shape, bodyOf(k, g.dark), k.lw);
      if (!k.simple) {
        s += L(`${M(-5.2, -8.4)}${Q(-5.4, -10.8, -3.6, -11.4)}`, k.dw * 1.5, darkBody(k) || !k.tone ? PAPER : INK);
        s += L(`${M(2, -1.6)}${Q(5, -3.4, 6.2, -6.4)}`, k.dw, PAPER);
      }
      return s;
    },
  },
  angel: {
    // a winged angel in a long gown with a halo, hands together: drawn plainly, no face detail beyond closed eyes
    h: 58,
    w: 58,
    grip: { x: 0, y: -26 },
    draw: (k) => {
      const g = G(k.p);
      let s = "";
      // wings behind the figure: two layered feathered shapes on each side
      for (const sx of [-1, 1]) {
        const X = (x: number) => sx * x;
        const wing = `${M(X(3), -42)}${Q(X(12), -58, X(25), -54)}${Q(X(28.4), -50, X(25.6), -46.6)}${Q(X(29), -43.4, X(25.4), -40.6)}${Q(X(27.6), -37, X(23), -35)}${Q(X(23.4), -31, X(18.4), -30)}${Q(X(15), -26, X(4), -23)}Z`;
        s += P(wing, PAPER, k.lw);
        if (!k.simple) {
          s += L(`${M(X(5), -40)}${Q(X(16), -49, X(24), -51)}${M(X(5), -36.6)}${Q(X(16), -43, X(25), -43.6)}${M(X(5), -33)}${Q(X(15), -37, X(22.4), -36.6)}${M(X(5), -29)}${Q(X(12), -31, X(18), -31)}`, k.dw * 0.9);
        }
      }
      // the gown: shoulders to a wide hem, with folds
      const gown = `${M(-5.2, -37)}${Q(-6.6, -22, -10.6, -2.4)}${Q(0, 0.6, 10.6, -2.4)}${Q(6.6, -22, 5.2, -37)}${Q(0, -39.4, -5.2, -37)}Z`;
      s += P(gown, bodyOf(k, PAPER), k.lw);
      if (!k.simple) {
        s += L(`${M(-3, -24)}${Q(-4.4, -13, -6.4, -3.2)}${M(1.4, -22)}${Q(1.8, -12, 1, -1.6)}${M(5, -24)}${Q(6, -13, 7.6, -3)}`, k.dw);
        s += F(`${M(5.2, -37)}${Q(6.6, -22, 10.6, -2.4)}${Q(8.4, -1.6, 6.4, -2)}${Q(4.8, -20, 3, -37)}Z`, g.dots);
      }
      // arms folded in front, hands together
      s += P(`${M(-5, -35)}${Q(-9, -28, -2.4, -27.2)}${Lto(2.4, -27.2)}${Q(9, -28, 5, -35)}${Q(0, -32.4, -5, -35)}Z`, PAPER, k.lw);
      s += C(0, -27.8, 2.1, PAPER, k.dw * 1.2);
      // head, hair and halo
      s += C(0, -43.2, 4.6, PAPER, k.lw);
      s += P(`${M(-4.7, -43)}${Q(-5, -49, 0, -49)}${Q(5, -49, 4.7, -43)}${Q(2.4, -46.6, -4.7, -43)}Z`, g.mid, k.dw * 1.2);
      if (!k.simple) s += L(`${M(-2.6, -42.4)}${Q(-1.6, -41.8, -0.8, -42.4)}${M(0.8, -42.4)}${Q(1.6, -41.8, 2.6, -42.4)}`, k.dw);
      s += E(0, -53, 6.4, 1.9, "none", k.lw * 1.1);
      return s;
    },
  },
  loom: {
    // a weaver's frame loom: two posts, beams, bare warp threads, a shuttle and treadles. Empty on purpose
    // (the cheats in the tale weave nothing); a short band of cloth sits at the bottom.
    h: 66,
    w: 56,
    grip: { x: 0, y: -30 },
    draw: (k) => {
      const g = G(k.p);
      let s = "";
      // warp threads between the beams
      let warp = "";
      for (let x = -19; x <= 19; x += 3.17) warp += `${M(x, -56)}${Lto(x, -22)}`;
      s += L(warp, k.dw * 0.55);
      // a band of woven cloth just above the lower beam, and a shuttle on the warp
      s += P(poly(-19.2, -22, 19.2, -22, 19.2, -29, -19.2, -29), bodyOf(k, g.light), k.dw);
      if (!k.simple) {
        let weft = "";
        for (let y = -24; y > -29; y += -2) weft += `${M(-19.2, y)}${Lto(19.2, y)}`;
        s += L(weft, k.dw * 0.6);
        s += P(`${M(-9, -37)}${Q(-4, -39.2, 7, -37)}${Q(-4, -34.8, -9, -37)}Z`, g.dark, k.dw);
      }
      // posts with feet
      for (const sx of [-1, 1]) {
        s += P(poly(sx * 22.8, 0, sx * 25.8, 0, sx * 25.8, -62, sx * 22.8, -62), g.dark, k.lw);
        s += P(poly(sx * 20, 0, sx * 28, 0, sx * 28, -3, sx * 20, -3), g.mid, k.lw);
      }
      // top beam and cloth beam, a lower rail
      s += P(poly(-27.8, -62, 27.8, -62, 27.8, -55.6, -27.8, -55.6), g.mid, k.lw);
      s += P(poly(-27, -22, 27, -22, 27, -17.6, -27, -17.6), g.mid, k.lw);
      s += P(poly(-25.8, -9, 25.8, -9, 25.8, -6.6, -25.8, -6.6), g.dark, k.lw);
      if (!k.simple) {
        s += L(`${M(-24, -59)}${Lto(24, -59)}`, k.dw * 0.8, PAPER);
        // treadles at the front, pegs on the beams
        s += P(poly(-12, -3, -4, -3, -4, -1, -12, -1), g.dark, k.dw);
        s += P(poly(4, -3, 12, -3, 12, -1, 4, -1), g.dark, k.dw);
        s += L(`${M(-8, -3)}${Lto(-8, -9)}${M(8, -3)}${Lto(8, -9)}`, k.dw);
        s += C(-27.8, -59, 1, PAPER, k.dw);
        s += C(27.8, -59, 1, PAPER, k.dw);
      }
      return s;
    },
  },
  sledge: {
    // a sledge (sleigh) with curled runners and a high curved back, facing right
    h: 31,
    w: 56,
    grip: { x: 18, y: -8 },
    draw: (k) => {
      const g = G(k.p);
      let s = "";
      // everything below is drawn from the sledge's own origin (runner start at x = -21): shift to centre it
      // runners: long curves, front curl up
      s += L(`${M(-21, -3.4)}${Q(-22.6, -1, -20, 0)}${Lto(18, 0)}${Q(24, 0, 23.4, -6)}${Q(23, -9.6, 20.4, -9.4)}`, k.lw * 1.7);
      // posts from runner to body
      s += L(`${M(-12, -1.6)}${Lto(-12, -8)}${M(10, -1.6)}${Lto(10, -8)}`, k.lw * 1.2);
      // the body: high curved back at the left, low front board
      const body = `${M(-20, -23)}${Q(-20.6, -12, -17, -9)}${Lto(17, -9)}${Q(19.4, -9.6, 20, -12)}${Lto(17.6, -13.4)}${Q(12, -13.2, 8, -14)}${Lto(-12, -14)}${Q(-14, -18, -13.2, -26)}${Q(-17, -27, -20, -23)}Z`;
      s += P(body, bodyOf(k, g.gold), k.lw);
      if (!k.simple) {
        s += F(`${M(-17, -9)}${Lto(17, -9)}${Q(19.4, -9.6, 20, -12)}${Lto(17, -11.4)}${Lto(-16.6, -11.4)}Z`, g.mid);
        s += L(`${M(-18, -21)}${Q(-17.4, -14, -15.4, -10.8)}`, k.dw * 1.2);
        s += P(poly(-12, -14, 8, -14, 8, -16.4, -12, -16.4), g.dark, k.dw);
        // a scroll curl on the front board
        s += L(`${M(16, -12)}${Q(18.6, -14.4, 16.4, -16.6)}${Q(14.6, -15.2, 16, -14.2)}`, k.dw);
      }
      // the swan-neck prow: a curled neck, a head with a beak and an eye
      s += L(`${M(18, -12.6)}${Q(25, -15, 23.4, -21)}${Q(22.4, -25.2, 24.6, -27.4)}`, k.lw * 1.4);
      s += P(`${M(23, -26.2)}${Q(24.6, -29.4, 27.6, -28)}${Lto(30.6, -27.4)}${Lto(27.4, -26.2)}${Q(25.6, -25, 23, -26.2)}Z`, PAPER, k.dw * 1.2);
      s += P(poly(27.6, -28, 30.6, -27.4, 27.4, -26.2), g.dark, k.dw);
      s += C(25.6, -27.4, 0.5, INK, k.dw * 0.5);
      return `<g transform="translate(-4 0)">${s}</g>`;
    },
  },
};

export function propSpec(prop: PropId): { h: number; w: number; grip: Point } {
  const s = SPECS[prop];
  if (!s) throw new Error(`unknown prop ${String(prop)}`);
  return { h: s.h, w: s.w, grip: s.grip };
}

/**
 * Height of the sitting surface for an adult (figure units, negative = above
 * the ground). It matches the human rig's "sit" pose: the underside of the
 * pelvis of an average adult sits here (3/4 view -24, front view -25.8).
 * Seats are drawn at adult size; for other figures the composer scales the
 * seat by (that figure's seat contact height / -SEAT_Y). See
 * `seatContact()` in rig/index.ts for the contact point of a given look.
 */
export const SEAT_Y = -24.5;

interface SeatSpec {
  w: number;
  h: number;
  draw: (k: Pen) => string;
}

const SEATS: Record<SeatKind, SeatSpec> = {
  stool: {
    w: 24,
    h: 27,
    draw: (k) => {
      const g = G(k.p);
      const y = SEAT_Y;
      let s = L(`${M(0, y + 3)}${Lto(0.5, -0.6)}`, k.lw * 1.6);
      s += L(`${M(-7, y + 2.2)}${Lto(-10.2, 0)}${M(7, y + 2.2)}${Lto(10.2, 0)}`, k.lw * 1.8);
      if (!k.simple) s += L(`${M(-8.6, -9)}${Q(0, -7.4, 8.6, -9)}`, k.lw);
      s += P(`${M(-11, y)}${Lto(-11, y + 2.4)}A11 2.6 0 0 0 11 ${n(y + 2.4)}${Lto(11, y)}Z`, g.dark, k.lw);
      s += E(0, y, 11, 2.6, g.light, k.lw);
      return s;
    },
  },
  chair: {
    w: 30,
    h: 62,
    draw: (k) => {
      const g = G(k.p);
      const y = SEAT_Y;
      // back legs and back rest (behind the sitter), then seat, then front legs
      let s = L(`${M(-13.5, y + 1)}${Lto(-14.5, 0)}${M(8, y)}${Lto(8.4, -1)}`, k.lw * 1.7);
      s += P(poly(-15, y - 0.6, -11.4, y - 0.6, -13.4, -60, -17, -60), g.light, k.lw);
      if (!k.simple) s += L(`${M(-12.9, y - 8)}${Lto(-14.8, -52)}`, k.dw);
      s += P(poly(-17.6, -58, -12.6, -58, -12.8, -62, -17.8, -62), g.dark, k.lw);
      s += P(poly(-14, y - 1.2, 9, y - 1.2, 13, y + 1.3, -10, y + 1.3), g.light, k.lw);
      s += P(poly(-10, y + 1.3, 13, y + 1.3, 13, y + 3.4, -10, y + 3.4), g.dark, k.lw);
      s += L(`${M(11.6, y + 3.4)}${Lto(11.8, 0)}${M(-8.6, y + 3.4)}${Lto(-9.2, 0)}`, k.lw * 1.7);
      if (!k.simple) s += L(`${M(-8.9, -10)}${Lto(11.7, -10)}`, k.lw);
      return s;
    },
  },
  bench: {
    w: 50,
    h: 27,
    draw: (k) => {
      const g = G(k.p);
      const y = SEAT_Y;
      let s = L(`${M(-18, y)}${Lto(-18.5, -0.6)}${M(20, y)}${Lto(20.5, -0.6)}`, k.lw * 1.7);
      s += P(poly(-24, y - 1.2, 22, y - 1.2, 25, y + 1.2, -21, y + 1.2), g.light, k.lw);
      s += P(poly(-21, y + 1.2, 25, y + 1.2, 25, y + 3.4, -21, y + 3.4), g.dark, k.lw);
      if (!k.simple) s += L(`${M(-16, y - 0.1)}${Lto(18, y - 0.1)}`, k.dw, PAPER);
      s += L(`${M(-16, y + 3.4)}${Lto(-16.8, 0)}${M(22, y + 3.4)}${Lto(22.6, 0)}`, k.lw * 1.8);
      return s;
    },
  },
  throne: {
    w: 42,
    h: 84,
    draw: (k) => {
      const g = G(k.p);
      const gold = toneFill("light", k.p);
      const y = SEAT_Y;
      // tall carved back with a crest, arm rests, a solid base
      let s = P(`${M(-20, y)}${Lto(-20, -72)}${Q(-20, -80, -13, -82)}${Q(-9, -84, -6, -80)}${Lto(-6, y)}Z`, gold, k.lw);
      if (!k.simple) {
        s += P(`${M(-17, y - 6)}${Lto(-17, -70)}${Q(-17, -76, -13, -77)}${Q(-9.5, -78, -9, -74)}${Lto(-9, y - 6)}Z`, g.dark, k.dw);
        s += C(-13, -80.5, 1.6, g.dark, k.dw);
      }
      s += P(poly(-20, y - 1.4, 12, y - 1.4, 15, y + 1.4, -17, y + 1.4), gold, k.lw);
      s += P(poly(-17, y + 1.4, 15, y + 1.4, 15, -0.2, -17, -0.2), g.dark, k.lw);
      if (!k.simple) s += P(poly(-13, y + 5, 11, y + 5, 11, -4, -13, -4), "none", k.dw).replace(`stroke="${INK}"`, `stroke="${PAPER}"`);
      // arm rest on the far side (behind the sitter's arm)
      s += P(poly(-19, -37, 11, -37, 12.5, -34.4, -17.5, -34.4), gold, k.lw);
      s += L(`${M(10.5, -34.4)}${Lto(10.5, y - 1.4)}`, k.lw * 1.8);
      s += C(11.5, -36.6, 1.8, gold, k.lw);
      return s;
    },
  },
};

export const props: PropModule = {
  nominalHeight(prop: PropId): number {
    return propSpec(prop).h;
  },
  draw(prop: PropId, lineWidth: number, ctx: DrawContext, tone?: Tone): PropDrawing {
    const spec = SPECS[prop];
    if (!spec) throw new Error(`unknown prop ${String(prop)}`);
    const lw = lineWidth > 0 ? lineWidth : 1;
    // detail survives only while the prop is several line-widths across
    const simple = Math.min(spec.h, spec.w) / lw < 7;
    const k = spec.scale ?? 1;
    const pen: Pen = { lw: lw / k, dw: (lw * 0.55) / k, p: ctx.idPrefix, simple, ...(tone ? { tone } : {}) };
    const inner = compactSvg(spec.draw(pen), 2);
    const svg = `<g stroke-linejoin="round" stroke-linecap="round"${k !== 1 ? ` transform="scale(${n(k)})"` : ""}>${inner}</g>`;
    return { svg, width: spec.w, height: spec.h, grip: { ...spec.grip } };
  },
  seat(kind: SeatKind, lineWidth: number, ctx: DrawContext): PropDrawing & { seatY: number } {
    const spec = SEATS[kind];
    if (!spec) throw new Error(`unknown seat ${String(kind)}`);
    const lw = lineWidth > 0 ? lineWidth : 1;
    const pen: Pen = { lw, dw: lw * 0.55, p: ctx.idPrefix, simple: 24 / lw < 7 };
    const svg = `<g stroke-linejoin="round" stroke-linecap="round">${spec.draw(pen)}</g>`;
    return { svg, width: spec.w, height: spec.h, grip: { x: 0, y: SEAT_Y }, seatY: SEAT_Y };
  },
};

export const SEAT_KINDS: readonly SeatKind[] = ["stool", "chair", "bench", "throne"];

export const PROP_IDS = PROPS;
