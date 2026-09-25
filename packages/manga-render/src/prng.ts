/** Deterministic helpers: string hashing and a seeded PRNG (mulberry32). */

export function hashString(value: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seeded(...parts: Array<string | number>): () => number {
  return mulberry32(hashString(parts.join("|")));
}

/** Uniform in [min, max). */
export function between(rand: () => number, min: number, max: number): number {
  return min + (max - min) * rand();
}
