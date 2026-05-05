/**
 * MangaReader — public API
 * ==========================
 * Expose only what the v2 reader page needs. Internal helpers
 * (derived_visuals, page_layout, asset_lookup, chrome/*) stay
 * module-local so a future refactor can move them without breaking
 * external callers.
 */

export { MangaPageRenderer } from "./MangaPageRenderer";
export { MangaPanelRenderer } from "./MangaPanelRenderer";
export type { MangaCharacterAsset } from "./asset_lookup";
export type { MangaPalette, PaletteKey, Emphasis, PanelKind } from "./types";
