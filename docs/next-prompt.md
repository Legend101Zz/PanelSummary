# Mission: Implement the Manga Renderer Fixes in Book-Reel

Root: `/Users/comreton/Desktop/Book-Reel`

Use this file as the paste-ready prompt for the next implementation agent.
Use root `NEXT_SESSION.md` as the living progress log and handoff while the work is
happening. There is currently no root `NEXT_STEPS.md`; do not route the next agent
through one unless it is deliberately created later and made consistent with these
docs.

Read first:

- `docs/renderer-analysis/findings.md`
- `docs/renderer-analysis/sample-dsl.json`
- `docs/renderer-analysis/experiments/README.md`
- root `CLAUDE.md`
- root `agent.md`

Trust the verdict in `findings.md`: the bottleneck is the renderer contract and
frontend presentation, not story/content/image generation.

## Commit Discipline

- Start with `git status --short`.
- Commit after each meaningful unit of implementation.
- Keep commits small and named after the behavior they change.
- Save before/after screenshots for every visual fix.
- Update `NEXT_SESSION.md` as the running handoff after each phase.

## Documentation / Note Tracking Rules

Keep a running note trail as part of the work:

- Treat `NEXT_SESSION.md` as the implementation notebook.
- Before starting a phase, add the intended next step.
- After completing a phase, update what changed, files touched, commands/tests run,
  screenshots captured, current blockers, open risks, and the next concrete action.
- If the DSL schema, render path, or frontend behavior changes, update `/docs` in the
  same session so future agents do not inherit stale architecture notes.
- Keep `docs/renderer-analysis/findings.md` as the evidence baseline. Amend it only when
  new evidence changes the renderer diagnosis; otherwise put progress notes in
  `NEXT_SESSION.md`.

## Optional Sub-Agent Plan

If the environment supports sub-agents and the implementation is too large for one
agent to work comfortably, use sub-agents with non-overlapping ownership:

- Backend contract agent: update `backend/app/domain/manga/*`, DSL schema/prompt
  contract, persistence compatibility, and backend tests.
- Frontend renderer agent: update `frontend/lib/types.ts` and
  `frontend/components/MangaReader/*`, including panel geometry, bubble placement,
  sprite anchors, z-order, gutters, and manga page styling.
- Verification/docs agent: run browser verification, capture screenshots, update
  `NEXT_SESSION.md`, and keep docs aligned with the implementation.

The main agent remains responsible for integration, resolving overlap, final browser
verification, and the final handoff. Each sub-agent must report changed file paths,
tests/commands run, screenshots/evidence, and unresolved risks.

## Hard Constraints

- Content generation is off-limits unless a render-contract change needs to pass
  existing asset metadata differently.
- Image generation prompts are not the target.
- Work only on DSL/schema, DSL-to-render mapping, and frontend renderer.
- Keep legacy fallback for pages that only have the current `gutter_grid`
  contract.

## Findings To Build From

Current supported fields:

- `composition.gutter_grid[].cell_widths_pct`
- `composition.panel_order`
- `composition.page_turn_panel_id`
- `composition.panel_emphasis_overrides`
- `panel_artifacts[panel_id].image_path` as a full-panel backdrop

Fields proven ignored by screenshot experiments:

- `row_heights_pct`
- `gutter_px`
- `bleed_edges`
- `panel_placements`
- `sprite_layers`
- `bbox_pct`
- `z_index`
- `bubble_placement`
- `layer_order`
- `camera`

Evidence:

- `02-ignored-rich-layout-fields.png` is byte-identical to baseline.
- `03-ignored-sprite-bubble-fields.png` is byte-identical to baseline.
- `04-artifact-backdrop-from-sprite.png` changes pixels only because
  `panel_artifacts.image_path` is the one image channel the renderer honors.

## Implementation Tasks

1. Baseline:
   - open the live reader for book `6a0b5a11201a8d03f1d82501`, project
     `6a0b5a5b201a8d03f1d82503`.
   - capture a fresh baseline screenshot.

2. Contract:
   - extend backend Pydantic models for row heights, gutters, bleed, panel boxes,
     sprite layers, bubble boxes, and z-order.
   - update `RenderedPage` validation.
   - preserve old `gutter_grid` pages.

3. Frontend mirror:
   - update `frontend/lib/types.ts`.
   - ensure the reader can narrow both old and new payloads safely.

4. Renderer:
   - consume explicit row heights/panel boxes when present.
   - render sprites as scene layers, not dialogue avatars.
   - place speech bubbles from DSL boxes when present.
   - keep `panel_artifacts.image_path` as painted backdrop support.
   - improve page styling so the output reads as a manga page, not UI cards.

5. Layout/DSL agent:
   - add or update a dedicated compositor agent only after the renderer can
     consume its fields.
   - the agent owns layout, sprite placement, bubble placement, z-order, and
     reading order.
   - it does not rewrite content, facts, dialogue, or image prompts.

6. Verification:
   - compare screenshots against `docs/renderer-analysis/experiments/`.
   - prove the sprite bug is fixed.
   - prove the page reads like manga in static view.
   - run relevant backend/frontend checks.

## Key Code Paths

- `backend/app/domain/manga/render_view.py`
- `backend/app/domain/manga/page_composition.py`
- `backend/app/manga_pipeline/stages/page_composition_stage.py`
- `backend/app/manga_pipeline/stages/rendered_page_assembly_stage.py`
- `backend/app/services/manga/generation_service.py`
- `frontend/app/books/[id]/manga/v2/page.tsx`
- `frontend/lib/types.ts`
- `frontend/components/MangaReader/page_layout.ts`
- `frontend/components/MangaReader/MangaPageRenderer.tsx`
- `frontend/components/MangaReader/MangaPanelRenderer.tsx`
- `frontend/components/MangaReader/panels/DialoguePanel.tsx`

## Done Criteria

- Sprites are visible as composed scene elements.
- Speech bubbles are positioned intentionally and do not look like chat UI.
- Page geometry supports row heights/gutters/bleed/panel boxes.
- Existing pages still render.
- New screenshots demonstrate the improvement.
- Docs and handoff files remain current.
