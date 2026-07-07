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

## Current Diagnosis (2026-07-05)

Read this first:

- `docs/analysis/SHORTCOMINGS_AND_VISUAL_UPGRADE.md` — current baseline:
  shortcoming catalog (A: text density/formatting, B: visual/sprites,
  C: orchestration/providers), manga-craft benchmarks, phased upgrade plan.
- `docs/renderer-analysis/findings.md` — 2026-05-23 renderer evidence (history).
- `docs/renderer-analysis/sample-dsl.json`

Verdict (supersedes the 2026-05-23 "renderer is the blocker" framing): the
skeleton (contracts, budgets, image modes) is sound, but the rendered page
still reads as text cards, not manga. Three compounding failures: (1) 2-3x too
much text and the renderer demotes dialogue to `speaker: text` caption strips,
(2) the sprite bank rarely reaches the page (reference sheets excluded, white
backgrounds, compositor never sees the asset manifest), (3) no synthetic/vector
art layer for unpainted panels. Manga craft targets: <=25 words/panel (ideal
<=12), ~60 words/page, narration sparse, SFX as drawn lettering.

The 2026-05-23 renderer pass expanded the contract and frontend so explicit
panel boxes, row heights, gutters, sprite layers, and bubble placements are
honored when present; old stored pages still need heuristic sprite/bubble
fallback until pages are regenerated with the new fields.

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
- `SceneSprites.tsx` returns `null` for `asset_type === "reference_sheet"`, so
  characters whose only asset is a reference sheet never appear on the page.
- `page_composition_stage` authors `sprite_layers`/`bubble_placements` but its
  prompt payload contains no asset manifest — it references expressions blind,
  and the renderer silently omits missing ones. Its `max_tokens` (4000) is also
  tight for 5-8 pages of geometry; truncation falls back to legacy layout.
- For Book-Reel backend debugging, start with `/tmp/panelsummary-celery.log`.

## Providers

- Text LLM: `backend/app/llm_client.py` supports `openai` and `openrouter`.
  `MINIMAX_API_KEY` exists in `backend/.env` but is NOT wired yet — MiniMax is
  OpenAI-SDK-compatible (`base_url https://api.minimax.io/v1`, MiniMax-M2.x/M3
  models incl. highspeed) and is the intended cheap drafting lane.
- Images: OpenRouter only (`backend/app/image_generator.py`). It predates the
  unified image API — no `background: "transparent"` support and reference
  images are gated to Gemini models. `openai/gpt-image-1` (native transparency,
  up to 16 reference images) is the intended sprite upgrade path.
- Image budgets (`none | sprites_only | budgeted | full_panel_art`, default
  budgeted: 8 sprites + <=3 key panels/slice) are product policy. Do not add
  per-panel paid rendering to default paths.

## Implementation Conventions

- Keep content generation out of renderer fixes.
- Treat `RenderedPage` as the contract boundary.
- Update backend Pydantic models and frontend TypeScript mirrors together.
- Keep legacy fallback behavior for existing pages that only have `gutter_grid`.
- Every visual renderer change needs before/after screenshots.

## Documentation And Note Tracking

- Use `docs/next-prompt.md` as the paste-ready prompt for the next implementation agent
  (recreated 2026-07-05 for the visual-upgrade phase).
- Use `NEXT_SESSION.md` as the living implementation log and handoff. It was deleted
  during a past cleanup — the next implementation session should recreate it. Update it
  while work is happening, not only at the end.
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
