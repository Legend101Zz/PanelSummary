/**
 * Node-only PNG rasteriser for previews (MiniMax vision critique, contact
 * sheets, acceptance screenshots). Uses the same bundled fonts as the reader.
 */
import { Resvg } from "@resvg/resvg-js";
import { FONT_FAMILY, FONT_FILES } from "./fonts.js";

export interface RasterOptions {
  /** Output width in pixels (height follows the SVG aspect ratio). */
  width?: number;
  background?: string;
}

export function svgToPng(svg: string, options: RasterOptions = {}): Buffer {
  // resvg matches families by the font's internal name, so map our CSS
  // family aliases back to the real family names before rendering.
  const normalized = svg
    .replaceAll(`'${FONT_FAMILY.dialogue}'`, "'Comic Neue'")
    .replaceAll(`"${FONT_FAMILY.dialogue}"`, '"Comic Neue"')
    .replaceAll(FONT_FAMILY.dialogue, "Comic Neue")
    .replaceAll(`'${FONT_FAMILY.sfx}'`, "'Bangers'")
    .replaceAll(`"${FONT_FAMILY.sfx}"`, '"Bangers"')
    .replaceAll(FONT_FAMILY.sfx, "Bangers");
  const resvg = new Resvg(normalized, {
    fitTo: options.width ? { mode: "width", value: options.width } : { mode: "original" },
    background: options.background,
    font: {
      loadSystemFonts: false,
      fontFiles: Object.values(FONT_FILES),
      defaultFontFamily: "Comic Neue",
    },
  });
  return resvg.render().asPng();
}
