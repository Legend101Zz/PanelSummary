/**
 * @panelsummary/manga-render — deterministic manga page renderer.
 * The PNG rasteriser is a separate entry ("@panelsummary/manga-render/raster").
 */
export * from "./contracts.js";
export { renderPage, renderPageDetailed, isAcceptable, RENDERER_VERSION, type RenderOptions, type PanelDetail } from "./render.js";
export { validatePage, validateUnderstanding, validatePlan, WORD_LIMITS, type BookRefs } from "./validate/index.js";
export { catalog, REPRESENTATIVE_LOOKS, SHOT_GUIDE, TEXT_KIND_GUIDE, type Catalog } from "./catalog.js";
export {
  compileLayout,
  validateTree,
  TEMPLATES,
  findTemplate,
  templatesWithSlots,
  type CompiledLayout,
  type CompiledPanel,
  type LayoutTemplate,
} from "./layout/index.js";
export { castCapabilities, type CastCapability } from "./capabilities.js";
