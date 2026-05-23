# Mission: Implement the Manga Renderer Fixes in Book-Reel

Root: `/Users/comreton/Desktop/Book-Reel`

Use `docs/next-prompt.md` as the paste-ready prompt for the next implementation
agent. Use this file as the living progress log and handoff while that work is
happening. There is currently no root `NEXT_STEPS.md`; do not use one unless a
future session creates it deliberately and keeps it consistent with this file.

Read first:

- `docs/renderer-analysis/findings.md`
- `docs/renderer-analysis/sample-dsl.json`
- `docs/renderer-analysis/experiments/README.md`
- `CLAUDE.md`
- `agent.md`

## Diagnosis To Trust

Do not re-litigate the diagnosis unless new evidence contradicts it.

The bottleneck is the renderer contract and frontend presentation layer. The
stored DSL has real storyboard/composition intent, but the frontend currently
honors only a narrow subset:

- `composition.gutter_grid[].cell_widths_pct`
- `composition.panel_order`
- `composition.page_turn_panel_id`
- `composition.panel_emphasis_overrides`
- `panel_artifacts[panel_id].image_path` as a full-panel backdrop

The frontend ignores richer layout and sprite data such as row heights, gutters,
bleed, sprite anchors, z-index, and bubble placement. Character assets are used
as small dialogue avatars, not scene sprites.

## Hard Constraints

- Do not change content generation quality or image generation prompts unless a
  renderer contract change requires passing already-generated assets differently.
- Keep fixes scoped to DSL/schema, DSL-to-render mapping, and frontend renderer.
- Every visual fix needs before/after screenshots saved under docs.
- Preserve a fallback for existing `RenderedPage` docs that only have the old
  `gutter_grid` contract.

## Living Progress Log Rules

- Update this file before and after each meaningful phase.
- Record files changed, commands/tests run, screenshots captured, current blockers,
  open risks, and the next concrete action.
- Keep docs current as implementation changes reality. If the DSL contract, render
  path, or frontend behavior changes, update `/docs` and the root handoff files in the
  same session.
- Keep `docs/renderer-analysis/findings.md` as the evidence baseline; amend it only
  when new evidence changes the diagnosis.
- If sub-agents are used, each one should have disjoint file ownership and should
  report changed paths, verification, screenshots/evidence, and unresolved risks here.

## Progress Log

- 2026-05-23: Research pass completed. Bottleneck documented as renderer
  contract/frontend presentation, with real DB DSL sample and browser screenshots saved
  under `docs/renderer-analysis/`. No implementation has started yet.

## Tasks

1. Confirm the tree and baseline:
   - `git status --short`
   - open the live reader for book `6a0b5a11201a8d03f1d82501`, project
     `6a0b5a5b201a8d03f1d82503`
   - capture a fresh baseline screenshot.

2. Expand the backend render contract:
   - add explicit layout fields for row heights, gutters, bleed, panel boxes,
     bubble boxes, sprite layers, and z-order.
   - update Pydantic validators so bad placement fails clearly.
   - keep old pages valid.

3. Update the frontend type mirror:
   - update `frontend/lib/types.ts`.
   - keep unknown/legacy data safe.

4. Rebuild `MangaReader` rendering:
   - use explicit row heights and panel boxes when present.
   - render character assets as panel sprite layers using anchors/boxes/z-order.
   - render speech bubbles from placement boxes when present.
   - stop treating generated sprites as message/avatar chrome for the main
     reader path.

5. Add or update the layout/DSL agent:
   - it should own composition only: panel geometry, sprite placement, bubble
     placement, reading order, and page-turn visual weight.
   - it must not rewrite story, dialogue, source facts, or image prompts.

6. Validate:
   - use the stored sample DSL and the live DB project.
   - reproduce the sprite bug before the fix.
   - capture after screenshots showing sprites composed into panels and page
     layouts reading like manga.
   - run relevant backend/frontend checks.

## Reference Evidence

Key files:

- `backend/app/domain/manga/render_view.py`
- `backend/app/domain/manga/page_composition.py`
- `backend/app/manga_pipeline/stages/page_composition_stage.py`
- `backend/app/manga_pipeline/stages/rendered_page_assembly_stage.py`
- `frontend/components/MangaReader/page_layout.ts`
- `frontend/components/MangaReader/MangaPageRenderer.tsx`
- `frontend/components/MangaReader/MangaPanelRenderer.tsx`
- `frontend/components/MangaReader/panels/DialoguePanel.tsx`

Most important experiment results:

- `02-ignored-rich-layout-fields.png` is byte-identical to baseline.
- `03-ignored-sprite-bubble-fields.png` is byte-identical to baseline.
- `04-artifact-backdrop-from-sprite.png` changes pixels only because
  `panel_artifacts.image_path` is the one image channel the renderer honors.
