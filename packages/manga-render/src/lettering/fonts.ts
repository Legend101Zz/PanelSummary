/**
 * Text measurement with opentype.js against the bundled TTFs, so line
 * breaking and balloon sizes match what the reader and the rasteriser draw.
 * Parsed fonts are cached per process (read-only, so this is not page state).
 */
import { readFileSync } from "node:fs";
import opentype from "opentype.js";
import { FONT_FAMILY, FONT_FILES } from "../fonts.js";

export type FontFace = keyof typeof FONT_FILES;

const cache = new Map<FontFace, opentype.Font>();

function load(face: FontFace): opentype.Font {
  const hit = cache.get(face);
  if (hit) return hit;
  const buf = readFileSync(FONT_FILES[face]);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  cache.set(face, font);
  return font;
}

/**
 * Characters of `text` the face has no glyph for (they would draw as the
 * font's empty box). opentype's hasChar() cannot be used: it reports true
 * for characters that map to .notdef.
 */
export function missingChars(text: string, face: FontFace): string[] {
  const font = load(face);
  const out: string[] = [];
  for (const ch of text) {
    if (/\s/.test(ch) || out.includes(ch)) continue;
    if (font.charToGlyphIndex(ch) === 0) out.push(ch);
  }
  return out;
}

export interface FontMetrics {
  ascent: number;
  descent: number;
  capHeight: number;
}

/** Width of `text` in page units at `size`, with kerning. */
export function measure(text: string, face: FontFace, size: number): number {
  if (text.length === 0) return 0;
  return load(face).getAdvanceWidth(text, size, { kerning: true });
}

export function metrics(face: FontFace, size: number): FontMetrics {
  const font = load(face);
  const scale = size / font.unitsPerEm;
  const os2 = (font.tables as Record<string, { sCapHeight?: number } | undefined>).os2;
  const cap = os2?.sCapHeight && os2.sCapHeight > 0 ? os2.sCapHeight : font.ascender * 0.72;
  return { ascent: font.ascender * scale, descent: -font.descender * scale, capHeight: cap * scale };
}

/** SVG attributes for a face (family, weight, style). */
export function faceAttrs(face: FontFace): { family: string; weight?: string; style?: string } {
  switch (face) {
    case "regular":
      return { family: FONT_FAMILY.dialogue };
    case "bold":
      return { family: FONT_FAMILY.dialogue, weight: "700" };
    case "italic":
      return { family: FONT_FAMILY.dialogue, style: "italic" };
    case "boldItalic":
      return { family: FONT_FAMILY.dialogue, weight: "700", style: "italic" };
    case "sfx":
      return { family: FONT_FAMILY.sfx };
  }
}
