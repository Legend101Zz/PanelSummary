/**
 * utils/fonts.ts — Google Fonts loader for Remotion
 * Loads fonts at render time so they're available in headless Chrome.
 */

const LOADED_FONTS = new Set<string>();

/**
 * Generate a Google Fonts CSS import URL for the given font families.
 */
export function googleFontsUrl(fonts: string[]): string {
  const families = fonts
    .map((f) => f.replace(/ /g, "+"))
    .map((f) => `family=${f}:wght@300;400;500;600;700;800;900`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

/**
 * Inject a <link> tag for Google Fonts (idempotent).
 */
export function loadFonts(fonts: string[]): void {
  if (typeof document === "undefined") return;

  const key = fonts.sort().join(",");
  if (LOADED_FONTS.has(key)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = googleFontsUrl(fonts);
  document.head.appendChild(link);

  LOADED_FONTS.add(key);
}
