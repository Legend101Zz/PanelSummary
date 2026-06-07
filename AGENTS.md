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

The stored DSL has useful storyboard intent and page composition. The original
frontend honored only a narrow layout contract and rendered generated character
assets as dialogue avatars. The 2026-05-23 renderer pass expanded the contract
and frontend so explicit panel boxes, row heights, gutters, sprite layers, and
bubble placements can be honored when present; old stored pages still need
heuristic sprite/bubble fallback until a layout compositor authors the new fields.

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
  - Maps `PageComposition` to explicit panel boxes when present, otherwise
    composition rows/cells, otherwise legacy fallback.
- `frontend/components/MangaReader/MangaPageRenderer.tsx`
  - Builds page rows/panel wrappers and passes sprite/bubble layer data down.
- `frontend/components/MangaReader/MangaPanelRenderer.tsx`
  - Chooses panel subrenderer, preserves `panel_artifacts.image_path` as backdrop,
    and renders scene sprite layers.
- `frontend/components/MangaReader/panels/DialoguePanel.tsx`
  - Renders placed speech bubbles; generated sprites are no longer dialogue-avatar
    chrome in the main reader path.

## Gotchas

- `image_mode: "sprites_only"` creates reusable character assets. It does not
  populate `panel_artifacts.*.image_path`.
- Experiment screenshots under `docs/renderer-analysis/experiments/` prove the
  old frontend ignored `sprite_layers`, `bubble_placement`, `row_heights_pct`,
  `gutter_px`, `bleed`, and panel placement fields. Current code consumes the
  expanded `PageComposition` fields, but old stored DB rows still lack them.
- `page_layout.ts` uses `row_heights_pct`/`gutter_px` when present and falls back
  to equal rows for legacy `gutter_grid` pages.
- `derived_visuals.ts` now varies palette keys by panel purpose; do not assume the
  old single `dramatic-dark` behavior.
- Some stored composition pages already have QA warnings for narrow page-turn
  cells. Do not confuse that upstream defect with the sprite placement bug.
- For Book-Reel backend debugging, start with `/tmp/panelsummary-celery.log`.

## Implementation Conventions

- Keep content generation out of renderer fixes.
- Treat `RenderedPage` as the contract boundary.
- Update backend Pydantic models and frontend TypeScript mirrors together.
- Keep legacy fallback behavior for existing pages that only have `gutter_grid`.
- Every visual renderer change needs before/after screenshots.

## Documentation And Note Tracking

- Use `docs/next-prompt.md` as the paste-ready prompt for the next implementation agent.
- Use `NEXT_SESSION.md` as the living implementation log and handoff. Update it while work is happening, not only at the end.
- After each meaningful phase, record in `NEXT_SESSION.md`: files changed, screenshots captured, commands/tests run, current blockers, open risks, and the next concrete step.
- Keep `/docs` synchronized with implementation reality. If renderer behavior, DSL fields, or architecture changes, update the relevant docs in the same session.
- Treat `docs/renderer-analysis/findings.md` as the evidence baseline. Amend it only when new evidence changes the diagnosis; use `NEXT_SESSION.md` for running progress notes.
- Do not leave contradictory handoff files behind. If a future `NEXT_STEPS.md` is created, make clear whether it supersedes or points back to `NEXT_SESSION.md`.

## Optional Sub-Agent Use

- Sub-agents are useful only for bounded, parallel work with disjoint ownership. The main agent owns integration and final verification.
- Suggested split if the environment supports sub-agents:
  - Backend contract agent: owns `backend/app/domain/manga/*`, DSL schema/prompt contract, persistence compatibility, and backend tests.
  - Frontend renderer agent: owns `frontend/lib/types.ts` and `frontend/components/MangaReader/*`, including layout, typography, bubbles, sprites, and z-order behavior.
  - Verification/docs agent: owns browser screenshots, experiment evidence, `NEXT_SESSION.md`, and docs updates under `/docs`.
- Each sub-agent must report changed file paths, commands/tests run, screenshots/evidence produced, and unresolved risks.
- Avoid overlapping writes between agents unless the main agent coordinates the merge explicitly.
