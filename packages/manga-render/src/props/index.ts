/**
 * Props in figure space: ground at y=0 (props occupy negative y), one unit =
 * 1/100 of an adult's height, canonical facing right, centred on x=0.
 * Each prop is drawn at its nominal size; `grip` is where a hand holds it.
 * Outer silhouette uses `lineWidth`; inner detail is thinner and is dropped
 * when the prop is small relative to the line weight (silhouette first).
 */
import { PROPS, type Point, type PropId } from "../contracts.js";
import type { DrawContext, PropDrawing, PropModule } from "../internal.js";
import { INK, PAPER, toneFill } from "../style.js";
import { n, polyPath, smoothPath } from "../svg.js";

interface Pen {
  lw: number;
  dw: number;
  p: string;
  /** Too small for interior detail. */
  simple: boolean;
}

interface Spec {
  h: number;
  w: number;
  grip: Point;
  draw: (k: Pen) => string;
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
      s += C(0, -2.2, 2.1, g.gold, k.lw);
      return s;
    },
  },
  gem: {
    h: 9,
    w: 11,
    grip: { x: 0, y: -5 },
    draw: (k) => {
      const g = G(k.p);
      let s = P(poly(-5.5, -5.5, -3.2, -9, 3.2, -9, 5.5, -5.5, 0, 0), PAPER, k.lw);
      s += F(poly(-5.5, -5.5, -2.4, -5.5, 0, 0), g.light) + F(poly(2.4, -5.5, 5.5, -5.5, 0, 0), g.dark);
      if (!k.simple) {
        s += L(`${M(-5.5, -5.5)}${Lto(5.5, -5.5)}${M(-3.2, -9)}${Lto(-2.4, -5.5)}${Lto(0, -9)}${Lto(2.4, -5.5)}${Lto(3.2, -9)}${M(-2.4, -5.5)}${Lto(0, 0)}${Lto(2.4, -5.5)}`, k.dw);
      }
      s += P(poly(-5.5, -5.5, -3.2, -9, 3.2, -9, 5.5, -5.5, 0, 0), "none", k.lw);
      s += sparkle(4.6, -9.6, 3, k.dw) + sparkle(-5.6, -8.4, 1.8, k.dw);
      return s;
    },
  },
  coin: {
    h: 7,
    w: 7,
    grip: { x: 0, y: -3.5 },
    draw: (k) => {
      const g = G(k.p);
      let s = C(0, -3.5, 3.5, g.gold, k.lw);
      if (!k.simple) {
        s += `<circle cx="0" cy="-3.5" r="2.6" fill="none" stroke="${INK}" stroke-width="${n(k.dw)}"/>`;
        // a simple five-point star emblem
        const star: number[] = [];
        for (let i = 0; i < 10; i += 1) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const r = i % 2 === 0 ? 1.5 : 0.65;
          star.push(Math.cos(a) * r, -3.5 + Math.sin(a) * r);
        }
        s += P(poly(...star), INK, k.dw * 0.3);
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
      const g = G(k.p);
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
      let s = P(body, PAPER, k.lw);
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
    h: 28,
    w: 12,
    grip: { x: 0.3, y: -11 },
    draw: (k) => {
      const g = G(k.p);
      let s = L(`${M(0, 0)}${Q(-0.8, -10, 0.5, -20.5)}`, k.lw * 1.1);
      if (!k.simple) s += L(`${M(-0.3, -5)}l-1 -0.4M-0.2 -9l1 -0.5M0.1 -14l-1 -0.4`, k.dw);
      s += P(`${M(-0.3, -8)}${Q(-4.5, -10.5, -5.5, -7)}${Q(-2.5, -6, -0.3, -8)}Z`, g.dots, k.dw);
      s += P(`${M(0.3, -13)}${Q(4.8, -15.8, 5.4, -12)}${Q(2.5, -11, 0.3, -13)}Z`, g.dots, k.dw);
      // sepals
      s += P(poly(0.5, -20.5, -2.5, -19.5, -0.8, -21.3, 0.5, -22, 1.8, -21.3, 3.5, -19.5), g.dark, k.dw);
      // bloom: cupped outer petals (toned) around a paper spiral
      s += P(smooth(true, -5, -22.6, -4.4, -27.2, 0.4, -29.4, 5, -27.4, 5.8, -22.8, 3.4, -19.8, -2.4, -19.8), g.dark, k.lw);
      s += P(smooth(true, -3.2, -23.4, -2.2, -27, 1.2, -27.8, 3.8, -25.8, 3.4, -22.4, 0.2, -21.4), PAPER, k.dw);
      if (!k.simple) {
        s += L(`${M(-1.6, -24.4)}${Q(0.6, -27.6, 2.6, -24.8)}${Q(1.8, -22.4, -0.2, -23.2)}${Q(-0.9, -25.2, 0.9, -25.5)}${M(-5, -22.6)}${Q(-2, -21, 0.2, -21.4)}${M(5.8, -22.8)}${Q(4.4, -21.2, 3.4, -22.4)}`, k.dw);
        s += L(`${M(-4.2, -25.4)}${Q(-3.6, -23.4, -3.2, -23.4)}${M(4.6, -26.2)}${Q(4.2, -24, 3.6, -23.8)}`, k.dw, PAPER);
      }
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
      let petals = "";
      for (let i = 0; i < 8; i += 1) {
        const deg = (i / 8) * 360;
        petals += `<ellipse cx="0" cy="-3" rx="1.25" ry="2.6" transform="translate(0 -17) rotate(${n(deg)})" fill="${PAPER}" stroke="${INK}" stroke-width="${n(k.dw * 1.2)}"/>`;
      }
      s += petals;
      s += C(0, -17, 1.6, g.dense, k.dw);
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
    h: 27,
    w: 12,
    grip: { x: 0, y: -25.5 },
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
      s += P(`${M(-5, -9)}${Lto(-4.3, -0.8)}${Q(0, 0.4, 4.3, -0.8)}${Lto(5, -9)}Z`, PAPER, k.lw);
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
      let s = P(body, g.dark, k.lw);
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
      // a cloth peeking out
      s += P(`${M(-7, -10.5)}${Q(-4, -14.5, 0, -12)}${Q(4, -15, 7.5, -10.5)}Z`, g.check, k.dw);
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
    h: 21,
    w: 24,
    grip: { x: 0, y: -19.5 },
    draw: (k) => {
      const g = G(k.p);
      let s = L(`${M(-4.5, -13.5)}${Q(-4.5, -20.5, 0, -20.3)}${Q(4.5, -20.5, 4.5, -13.5)}`, k.lw * 1.5);
      const body = `${M(-9.5, -13)}${Lto(9.5, -13)}${Q(12, -6, 11, -1.6)}${Q(10.6, 0, 8.5, 0)}${Lto(-8.5, 0)}${Q(-10.6, 0, -11, -1.6)}${Q(-12, -6, -9.5, -13)}Z`;
      s += P(body, g.check, k.lw);
      if (!k.simple) {
        s += F(`${M(6.5, -12.6)}${Lto(9.5, -13)}${Q(12, -6, 11, -1.6)}${Q(10.6, 0, 8.5, 0)}${Lto(6.8, 0)}Z`, g.dark);
        s += P(body, "none", k.lw);
      }
      s += P(poly(-10, -14.4, 10, -14.4, 10, -12.6, -10, -12.6), g.gold, k.lw);
      s += C(-1.1, -15.2, 0.9, g.gold, k.dw) + C(1.1, -15.2, 0.9, g.gold, k.dw);
      return s;
    },
  },
  key: {
    h: 14,
    w: 7,
    grip: { x: 0, y: -11 },
    draw: (k) => {
      const g = G(k.p);
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
      const g = G(k.p);
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
        s += L(`${M(-8.2, -3.3)}${Lto(8.2, -3.3)}${M(-8.2, -0.9)}${Lto(8.2, -0.9)}`, k.dw * 0.6);
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
    h: 24,
    w: 54,
    grip: { x: -29, y: -14.5 },
    draw: (k) => {
      const g = G(k.p);
      let s = "";
      // handles + frame
      s += L(`${M(-30, -14.5)}${Lto(-13, -11)}${Lto(18, -7)}`, k.lw * 1.4);
      s += L(`${M(-9, -10.5)}${Lto(-10, -0.5)}${Lto(-12.5, -0.5)}`, k.lw * 1.2);
      s += P(poly(-31.5, -15.5, -26.5, -14.2, -26.8, -13, -31.8, -14.2), g.dark, k.dw);
      // tray
      const tray = `${M(-16, -22)}${Lto(22, -21)}${Lto(12.5, -9.6)}${Lto(-11.5, -10)}Z`;
      s += P(tray, PAPER, k.lw);
      if (!k.simple) {
        s += F(`${M(12.5, -9.6)}${Lto(22, -21)}${Lto(17, -21.1)}${Lto(8.5, -9.8)}Z`, g.dots);
        s += P(tray, "none", k.lw);
        s += L(`${M(-15, -20.2)}${Lto(20.5, -19.4)}`, k.dw);
      }
      // wheel
      s += C(18, -6, 6, PAPER, k.lw * 1.2);
      s += `<circle cx="18" cy="-6" r="4.6" fill="none" stroke="${INK}" stroke-width="${n(k.dw)}"/>`;
      if (!k.simple) {
        let spokes = "";
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI;
          spokes += `${M(18 + Math.cos(a) * 4.6, -6 + Math.sin(a) * 4.6)}${Lto(18 - Math.cos(a) * 4.6, -6 - Math.sin(a) * 4.6)}`;
        }
        s += L(spokes, k.dw * 0.8);
      }
      s += C(18, -6, 1.1, g.dark, k.dw);
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
      s += P(body, g.gold, k.lw);
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
      let s = P(cloth, PAPER, k.lw);
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
};

export function propSpec(prop: PropId): { h: number; w: number; grip: Point } {
  const s = SPECS[prop];
  if (!s) throw new Error(`unknown prop ${String(prop)}`);
  return { h: s.h, w: s.w, grip: s.grip };
}

export const props: PropModule = {
  nominalHeight(prop: PropId): number {
    return propSpec(prop).h;
  },
  draw(prop: PropId, lineWidth: number, ctx: DrawContext): PropDrawing {
    const spec = SPECS[prop];
    if (!spec) throw new Error(`unknown prop ${String(prop)}`);
    const lw = lineWidth > 0 ? lineWidth : 1;
    // detail survives only while the prop is several line-widths across
    const simple = Math.min(spec.h, spec.w) / lw < 7;
    const pen: Pen = { lw, dw: lw * 0.55, p: ctx.idPrefix, simple };
    const svg = `<g stroke-linejoin="round" stroke-linecap="round">${spec.draw(pen)}</g>`;
    return { svg, width: spec.w, height: spec.h, grip: { ...spec.grip } };
  },
};

export const PROP_IDS = PROPS;
