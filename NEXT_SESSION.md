# NEXT_SESSION

Date: 2026-07-05
Branch: visual-upgrade-phase-v

## Current mission

Make the generated manga reader art-first without increasing image budgets:
dialogue in bubbles, sparse text, no dev chrome, visible grounded sprites,
synthetic/vector scene drawing for unpainted panels, and final screenshots for
book `6a0b5a11201a8d03f1d82501` / project `6a0b5a5b201a8d03f1d82503`.

## Starting state

- Required docs read: `AGENTS.md`,
  `docs/analysis/SHORTCOMINGS_AND_VISUAL_UPGRADE.md`,
  `docs/ARCHITECTURE.md`, and
  `docs/MANGA_BUILD_FLOW_AND_IMAGE_COST_PLAN.md`.
- Created branch `visual-upgrade-phase-v` from the dirty working tree.
- Pre-existing dirty state before implementation:
  - Modified: `AGENTS.md`, `CLAUDE.md`, `docs/next-prompt.md`
  - Deleted: `NEXT_SESSION.md`, `agent.md`
  - Untracked: `docs/analysis/`, June renderer screenshots, `findings.md`,
    `progress.md`, `task_plan.md`

## Commands run

- `sed -n '1,260p' AGENTS.md`
- `sed -n '1,320p' docs/analysis/SHORTCOMINGS_AND_VISUAL_UPGRADE.md`
- `sed -n '1,280p' docs/ARCHITECTURE.md`
- `sed -n '1,1220p' docs/MANGA_BUILD_FLOW_AND_IMAGE_COST_PLAN.md`
- `git status --short --branch`
- `git log --oneline -5`
- `git switch -c visual-upgrade-phase-v`
- `npm exec tsx -- components/MangaReader/panel_presentation.test.ts`
- `npm exec tsx -- components/MangaReader/dialogue_lettering.test.ts`
- `uv pip install --python backend/.venv/bin/python pytest`
- `backend/.venv/bin/python -m pytest backend/tests/test_manga_dsl_v2.py backend/tests/test_manga_pipeline_manga_script_stage_v2.py backend/tests/test_manga_pipeline_quality_repair_stage_v2.py backend/tests/test_llm_client_json_parsing.py -q`
- `npm exec tsc -- --noEmit`
- `npm run build`
- `backend/.venv/bin/python -m pytest backend/tests -q`
- `./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001`
- `NEXT_PUBLIC_API_URL=http://localhost:8001 npm run dev`
- `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --no-sandbox --window-size=1280,1600 --virtual-time-budget=25000 --screenshot=docs/renderer-analysis/experiments/2026-07-05-task1-after-page1-1280-final-warm.png "http://localhost:3000/books/6a0b5a11201a8d03f1d82501/manga/v2?project=6a0b5a5b201a8d03f1d82503"`
- `backend/.venv/bin/python -m pytest backend/tests/test_vector_scene_contract_v2.py backend/tests/test_manga_pipeline_vector_scene_stage_v2.py backend/tests/test_manga_generation_service_v2.py::test_build_v2_generation_stages_has_expected_order -q`
- `npm exec tsx -- components/MangaReader/vector_scene_rendering.test.ts`
- `npm exec tsc -- --noEmit`
- `backend/.venv/bin/python -m pytest backend/tests/test_manga_dsl_v2.py backend/tests/test_manga_pipeline_manga_script_stage_v2.py backend/tests/test_manga_pipeline_quality_repair_stage_v2.py backend/tests/test_llm_client_json_parsing.py backend/tests/test_vector_scene_contract_v2.py backend/tests/test_manga_pipeline_vector_scene_stage_v2.py backend/tests/test_manga_generation_service_v2.py::test_build_v2_generation_stages_has_expected_order -q`
- `npm run build`
- `backend/.venv/bin/python -m pytest backend/tests -q -k 'not test_build_asset_prompt_adds_reusable_asset_constraints'`
- `cp docs/renderer-analysis/experiments/2026-07-05-task1-after-page1-1280-final-warm.png docs/renderer-analysis/experiments/2026-07-05-task2-before-page1-1280.png`
- `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --no-sandbox --window-size=1280,1600 --virtual-time-budget=25000 --screenshot=docs/renderer-analysis/experiments/2026-07-05-task2-after-page1-1280.png "http://localhost:3000/books/6a0b5a11201a8d03f1d82501/manga/v2?project=6a0b5a5b201a8d03f1d82503"`
- `npm exec tsx -- components/MangaReader/manga_page_drama.test.ts`
- `npm exec tsx -- components/MangaReader/dialogue_tail_geometry.test.ts`
- `npm exec tsx -- components/MangaReader/speech_bubble_shape.test.ts`
- `npm exec tsc -- --noEmit`
- `npm exec tsx -- components/MangaReader/panel_presentation.test.ts`
- `npm exec tsx -- components/MangaReader/dialogue_lettering.test.ts`
- `npm exec tsx -- components/MangaReader/vector_scene_rendering.test.ts`
- `npm run build`
- `cp docs/renderer-analysis/experiments/2026-07-05-task2-after-page1-1280.png docs/renderer-analysis/experiments/2026-07-05-task3-before-page1-1280.png`
- `NEXT_PUBLIC_API_URL=http://localhost:8001 npm run dev`
- `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --no-sandbox --window-size=1280,1600 --virtual-time-budget=25000 --screenshot=docs/renderer-analysis/experiments/2026-07-05-task3-after-page1-1280.png "http://localhost:3000/books/6a0b5a11201a8d03f1d82501/manga/v2?project=6a0b5a5b201a8d03f1d82503"`

## Task log

### Task 1: Kill the text-wall

Status: complete; committed as `e54c361 fix: kill manga text wall`.

Files changed:
- `frontend/components/MangaReader/panels/DialoguePanel.tsx`
- `frontend/components/MangaReader/dialogue_lettering.ts`
- `frontend/components/MangaReader/chrome/SpeechBubble.tsx`
- `frontend/components/MangaReader/panel_presentation.ts`
- `frontend/components/MangaReader/panels/ConceptPanel.tsx`
- `frontend/components/MangaReader/panels/NarrationPanel.tsx`
- `frontend/components/MangaReader/panel_presentation.test.ts`
- `frontend/components/MangaReader/dialogue_lettering.test.ts`
- `frontend/components/MangaV2ProjectPanel.tsx`
- `frontend/lib/types.ts`
- `backend/app/config.py`
- `backend/app/llm_client.py`
- `backend/app/manga_pipeline/manga_dsl.py`
- `backend/app/manga_pipeline/stages/manga_script_stage.py`
- `backend/app/manga_pipeline/stages/quality_repair_stage.py`
- `backend/tests/test_llm_client_json_parsing.py`
- `backend/tests/test_manga_dsl_v2.py`
- `backend/tests/test_manga_pipeline_manga_script_stage_v2.py`
- `backend/tests/test_manga_pipeline_quality_repair_stage_v2.py`
- `NEXT_SESSION.md`

Implemented:
- Dialogue panels no longer demote long dialogue into speaker-prefixed caption
  cards.
- Dialogue line text is split into 2-3 bubble chunks without ellipsis
  truncation.
- Visible scene-id badges and character-id tags were removed from dialogue,
  narration, and concept panels.
- Speech bubble content padding now matches the drawn SVG body so text sits
  inside the outline.
- DSL text budgets are now hard errors: 2 dialogue lines per panel, 90 chars
  per panel, 60 visible words per page, narration captions at most one per
  three panels and 15 words each.
- Script and quality-repair prompts now instruct the model to cut words, split
  beats into more panels, and convert narration into silent panels, action, or
  SFX.
- `provider="minimax"` is wired in `LLMClient` with
  `https://api.minimax.io/v1`, `MINIMAX_API_KEY`, and default
  `MiniMax-M2.5-highspeed`.

Verification:
- Frontend red tests first failed on dense dialogue `text-card` and missing
  `dialogue_lettering` helper.
- Backend red tests first failed on old budgets, prompt copy, and MiniMax env
  handling.
- Final focused checks passed:
  - `npm exec tsx -- components/MangaReader/panel_presentation.test.ts`
  - `npm exec tsx -- components/MangaReader/dialogue_lettering.test.ts`
  - `npm exec tsc -- --noEmit`
  - `backend/.venv/bin/python -m pytest backend/tests/test_manga_dsl_v2.py backend/tests/test_manga_pipeline_manga_script_stage_v2.py backend/tests/test_manga_pipeline_quality_repair_stage_v2.py backend/tests/test_llm_client_json_parsing.py -q` -> 30 passed, 1 pydantic deprecation warning.
- Broader checks:
  - `npm run build` passed.
  - `backend/.venv/bin/python -m pytest backend/tests -q` ran 412 tests and
    failed only `backend/tests/test_manga_asset_image_service_v2.py::test_build_asset_prompt_adds_reusable_asset_constraints`
    because the existing asset prompt lacks the phrase
    `reusable sprite/reference`. Task 1 did not touch asset prompting; revisit
    in Task 4.

## Screenshots

- Before: `docs/renderer-analysis/experiments/2026-07-05-task1-before-page1-live-baseline.png`
  copied from the documented same-project live baseline
  `docs/analysis/2026-07-05-live-reader-page1.png`.
- After: `docs/renderer-analysis/experiments/2026-07-05-task1-after-page1-1280-final-warm.png`.

## Blockers / risks

- Port `:8000` was occupied by an unrelated `ecom-support-ai` backend. For
  screenshots, this repo's backend ran on `:8001` and frontend used
  `NEXT_PUBLIC_API_URL=http://localhost:8001` while preserving the requested
  reader URL on `:3000`.
- Existing sample pages may predate expanded composition fields, so Task 1
  screenshots verify renderer behavior on current persisted data, not a fully
  regenerated slice.
- Task 1 does not solve empty beige panels or missing sprites; those are Task 2
  and Task 4.

### Task 2: Vector scene layer

Status: complete; committed as `cc30266 feat: add manga vector scene layer`.

Files changed:
- `backend/app/domain/manga/vector_scene.py`
- `backend/app/domain/manga/artifacts.py`
- `backend/app/domain/manga/__init__.py`
- `backend/app/manga_pipeline/llm_contracts.py`
- `backend/app/manga_pipeline/stages/vector_scene_stage.py`
- `backend/app/services/manga/generation_service.py`
- `backend/tests/test_vector_scene_contract_v2.py`
- `backend/tests/test_manga_pipeline_vector_scene_stage_v2.py`
- `backend/tests/test_manga_generation_service_v2.py`
- `frontend/lib/manga-render-types.ts`
- `frontend/lib/types.ts`
- `frontend/components/MangaReader/chrome/VectorSceneLayer.tsx`
- `frontend/components/MangaReader/MangaPanelRenderer.tsx`
- `frontend/components/MangaReader/vector_scene_rendering.test.ts`
- `docs/renderer-analysis/experiments/2026-07-05-task2-before-page1-1280.png`
- `docs/renderer-analysis/experiments/2026-07-05-task2-after-page1-1280.png`
- `NEXT_SESSION.md`

Implemented:
- Added optional `StoryboardPanel.vector_scene` with typed primitives for
  background gradients, screentone/hatching, linework, silhouettes, speedline
  bursts, radial focus, vignette, and drawn SFX lettering.
- Added `LLMStageName.VISUAL_DIRECTION` and a `vector_scene_stage` after
  RTL composition validation and before asset planning.
- The visual-direction stage prompts from each panel's composition, action,
  shot type, and purpose, and requires every panel to have tone plus linework.
- Added deterministic fallback vector scenes when no LLM client is present or
  when authored output omits required ink, so legacy pages do not render as
  empty beige panels.
- Added frontend mirror types and an inline SVG `VectorSceneLayer` rendered
  behind sprites and bubbles.
- Removed the old unpainted-panel diagonal fallback from
  `MangaPanelRenderer` in favor of the typed vector scene layer.

Verification:
- Red tests first failed on missing `VectorScene`, missing
  `vector_scene_stage`, missing `VectorSceneLayer`, and the old generation
  stage order.
- Final checks passed:
  - `backend/.venv/bin/python -m pytest backend/tests/test_vector_scene_contract_v2.py backend/tests/test_manga_pipeline_vector_scene_stage_v2.py backend/tests/test_manga_generation_service_v2.py::test_build_v2_generation_stages_has_expected_order -q` -> 6 passed, 1 pydantic deprecation warning.
  - `npm exec tsx -- components/MangaReader/vector_scene_rendering.test.ts`
  - `npm exec tsc -- --noEmit`
  - Combined focused backend suite -> 36 passed, 1 pydantic deprecation warning.
  - `npm run build`
  - `backend/.venv/bin/python -m pytest backend/tests -q -k 'not test_build_asset_prompt_adds_reusable_asset_constraints'`
    -> 416 passed, 1 deselected, 1 pydantic deprecation warning.

Screenshots:
- Before: `docs/renderer-analysis/experiments/2026-07-05-task2-before-page1-1280.png`
  copied from the Task 1 after-state for the same project.
- After: `docs/renderer-analysis/experiments/2026-07-05-task2-after-page1-1280.png`.

Current visual status:
- The live same-project page now has visible screentone and linework in every
  panel even without regenerated `vector_scene` payloads, because the renderer
  supplies the deterministic fallback for legacy pages.
- This does not yet solve missing/grounded character sprites; that remains
  Task 4.

### Task 3: Manga typography and page drama

Status: complete; committed as `24aa9d6 feat: add manga page typography drama`.

Files changed:
- `frontend/app/globals.css`
- `frontend/components/MangaReader/lettering_fonts.ts`
- `frontend/components/MangaReader/panel_chrome.ts`
- `frontend/components/MangaReader/dialogue_geometry.ts`
- `frontend/components/MangaReader/chrome/SpeechBubble.tsx`
- `frontend/components/MangaReader/chrome/SfxLayer.tsx`
- `frontend/components/MangaReader/chrome/VectorSceneLayer.tsx`
- `frontend/components/MangaReader/panels/DialoguePanel.tsx`
- `frontend/components/MangaReader/MangaPanelRenderer.tsx`
- `frontend/components/MangaReader/MangaPageRenderer.tsx`
- `frontend/components/MangaReader/manga_page_drama.test.ts`
- `frontend/components/MangaReader/dialogue_tail_geometry.test.ts`
- `frontend/components/MangaReader/speech_bubble_shape.test.ts`
- `docs/renderer-analysis/experiments/2026-07-05-task3-before-page1-1280.png`
- `docs/renderer-analysis/experiments/2026-07-05-task3-after-page1-1280.png`
- `NEXT_SESSION.md`

Implemented:
- Added Comic Neue for bubble/body lettering and Bangers for SFX lettering.
- Added deterministic irregular speech-bubble paths, with stable wobble seeds
  per bubble.
- Dialogue bubbles now use `overflow: visible` and can bleed across panel
  borders.
- Bubble tails resolve toward the speaker's sprite layer when composition
  sprite geometry is available; otherwise they fall back to authored placement
  tails.
- Panel chrome now varies by purpose: reveal/TBC use double heavy borders,
  transition uses dashed, recap dotted, and emotional turns get heavier ink.
- `page_turn_panel_id` now gets the strongest visual weight in the reader by
  default: double border, outer ring, drop weight, contrast lift, and higher
  z-index.

Verification:
- Red tests first failed on missing `panel_chrome`, `dialogue_geometry`, and
  `lettering_fonts` helpers.
- Final checks passed:
  - `npm exec tsx -- components/MangaReader/manga_page_drama.test.ts`
  - `npm exec tsx -- components/MangaReader/dialogue_tail_geometry.test.ts`
  - `npm exec tsx -- components/MangaReader/speech_bubble_shape.test.ts`
  - `npm exec tsc -- --noEmit`
  - `npm exec tsx -- components/MangaReader/panel_presentation.test.ts`
  - `npm exec tsx -- components/MangaReader/dialogue_lettering.test.ts`
  - `npm exec tsx -- components/MangaReader/vector_scene_rendering.test.ts`
  - `npm run build`

Screenshots:
- Before: `docs/renderer-analysis/experiments/2026-07-05-task3-before-page1-1280.png`
  copied from Task 2 after-state for the same project.
- After: `docs/renderer-analysis/experiments/2026-07-05-task3-after-page1-1280.png`.

### Task 4: Sprites that land

Status: complete; pending commit.

Files changed:
- `backend/app/domain/manga/artifacts.py`
- `backend/app/domain/manga/script_review.py`
- `backend/app/image_generator.py`
- `backend/app/manga_pipeline/stages/manga_script_stage.py`
- `backend/app/manga_pipeline/stages/page_composition_stage.py`
- `backend/app/manga_pipeline/stages/panel_quality_gate_stage.py`
- `backend/app/manga_pipeline/stages/quality_assert_stage.py`
- `backend/app/manga_pipeline/stages/quality_gate_stage.py`
- `backend/app/manga_pipeline/stages/quality_repair_stage.py`
- `backend/app/manga_pipeline/stages/script_repair_stage.py`
- `backend/app/manga_pipeline/stages/script_review_stage.py`
- `backend/app/manga_pipeline/stages/storyboard_stage.py`
- `backend/app/services/manga/asset_image_service.py`
- `backend/app/services/manga/generation_service.py`
- `backend/app/services/manga/quality_service.py`
- `backend/app/services/manga/sprite_transparency.py`
- `backend/tests/test_manga_artifacts_v2.py`
- `backend/tests/test_manga_asset_image_service_v2.py`
- `backend/tests/test_manga_generation_service_v2.py`
- `backend/tests/test_manga_pipeline_manga_script_stage_v2.py`
- `backend/tests/test_manga_pipeline_page_composition_stage_v2.py`
- `backend/tests/test_manga_pipeline_stages_v2.py`
- `backend/tests/test_manga_pipeline_storyboard_stage_v2.py`
- `backend/tests/test_manga_quality_service_v2.py`
- `backend/tests/test_panel_quality_gate_stage_v2.py`
- `backend/tests/test_quality_assert_stage_v2.py`
- `backend/tests/test_script_review_stage_v2.py`
- `backend/tests/test_sprite_transparency_v2.py`
- `frontend/components/MangaReader/chrome/SceneSprites.tsx`
- `frontend/components/MangaReader/panel_presentation.ts`
- `frontend/components/MangaReader/scene_sprites_landing.test.ts`
- `docs/renderer-analysis/experiments/2026-07-05-task4-before-page1-1280.png`
- `docs/renderer-analysis/experiments/2026-07-05-task4-after-page1-1280.png`
- `NEXT_SESSION.md`

Implemented:
- `page_composition_stage` now receives an asset manifest from existing
  project assets, raises its default output budget to 6000 tokens, prompts
  `sprite_layers` against manifest character/expression pairs, and drops
  sprite refs outside the manifest before `RenderedPage`.
- Asset generation requests `background="transparent"` through the unified
  image API and records transparent/matting metadata.
- Added local sprite alpha cleanup in `sprite_transparency.py`: use `rembg`
  when installed, otherwise apply a deterministic light-background matte.
- Reference-sheet-only characters now render as derived full-body crops in
  `SceneSprites` instead of returning null, and synthetic fallback sprites
  are grounded and scaled by shot type.
- `panel_presentation` now treats `reference_sheet` assets as renderable so
  synthetic derived sprites appear when no explicit `sprite_layers` survive.
- Added pre-render robustness discovered during live regeneration:
  - Storyboard page indexes normalize to list order.
  - Unknown `emotional_tone` values default to `curious`.
  - Script-review nullable string metadata is coerced instead of rejecting an
    otherwise useful report.
  - `quality_gate_stage` now merges with existing DSL issues instead of
    overwriting them.
  - A second bounded storyboard repair/check cycle and `quality_assert_stage`
    stop failed story/DSL reports before image spend.

Live asset/slice work:
- Regenerated the sample project's 8 sprite/reference assets through
  OpenRouter image generation with `background="transparent"`.
- API transparency was insufficient: all regenerated files were RGB with
  `alpha_lt_250=0.0000`.
- Applied local matting and updated asset metadata. Final alpha coverage:
  - Haw reference/front: 0.7800
  - Hem expression/neutral: 0.2152
  - Hem reference/front: 0.8257
  - Michael reference/front: 0.7751
  - Scurry expression/neutral: 0.3217
  - Scurry reference/front: 0.6623
  - Sniff expression/neutral: 0.6058
  - Sniff reference/front: 0.3437
- Successful MiniMax/OpenRouter end-to-end regeneration persisted 13 pages,
  51 vector-scene panels, and exactly 3 rendered panel images.
- A stricter rerun after fixing DSL report merging correctly failed before
  visual stages with remaining story/DSL errors instead of spending images;
  the sample project was restored to the successful generated slice backup.

Verification:
- `backend/.venv/bin/python -m pytest backend/tests/test_manga_pipeline_page_composition_stage_v2.py backend/tests/test_manga_asset_image_service_v2.py backend/tests/test_sprite_transparency_v2.py -q`
- `backend/.venv/bin/python -m pytest backend/tests/test_script_review_stage_v2.py backend/tests/test_quality_assert_stage_v2.py backend/tests/test_manga_generation_service_v2.py::test_build_v2_generation_stages_has_expected_order backend/tests/test_manga_artifacts_v2.py::test_manga_script_scene_defaults_unknown_emotional_tone backend/tests/test_manga_quality_service_v2.py backend/tests/test_panel_quality_gate_stage_v2.py backend/tests/test_manga_pipeline_manga_script_stage_v2.py backend/tests/test_manga_pipeline_storyboard_stage_v2.py -q`
- `backend/.venv/bin/python -m pytest backend/tests/test_manga_pipeline_stages_v2.py::test_quality_gate_stage_preserves_existing_dsl_errors ... -q`
- `backend/.venv/bin/python -m pytest backend/tests -q` -> 428 passed, 1
  pydantic deprecation warning.
- `npm exec tsx -- components/MangaReader/scene_sprites_landing.test.ts`
- `npm exec tsx -- components/MangaReader/panel_presentation.test.ts`
- `npm exec tsx -- components/MangaReader/vector_scene_rendering.test.ts`
- `npm exec tsx -- components/MangaReader/manga_page_drama.test.ts`
- `npm exec tsx -- components/MangaReader/dialogue_tail_geometry.test.ts`
- `npm exec tsx -- components/MangaReader/speech_bubble_shape.test.ts`
- `npm run build`
- `npm exec tsc -- --noEmit`

Screenshots:
- Before: `docs/renderer-analysis/experiments/2026-07-05-task4-before-page1-1280.png`
  copied from Task 3 after-state for the same project.
- After: `docs/renderer-analysis/experiments/2026-07-05-task4-after-page1-1280.png`.

Known gaps / blockers:
- Restored successful slice page 11 has 63 visible words. The backend bug
  that let DSL word-budget errors be overwritten is fixed, and a stricter
  rerun failed before visual spend; Task 5 should regenerate again or add a
  more controlled repair strategy before final all-page verification.
- Composition LLM often failed validation and fell back to default layout, so
  persisted explicit `sprite_layers` are still sparse/absent. Frontend
  reference-sheet synthetic sprites now cover this path.
- MiniMax was unstable during live runs: observed schema retries, truncated
  JSON, empty responses, and one network read stall. Use lower temperatures,
  5 validation attempts, and `LLM_REQUEST_TIMEOUT_SECONDS=300` for the next
  regeneration attempt.

## Next concrete step

Commit Task 4, then start Task 5 with a fresh stricter regeneration and all-page
screenshots/visual checks. Do not start Task 5 until the Task 4 commit is made.

### Task 5A: Stable composition authoring lane

Status: code complete; pending commit.

Files changed:
- `backend/app/manga_pipeline/strict_json_routing.py`
- `backend/app/manga_pipeline/stages/page_composition_stage.py`
- `backend/app/manga_pipeline/stages/quality_repair_stage.py`
- `backend/app/manga_pipeline/stages/script_repair_stage.py`
- `backend/tests/test_manga_pipeline_page_composition_stage_v2.py`
- `backend/tests/test_manga_pipeline_quality_repair_stage_v2.py`
- `backend/tests/test_script_repair_stage_v2.py`
- `NEXT_SESSION.md`

Implemented:
- `page_composition_stage` now authors one `PageComposition` per page instead
  of one slice-wide `SliceComposition`, so a malformed geometry response only
  defaults that page.
- `page_composition` strict JSON defaults now use temperature `0.25`, five
  validation attempts, and a 300s request timeout on the composition client.
- Added `strict_json_routing.py` so geometry and repair stages route away from
  MiniMax/drafting clients to an OpenRouter quality model while preserving fake
  clients in tests.
- `script_repair_stage` and `quality_repair_stage` now use the same strict JSON
  lane defaults: OpenRouter quality model, temperature `0.25`, five validation
  attempts, and 300s timeout.

Root-cause notes:
- Verified from code that the old composition stage was still slice-wide and
  defaulted the entire slice after structured validation failure, matching the
  persisted zero-geometry defect when MiniMax returned truncated/empty JSON.
- Kept fallback additive: failed page-level composition still produces default
  layout for that page instead of breaking the generation job.

Verification:
- Red tests first failed on slice-wide composition, 0.5 temperature / 3 attempt
  assumptions, and repair stages still calling MiniMax.
- `backend/.venv/bin/python -m pytest backend/tests/test_manga_pipeline_page_composition_stage_v2.py backend/tests/test_manga_pipeline_quality_repair_stage_v2.py backend/tests/test_script_repair_stage_v2.py -q`
  -> 19 passed, 1 pydantic deprecation warning.

Next concrete step:
- Start Task 5B: make bubble/sprite geometry quality rules executable, then
  regenerate the benchmark slice.
