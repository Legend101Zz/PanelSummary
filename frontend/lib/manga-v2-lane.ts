/**
 * v2-architecture lane reader client (Session 6, ADR-009 consumer seam).
 *
 * Fetches the read-only `/manga-projects/{id}/v2/pages` endpoint: accepted
 * `composed_page` rows (latest per page, supersedes-aware) with their
 * `page_art` and ADR-009 `compiled_layout` parents. Types mirror the
 * promoted contracts in `@scrollstack/contracts` (composed_page.v1,
 * page_art.v1, compiled_layout.v1) — the frontend stays npm-managed and
 * outside the pnpm workspace, so the shapes are restated here narrowly.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface V2NormalizedPoint {
  x: number;
  y: number;
}

export interface V2CompiledPanel {
  panel_id: string;
  node_id: string;
  polygon: V2NormalizedPoint[];
  bbox: { x: number; y: number; width: number; height: number };
  clip_path: string;
  z_index: number;
  read_rank: number;
}

export interface V2CompiledLayout {
  schema_version: string;
  page_plan_id: string;
  layout_engine_version: string;
  compiler_hash: string;
  panels: V2CompiledPanel[];
}

export interface V2ComposedPageContent {
  schema_version: string;
  page_plan_id: string;
  page_index: number;
  has_art: boolean;
  lettering: string;
  text_element_count: number;
  page_art_artifact_id?: string | null;
  composition_version?: string | null;
  image_content_hash?: string | null;
}

export interface V2ReaderPage {
  page_index: number;
  /** Null when the page has accepted art but no composed row yet (the
   * Session 7 fallback: raw page_art serves instead of a 404). */
  composed: {
    artifact_id: string;
    schema_version: string;
    content: V2ComposedPageContent;
    image_url: string | null;
    supersedes_artifact_id: string | null;
  } | null;
  page_art: {
    artifact_id: string;
    image_url: string | null;
    rendering_mode: string | null;
    gates_accepted: boolean;
  } | null;
  compiled_layout: V2CompiledLayout | null;
}

export interface V2ReaderPagesResponse {
  project_id: string;
  pages: V2ReaderPage[];
}

/** Feature flag: the v2-lane reader ships default-OFF (owner rule — the
 * legacy path stays the only default reader until owner-confirmed). */
export function isV2LaneReaderEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MANGA_V2_LANE_READER === "1";
}

export async function listV2LanePages(
  projectId: string,
): Promise<V2ReaderPagesResponse> {
  const response = await fetch(
    `${API_URL}/manga-projects/${encodeURIComponent(projectId)}/v2/pages`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(`v2 pages request failed: HTTP ${response.status}`);
  }
  return (await response.json()) as V2ReaderPagesResponse;
}

export function v2MediaUrl(imageUrl: string | null): string | null {
  return imageUrl ? `${API_URL}${imageUrl}` : null;
}

/** RTL reading order: compiled read ranks are authoritative (ADR-009 —
 * the compiler serialized the Z-path; the reader must never re-derive
 * order from geometry). */
export function panelsInReadingOrder(
  layout: V2CompiledLayout | null,
): V2CompiledPanel[] {
  if (!layout) return [];
  return [...layout.panels].sort((a, b) => a.read_rank - b.read_rank);
}

/** Page-normalized polygon -> SVG points attribute in a 0..100 viewBox. */
export function polygonPoints(panel: V2CompiledPanel): string {
  return panel.polygon
    .map((point) => `${(point.x * 100).toFixed(2)},${(point.y * 100).toFixed(2)}`)
    .join(" ");
}
