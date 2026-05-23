# Book-Reel Agent Guide

## Current Product

Book-Reel, also called PanelSummary in code and UI, turns a parsed PDF into a
source-grounded manga adaptation. The active product path is:

```text
upload PDF
  -> parse book
  -> create manga project
  -> run book understanding
  -> generate source slice
  -> persist RenderedPage docs
  -> read in frontend manga reader
```

Legacy summary, living-panel, and reel surfaces are not active product surfaces.

## Renderer Diagnosis

Read this first:

- `docs/renderer-analysis/findings.md`
- `docs/renderer-analysis/sample-dsl.json`
- `docs/renderer-analysis/experiments/README.md`

Verdict: the content/image pipeline is not the blocker. The renderer contract
and frontend presentation are the blocker.

The stored DSL has useful storyboard intent and page composition. The frontend
currently honors only a narrow layout contract and renders generated character
assets as dialogue avatars, not positioned scene sprites.

## Render Path

Backend:

- `backend/app/manga_pipeline/stages/storyboard_stage.py`
  - LLM-authored `StoryboardPage` and `StoryboardPanel`.
- `backend/app/manga_pipeline/stages/page_composition_stage.py`
  - LLM-authored `PageComposition`.
- `backend/app/domain/manga/page_composition.py`
  - Composition contract: `gutter_grid`, `panel_order`,
    `page_turn_panel_id`, `panel_emphasis_overrides`, `composition_notes`.
- `backend/app/domain/manga/render_view.py`
  - Wire contract: `RenderedPage`.
- `backend/app/manga_pipeline/stages/rendered_page_assembly_stage.py`
  - Zips storyboard plus composition into `RenderedPage`.
- `backend/app/services/manga/generation_service.py`
  - Persists `MangaSliceDoc`, `MangaPageDoc.rendered_page`, and assets.
- `backend/app/api/routes/manga_projects.py`
  - Serves pages and assets to the frontend.

Frontend:

- `frontend/app/books/[id]/manga/v2/page.tsx`
  - Loads project/pages/slices/assets and renders `MangaPageRenderer`.
- `frontend/lib/types.ts`
  - TypeScript mirror of the backend `RenderedPage` contract.
- `frontend/components/MangaReader/page_layout.ts`
  - Maps `PageComposition` to rows/cells.
- `frontend/components/MangaReader/MangaPageRenderer.tsx`
  - Builds page rows and panel wrappers.
- `frontend/components/MangaReader/MangaPanelRenderer.tsx`
  - Chooses panel subrenderer and uses `panel_artifacts.image_path` as backdrop.
- `frontend/components/MangaReader/panels/DialoguePanel.tsx`
  - Renders character assets as small circular avatars in dialogue rows.

## Gotchas

- `image_mode: "sprites_only"` creates reusable character assets. It does not
  populate `panel_artifacts.*.image_path`.
- The current frontend ignores `sprite_layers`, `bubble_placement`,
  `row_heights_pct`, `gutter_px`, `bleed`, and panel placement fields if they
  are added to JSON by hand.
- `page_layout.ts` hard-codes equal row heights with `1fr`.
- `derived_visuals.ts` always returns the same `dramatic-dark` palette.
- Some stored composition pages already have QA warnings for narrow page-turn
  cells. Do not confuse that upstream defect with the sprite placement bug.
- For Book-Reel backend debugging, start with `/tmp/panelsummary-celery.log`.

## Implementation Conventions

- Keep content generation out of renderer fixes.
- Treat `RenderedPage` as the contract boundary.
- Update backend Pydantic models and frontend TypeScript mirrors together.
- Keep legacy fallback behavior for existing pages that only have `gutter_grid`.
- Every visual renderer change needs before/after screenshots.

