/** Bundled OFL fonts. The same files are served to the reader at /fonts/. */
import { fileURLToPath } from "node:url";
import path from "node:path";

export const FONT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fonts");

/** CSS font-family names used in rendered SVG. */
export const FONT_FAMILY = {
  dialogue: "PS Comic",
  sfx: "PS Bangers",
} as const;

export const FONT_FILES = {
  regular: path.join(FONT_DIR, "ComicNeue-Regular.ttf"),
  bold: path.join(FONT_DIR, "ComicNeue-Bold.ttf"),
  italic: path.join(FONT_DIR, "ComicNeue-Italic.ttf"),
  boldItalic: path.join(FONT_DIR, "ComicNeue-BoldItalic.ttf"),
  sfx: path.join(FONT_DIR, "Bangers-Regular.ttf"),
} as const;
