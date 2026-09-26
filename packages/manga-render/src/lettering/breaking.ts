/**
 * Balanced line breaking. Finds the fewest lines that fit `maxWidth`, then the
 * narrowest width that still needs only that many lines, then the break that
 * minimises raggedness against a target profile ("lens" for round balloons —
 * middle lines longest — or "flat" for boxes). Words are only split when a
 * single word is wider than the whole line.
 */

export type LineProfile = "lens" | "flat";

export interface LineBlock {
  lines: string[];
  widths: number[];
  /** Widest line. */
  width: number;
}

interface Token {
  text: string;
  width: number;
  /** Joins to the previous token without a space (pieces of a split word). */
  glued: boolean;
}

export type Measure = (text: string) => number;

function tokenize(text: string, maxWidth: number, measure: Measure): Token[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const tokens: Token[] = [];
  for (const word of words) {
    const w = measure(word);
    if (w <= maxWidth) {
      tokens.push({ text: word, width: w, glued: false });
      continue;
    }
    // Split an over-long word into hyphenated pieces that each fit.
    const chars = Array.from(word);
    let piece = "";
    let first = true;
    for (let i = 0; i < chars.length; i += 1) {
      const next = piece + chars[i];
      const isLast = i === chars.length - 1;
      const candidate = isLast ? next : `${next}-`;
      if (piece.length > 0 && measure(candidate) > maxWidth) {
        tokens.push({ text: `${piece}-`, width: measure(`${piece}-`), glued: !first });
        first = false;
        piece = chars[i];
      } else {
        piece = next;
      }
    }
    if (piece.length > 0) tokens.push({ text: piece, width: measure(piece), glued: !first });
  }
  return tokens;
}

function joinTokens(tokens: readonly Token[]): string {
  let s = "";
  tokens.forEach((t, i) => {
    s += i === 0 || t.glued ? t.text : ` ${t.text}`;
  });
  return s;
}

function greedyCount(tokens: readonly Token[], width: number, space: number): number {
  let lines = 1;
  let cur = 0;
  let empty = true;
  for (const t of tokens) {
    const add = empty ? t.width : t.glued ? t.width : space + t.width;
    if (!empty && cur + add > width + 1e-6) {
      lines += 1;
      cur = t.width;
    } else {
      cur += add;
    }
    empty = false;
  }
  return lines;
}

/**
 * Break `text` into balanced lines no wider than `maxWidth`.
 * Returns null only for empty text.
 */
export function breakBalanced(text: string, maxWidth: number, measure: Measure, profile: LineProfile = "lens"): LineBlock | null {
  const tokens = tokenize(text, maxWidth, measure);
  if (tokens.length === 0) return null;
  const space = measure(" ") || measure("n") * 0.5;
  const widest = Math.max(...tokens.map((t) => t.width));
  const k = greedyCount(tokens, maxWidth, space);

  // narrowest width that keeps k lines
  let lo = widest;
  let hi = Math.max(maxWidth, widest);
  for (let it = 0; it < 24; it += 1) {
    const mid = (lo + hi) / 2;
    if (greedyCount(tokens, mid, space) <= k) hi = mid;
    else lo = mid;
  }
  const width = Math.min(Math.max(maxWidth, widest), hi * (profile === "lens" ? 1.1 : 1.02));

  // prefix widths for O(1) line width
  const n = tokens.length;
  const lineWidth = (i: number, j: number): number => {
    // tokens i..j-1
    let w = 0;
    for (let t = i; t < j; t += 1) w += tokens[t].width + (t > i && !tokens[t].glued ? space : 0);
    return w;
  };
  const target = (line: number): number => {
    if (profile === "flat" || k === 1) return width;
    const t = (line - (k - 1) / 2) / ((k - 1) / 2); // -1..1
    const mid = Math.sqrt(1 - 0.5 * t * t);
    return width * mid;
  };
  // dp[l][j] = min cost to set tokens[0..j) in l lines
  const INF = Number.POSITIVE_INFINITY;
  const dp: number[][] = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(INF));
  const from: number[][] = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(-1));
  dp[0][0] = 0;
  for (let l = 1; l <= k; l += 1) {
    for (let j = 1; j <= n; j += 1) {
      for (let i = j - 1; i >= 0; i -= 1) {
        if (dp[l - 1][i] === INF) continue;
        const w = lineWidth(i, j);
        if (w > width + 1e-6) break;
        const d = target(l - 1) - w;
        // widows: a line holding a single word reads as a stutter (craft A5.7)
        const widow = k > 1 && n >= 4 && j - i === 1 ? (width * 0.45) ** 2 : 0;
        const cost = dp[l - 1][i] + d * d + widow;
        if (cost < dp[l][j]) {
          dp[l][j] = cost;
          from[l][j] = i;
        }
      }
    }
  }
  let lines: string[];
  if (dp[k][n] === INF) {
    // Fallback: greedy at maxWidth (should not happen).
    lines = [];
    let cur: Token[] = [];
    let w = 0;
    for (const t of tokens) {
      const add = cur.length === 0 ? t.width : t.glued ? t.width : space + t.width;
      if (cur.length > 0 && w + add > maxWidth) {
        lines.push(joinTokens(cur));
        cur = [t];
        w = t.width;
      } else {
        cur.push(t);
        w += add;
      }
    }
    if (cur.length) lines.push(joinTokens(cur));
  } else {
    const cuts: number[] = [];
    let j = n;
    for (let l = k; l > 0; l -= 1) {
      cuts.push(j);
      j = from[l][j];
    }
    cuts.reverse();
    lines = [];
    let start = 0;
    for (const end of cuts) {
      lines.push(joinTokens(tokens.slice(start, end)));
      start = end;
    }
  }
  const widths = lines.map((l) => measure(l));
  return { lines, widths, width: Math.max(...widths) };
}

/** Word count used by every word limit (whitespace-separated tokens). */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
