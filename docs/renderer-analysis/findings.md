# Manga Renderer Analysis Findings

Date: 2026-05-23

Scope: rendering and presentation only. Content generation, text quality, and image
generation were treated as known-good and were not changed.

## Executive Verdict

The bottleneck is the renderer contract and frontend presentation layer, not the
story/content pipeline.

The stored DSL already contains useful storyboard intent, panel order, source
facts, character ids, and per-page composition grids. The live renderer consumes
only a narrow subset of that data: column percentages, panel order, page-turn id,
and emphasis overrides. Richer geometry, bubble placement, sprite anchors, and
z-index fields added to the stored page JSON were ignored byte-for-byte by the
browser output.

The sprite-over-icon bug is a DSL-to-render mapping problem: character assets
exist in Mongo, but the reader currently uses them as small chat-style avatars
inside dialogue rows, not as positioned scene sprites.

## Real Data Sample

The real MongoDB sample for this book/project is saved at:

- `docs/renderer-analysis/sample-dsl.json`

Export details:

- database: `panelsummary`
- book: `6a0b5a11201a8d03f1d82501`
- project: `6a0b5a5b201a8d03f1d82503`
- pages: 11
- slices: 1
- character assets: 8
- project image mode: `sprites_only`
- persisted panel artifact images: 0

Important implication: the project has generated character assets, but the
persisted `RenderedPage.panel_artifacts` have no `image_path` values. The reader
therefore has no full-panel art backdrops for this project. It only has
character assets available to the frontend reader.

## Render Path Map

1. Storyboard DSL is produced in `backend/app/manga_pipeline/stages/storyboard_stage.py`.
   The prompt asks for page rhythm, panel composition, shot variety, reader flow,
   dialogue placement, `character_ids`, and source grounding. See
   `storyboard_stage.py:21-52` and `storyboard_stage.py:101-115`.

2. Page composition is produced in
   `backend/app/manga_pipeline/stages/page_composition_stage.py`.
   The supported composition vocabulary is `gutter_grid`,
   `panel_order`, `page_turn_panel_id`, `panel_emphasis_overrides`, and
   `composition_notes`. See `page_composition_stage.py:54-86` and
   `page_composition.py:72-103`.

3. The production stage order is assembled in
   `backend/app/services/manga/generation_service.py`. Composition runs after
   storyboard repair and before `rendered_page_assembly_stage`; then optional
   panel rendering only runs when full panel rendering is enabled. See
   `generation_service.py:207-245`.

4. `rendered_page_assembly_stage` combines each `StoryboardPage` with the
   matching `PageComposition` and empty per-panel artifact slots. See
   `backend/app/manga_pipeline/stages/rendered_page_assembly_stage.py:31-51`.

5. Persistence writes:
   - `MangaSliceDoc.storyboard_pages`
   - `MangaSliceDoc.quality_report`
   - `MangaPageDoc.rendered_page`
   - `MangaAssetDoc` rows

   See `backend/app/manga_models.py:72-123`, `backend/app/manga_models.py:129-170`,
   and `backend/app/services/manga/generation_service.py:480-515`.

6. The API exposes the stored contract unchanged through:
   - `GET /manga-projects/{project_id}/pages`
   - `GET /manga-projects/{project_id}/assets`

   See `backend/app/api/routes/manga_projects.py:228-244`,
   `manga_projects.py:384-391`, and `manga_projects.py:394-435`.

7. The frontend route loads project, pages, slices, and assets in parallel,
   narrows `rendered_page`, maps assets to `MangaCharacterAsset`, and renders
   `MangaPageRenderer`. See `frontend/app/books/[id]/manga/v2/page.tsx:67-140`
   and `page.tsx:211-217`.

8. The page layout engine reads only `composition.gutter_grid`,
   `panel_order`, `page_turn_panel_id`, and `panel_emphasis_overrides`.
   It hard-codes equal row heights with `gridTemplateRows: ... "1fr"`.
   See `frontend/components/MangaReader/page_layout.ts:162-215`.

9. Panel rendering uses `PanelRenderArtifact.image_path` only as a full-panel
   painted backdrop. Character assets are handed to `DialoguePanel`, which shows
   them as 40x40 circular avatars next to speech bubbles. See
   `MangaPanelRenderer.tsx:76-150`, `PaintedPanelBackdrop.tsx:32-48`, and
   `DialoguePanel.tsx:78-176`.

## Defect List

| Defect | Layer | Evidence | Code reference |
|---|---|---|---|
| Generated sprites render like chat avatars beside dialogue instead of as characters in the panel scene. | B: engine misinterprets present fields | The DB has 8 `MangaAssetDoc` images and page panels carry `character_ids`, but the visible reader shows a small circular Michael image in the dialogue row. Adding explicit `sprite_layers`, `bbox_pct`, and `z_index` fields produced a byte-identical screenshot. | `DialoguePanel.tsx:101-129` renders the asset in a fixed `w-10 h-10 rounded-full` avatar. `MangaPanelRenderer.tsx:91-100` passes assets only into the dialogue subrenderer. |
| The page does not read like a manga page; it reads like dark UI cards on paper. | C: frontend styling/layout/typography | Baseline screenshot shows uniform dark panels, large blank paper zones, centered text blocks, and chat-style bubbles. The stored DSL has real panel composition, but the renderer uses equal row heights and one palette. | `page_layout.ts:191-197` hard-codes equal rows and gap. `derived_visuals.ts:141-144` always returns `dramatic-dark`. `MangaPanelRenderer.tsx:117-150` uses uniform panel border/background treatment. |
| Many page-turn cells are too narrow. | A: LLM-authored composition is wrong | The real slice quality report includes 10 `DSL_RTL_PAGE_TURN_NARROW` warnings. Pages 2-11 put the page-turn panel in 30 percent or 20 percent cells. | The validator warning comes from `manga_dsl.py` and is persisted in `sample-dsl.json` under `manga_slices[0].quality_report.issues`. |
| Rich layout concepts such as row heights, bleed, gutter size, panel placement, bubble placement, and sprite z-order have no effect. | B: engine ignores fields that are present | Experiment 02 added `row_heights_pct`, `gutter_px`, `bleed_edges`, and `panel_placements`. Experiment 03 added `sprite_layers`, `bubble_placement`, `layer_order`, and `camera`. Both screenshots had the same SHA-256 as baseline. | `frontend/lib/types.ts:334-401` does not mirror those fields. `page_layout.ts:162-215` reads only `gutter_grid` and order fields. `DialoguePanel.tsx:147-162` hard-codes bubble sizing and tail offset. |
| Character assets are wasted on non-dialogue panels. | B: engine ignores available assets outside dialogue | Panels such as p01_01 list multiple visual characters, and assets exist, but non-dialogue renderers receive no sprite layer and show text-only/synthetic panels. | `derivePanelKind` sends non-dialogue panels to `ConceptPanel`, `NarrationPanel`, or `TransitionPanel`; only `DialoguePanel` receives and renders asset images. See `derived_visuals.ts:50-63` and `MangaPanelRenderer.tsx:91-108`. |

## Experiment Evidence

Screenshots and captions live in `docs/renderer-analysis/experiments/`.

Hash evidence:

```text
9d9cd38fc3a288ba1a833adc93dc23fd820469c347b1b7a6e22b10ebc125e04f  00-baseline-live-reader-viewport.png
6429dc48e48c477d1dbf1bcf9475b1d667668a101353675b0549ec4122e25739  01-supported-grid-reflow.png
9d9cd38fc3a288ba1a833adc93dc23fd820469c347b1b7a6e22b10ebc125e04f  02-ignored-rich-layout-fields.png
9d9cd38fc3a288ba1a833adc93dc23fd820469c347b1b7a6e22b10ebc125e04f  03-ignored-sprite-bubble-fields.png
435e0533bc280397d862eec65b88502a463c05c7eaba0900b34d0c7bf8d01c63  04-artifact-backdrop-from-sprite.png
9d9cd38fc3a288ba1a833adc93dc23fd820469c347b1b7a6e22b10ebc125e04f  99-restored-baseline-check.png
```

Interpretation:

- Supported grid fields do change the page. The renderer is not completely
  disconnected from DSL.
- Unsupported rich layout and sprite fields are ignored exactly.
- Setting `panel_artifacts.p01_05.image_path` does change pixels, proving the
  only image channel the panel renderer honors today is a full-panel backdrop.
- The original MongoDB row was restored and verified after experiments.

## Bottleneck Verdict

The failure is not "the LLM forgot how to write manga." The real blocker is that
the current renderer contract is too small, and the frontend visual system is
still a V4/card-style reader.

More precise split:

- Primary bottleneck: B, the DSL-to-render mapping lacks sprite layers, bubble
  placement, row heights, bleed, and z-index support.
- Secondary bottleneck: C, the frontend renders the supported fields with weak
  manga presentation.
- Upstream issue: A, the current composition agent sometimes authors narrow
  page-turn cells, but that is already visible in QA warnings and is not the
  reason sprite placement fails.

## Architecture Recommendation

Recommendation: yes, add a dedicated layout/DSL agent, but only after expanding
the schema and renderer to consume the fields it emits. A prompt-only layout
agent would not fix the current bug because the frontend ignores the necessary
fields today.

Suggested target architecture:

```text
storyboard_stage
  -> layout_dsl_agent
       owns: row heights, gutters, bleed, panel boxes, sprite layers,
             bubble boxes, SFX boxes, z-order, reading-order validation
  -> layout_validation_stage
       checks: panels all placed, page-turn visual weight, bubbles inside
               panels, sprites not hidden by bubbles, RTL order
  -> rendered_page_assembly_stage
       persists RenderedPage with layout + panel_artifacts + asset refs
  -> MangaPageRenderer
       renders the explicit layout contract without inventing placement
```

The layout agent should not rewrite story, dialogue, facts, or image prompts.
It should be a compositor: it receives settled storyboard pages plus available
asset metadata and returns a renderable page layout plan.

## Implementation Handoff

Implement in this order:

1. Extend the backend domain contract with explicit render layout fields:
   row heights, gutter pixels, panel boxes, bubble boxes, sprite layers, z-order,
   and optional bleed.
2. Update frontend TypeScript mirrors and renderer code to consume those fields.
3. Replace chat-avatar sprite rendering with scene-layer sprite rendering.
4. Keep a graceful fallback for legacy pages that only have `gutter_grid`.
5. Add a layout/DSL agent once the renderer can honor its output.
6. Validate every step with before/after screenshots against this same project.

