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

Status: complete; committed as `bee8def fix: route strict manga json to quality lane`.

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

### Task 5B: Bubble and sprite quality rules

Status: complete; committed as `96fce1f fix: enforce manga bubble placement rules`.

Files changed:

- `backend/app/domain/manga/render_view.py`
- `backend/tests/test_render_view_v2.py`
- `frontend/components/MangaReader/dialogue_lettering.ts`
- `frontend/components/MangaReader/dialogue_lettering.test.ts`
- `frontend/components/MangaReader/dialogue_geometry.ts`
- `frontend/components/MangaReader/dialogue_tail_geometry.test.ts`
- `frontend/components/MangaReader/panels/DialoguePanel.tsx`
- `frontend/components/MangaReader/chrome/SceneSprites.tsx`
- `frontend/components/MangaReader/scene_sprites_landing.test.ts`
- `NEXT_SESSION.md`

Implemented:

- Dialogue splitting is capped at two bubbles per source dialogue line and
  prefers sentence/clause punctuation boundaries before falling back to spaces.
- Bubble text disables CSS hyphenation (`hyphens: none`) to avoid mid-word
  hyphen artifacts.
- Frontend bubble placement now runs through a face-zone avoidance helper before
  resolving the rendered box and tail.
- `RenderedPage` validation now rejects authored bubble placements that overlap
  a sprite's top-third face zone, point the tail away from an on-panel speaker,
  or list bubbles out of dialogue reading order.
- Reference-sheet fallback rendering now uses whole-image `contain` /
  `center bottom` instead of cropped `cover`, preventing fragment/limb crops.

Verification:

- Red tests first failed on comma-boundary splitting, missing face-zone helper,
  reference-sheet `cover` cropping, and backend accepting bad placement geometry.
- `npm exec tsx -- components/MangaReader/dialogue_lettering.test.ts`
- `npm exec tsx -- components/MangaReader/dialogue_tail_geometry.test.ts`
- `npm exec tsx -- components/MangaReader/scene_sprites_landing.test.ts`
- `npm exec tsx -- components/MangaReader/panel_presentation.test.ts`
- `npm exec tsx -- components/MangaReader/vector_scene_rendering.test.ts`
- `npm exec tsx -- components/MangaReader/speech_bubble_shape.test.ts`
- `npm exec tsc -- --noEmit`
- `backend/.venv/bin/python -m pytest backend/tests/test_render_view_v2.py backend/tests/test_manga_pipeline_page_composition_stage_v2.py -q`
  -> 31 passed, 1 pydantic deprecation warning.

Next concrete step:

- Task 5C/5D: run the strict regeneration against the benchmark project, then
  screenshot all 13 pages and record page-level rubric results.

### Task 5C/5D: Regeneration and all-page verification

Status: blocked by OpenRouter capacity/credits; not complete and not committed.

The earlier local-Mongo blocker is superseded. Running from `backend/` loads
the Atlas URI in `backend/.env`; the benchmark book/project and all eight
existing assets are reachable.

Uncommitted implementation:

- Strict beat-sheet, manga-script, storyboard, and repair stages now use the
  OpenRouter structured lane with 0.25 temperature, five validation attempts,
  and per-stage 300s timeouts.
- Page-budget overrides flow through prompts and the executable DSL validator,
  allowing the benchmark to target 13 pages.
- `quality_repair_stage` clears its stale pre-repair report after replacing the
  storyboard.
- New `storyboard_grounding_repair_stage` deterministically:
  - removes unknown visual character IDs and dialogue speakers;
  - anchors required fact IDs without adding visible text;
  - moves excess narration into non-visible action;
  - enforces minimum panel counts with silent continuation beats;
  - cuts dialogue at word boundaries and distributes over-budget dialogue into
    continuation panels.
- Deterministic grounding repair now runs after both LLM repair passes, so the
  second full-storyboard call can no-op when the first repair is sufficient.
- OpenRouter `json_mode=True` now sends `response_format=json_object` and
  disables visible reasoning with `reasoning.effort=none`.
- The default OpenRouter quality model was updated from the unavailable
  `anthropic/claude-3.5-sonnet` ID to `anthropic/claude-sonnet-5`.

Regeneration evidence:

- Paid GPT-4.1/Qwen runs progressed through both repair loops. Fixing stale
  reports reduced final errors from 35 to 19; deterministic grounding reduced
  them to one narration-density error.
- A zero-cost
  `nvidia/nemotron-3-super-120b-a12b:free` run completed both LLM repairs and
  reached final assertion. It had only three mechanical errors:
  `DSL_PAGE_UNDER_PANEL_BUDGET` and `DSL_PANEL_OVER_DIALOGUE_CHARS`.
- The deterministic panel/dialogue repair was added after that evidence and
  its focused suite passes.
- A later Nemotron run timed out during a 35.8k-token storyboard retry.
- Paid OpenRouter capacity is exhausted: a Qwen request returned 402 and said
  only about 1.6k output tokens were affordable.
- The free Qwen 80B route repeatedly returned upstream 429s; Nemotron is
  intermittently available but timed out at the required storyboard size.

Latest verification:

- `backend/.venv/bin/python -m pytest backend/tests/test_llm_client_json_parsing.py -q`
  -> 5 passed.
- Focused pipeline/grounding/DSL checks -> 34 passed.
- Focused deterministic panel/dialogue/DSL checks -> 28 passed.
- Earlier affected routing suite -> 61 passed.

Benchmark database state:

- Before destructive retries, the original project was backed up to
  `/tmp/bookreel-task5-before-reset.json`.
- After the final provider failure, that backup was restored: 13 pages, one
  slice, status `complete`, eight assets preserved.
- These are the old failing pages, not a Task 5 acceptance result.

Still required:

- Add OpenRouter credit/capacity or wait for a reliable free structured model,
  then regenerate with `generate_images=False`, `image_mode=none`, target/max
  pages 13, temperature 0.25, five attempts, and 300s strict-stage timeouts.
- Inspect all persisted `RenderedPage` objects and require at least 10/13 pages
  with non-empty validated `sprite_layers` and `bubble_placements`.
- Start backend on `:8001`; do not touch the unrelated process on `:8000`.
- Start frontend with `NEXT_PUBLIC_API_URL=http://localhost:8001`.
- Capture all 13 required Task 5 screenshots and record page-level rubric
  pass/fail. No Task 5 screenshots were produced from the restored baseline.
- Run full backend/frontend verification, update this log, then commit Task
  5C+5D only if the rubric genuinely passes.

2026-07-09 continuation:

- Verified paid OpenRouter access with a tiny structured request:
  - `anthropic/claude-sonnet-5` returned valid JSON (`47` input tokens,
    `20` output tokens, estimated `$0.000019`).
  - After Sonnet credit became constrained, also verified
    `deepseek/deepseek-v4-pro` returned valid JSON (`25` input tokens,
    `16` output tokens, estimated `$0.000013`).
- Ran multiple zero-image regeneration attempts with
  `generate_images=False`, `image_mode=none`, `max_storyboard_pages=13`,
  `target_storyboard_pages=13`, 300s stage timeouts, and existing 8 assets.
  No panel image generation was scheduled; the one successful persistence
  attempt reported `panel_images: 0` and `assets_after: 8`.
- Added additional deterministic robustness discovered during live runs:
  - `StoryboardArtifact` now normalizes common panel-purpose aliases before
    validation, alongside existing page-index normalization.
  - `storyboard_grounding_repair_stage` now adds missing TBC panels, clamps
    pages to configured page budgets, re-anchors facts after a clamp, and
    reruns narration-density cleanup after TBC insertion.
  - `page_composition_stage` sanitizes bubble geometry so bubbles avoid sprite
    face zones, tail sides point back to speaker sprites, unrecoverable bubbles
    are dropped, and invalid sprite refs stay filtered by asset manifest.
  - `PageComposition` now normalizes `variant: "narration"` to `speech` and
    degrades impossible grid/panel-order mismatches to default composition
    without burning repeated LLM repair calls.
- Focused tests passed:
  - `backend/.venv/bin/python -m pytest tests/test_storyboard_grounding_repair_stage_v2.py tests/test_manga_quality_service_v2.py::test_quality_gate_requires_to_be_continued_for_partial_generation tests/test_manga_quality_service_v2.py::test_quality_gate_accepts_to_be_continued_when_needed -q`
  - `backend/.venv/bin/python -m pytest tests/test_manga_pipeline_page_composition_stage_v2.py tests/test_render_view_v2.py tests/test_storyboard_grounding_repair_stage_v2.py -q`
  - `backend/.venv/bin/python -m pytest tests/test_manga_artifacts_v2.py tests/test_manga_pipeline_storyboard_stage_v2.py tests/test_storyboard_grounding_repair_stage_v2.py tests/test_dsl_validation_stage_v2.py tests/test_manga_pipeline_page_composition_stage_v2.py tests/test_render_view_v2.py -q`
- Live regeneration outcomes:
  - Sonnet run passed final story quality but failed RenderedPage assembly on a
    bubble overlapping Michael's sprite face zone. The composition sanitizer
    was added after this.
  - A later Sonnet run persisted cleanly with zero image spend, but only
    generated 5 pages because the runner used the wrong option key
    (`preferred_storyboard_pages` instead of `target_storyboard_pages`), so it
    was rejected for Task 5 acceptance.
  - Correct-target Sonnet runs got to final quality/page composition but then
    exhausted available Sonnet credit; OpenRouter reported only ~3702 output
    tokens affordable for a 6000-token page-composition request.
  - DeepSeek paid run got through storyboard but failed before quality repair
    because OpenRouter reported only ~4258 output tokens affordable for the
    default 24000-token quality-repair request.
- Because acceptance did not pass, no screenshots were captured and no commit
  was made.
- After failed destructive retries, restored the benchmark DB from
  `/tmp/bookreel-task5-before-reset.json`: project status `complete`, 1 slice,
  13 pages, 8 assets, and original coverage restored. These restored pages are
  the old baseline, not a Task 5 acceptance result.

Next concrete step:

- Add enough OpenRouter credit for at least one full 13-page run, then rerun
  zero-image regeneration and only proceed to screenshots if 13 pages persist
  and the DB rubric checks pass.

2026-07-09 continuation (deterministic-first repair and provider capacity):

- Reordered the post-storyboard repair cycle in
  `backend/app/services/manga/generation_service.py`:
  `quality gates -> storyboard_grounding_repair -> quality gates ->
  quality_repair -> storyboard_grounding_repair -> final gates`.
  `quality_repair_stage` already no-ops for a passing report, so the expensive
  24k full-storyboard rewrite is now skipped whenever deterministic repair
  clears the mechanical defects.
- Provider evidence:
  - paid OpenRouter `deepseek/deepseek-v4-pro` small structured request passed
    (`25` input / `6` output tokens; valid `{"ok": true}` JSON);
  - MiniMax highspeed small structured request returned an empty response and
    no parsed JSON, so it is not safe for this acceptance run;
  - a full DeepSeek zero-image attempt stopped at `beat_sheet` before any
    generation/persistence because OpenRouter rejected its 7000-token request
    with 402: only about 2453 output tokens were affordable.
- The failed run restored `/tmp/bookreel-task5-before-reset.json` automatically.
  Confirmed current DB state: project `complete`, 1 slice, 13 baseline pages,
  8 preserved assets, and coverage page count 13. These remain the old failing
  baseline, not acceptance output. No screenshots or rubric were produced.
- Focused checks passed:
  - `backend/.venv/bin/python -m pytest tests/test_manga_generation_service_v2.py tests/test_manga_pipeline_quality_repair_stage_v2.py tests/test_storyboard_grounding_repair_stage_v2.py tests/test_dsl_validation_stage_v2.py -q`
    -> 26 passed, 1 Pydantic deprecation warning.
  - `backend/.venv/bin/python -m pytest tests -q`
    -> 457 passed, 1 Pydantic deprecation warning.
- No Task 5C/5D commit was made because acceptance still has not passed.

Superseded next step (2026-07-10):

- Do not add OpenRouter text credit or route any text stage through OpenRouter.
  The next Task 5 attempt must use MiniMax text only, with
  `generate_images=False`, `image_mode=none`, 13-page target, and port 8000
  untouched. The deterministic-first change still eliminates the 24k repair
  call when its mechanical cleanup produces a passing report.

2026-07-10 continuation (mandatory MiniMax text policy):

- New hard rule: every text, structured-output, review, repair, and vision LLM
  call uses the server-owned `MINIMAX_API_KEY` and MiniMax model. OpenRouter is
  image-generation only. This supersedes the earlier OpenRouter strict-quality
  lane and the prior OpenRouter-credit blocker for text generation.
- Implemented enforcement in:
  - `backend/app/llm_client.py` — non-MiniMax providers/models are hard-routed
    to `MiniMax-M2.5-highspeed` with `MINIMAX_API_KEY`;
  - `backend/app/manga_pipeline/strict_json_routing.py` — strict storyboard,
    repair, and composition JSON use MiniMax too;
  - `backend/app/services/manga/vision_client_factory.py` and
    `book_understanding_service.py` — visual review no longer consumes the
    OpenRouter image key as a text/vision key;
  - `backend/app/image_generator.py` — only the low-cost
    `google/gemini-2.5-flash-image` image model is allowed and no request can
    fall back to a more expensive model;
  - `frontend/components/MangaV2ProjectPanel.tsx` — MiniMax is the fixed text
    lane; an OpenRouter key is optional and required only when image mode is
    enabled.
- Updated `AGENTS.md`, `CLAUDE.md`, `docs/next-prompt.md`, and the provider
  analysis notes to reflect the policy. Existing old 13-page baseline remains
  restored; no regeneration, screenshots, or Task 5 commit occurred here.
- Focused policy/routing suite: 53 passed; frontend `tsc --noEmit` passed.
- Broader verification: backend `pytest tests -q` -> 460 passed; frontend
  `npm run build` passed.

2026-07-10 Task 5C/5D continuation (MiniMax smoke gate):

- Audited the uncommitted tree before attempting regeneration. The hard
  MiniMax-only text policy remains present in `backend/app/llm_client.py` and
  `backend/app/manga_pipeline/strict_json_routing.py`; the deterministic-first
  repair ordering remains present in
  `backend/app/services/manga/generation_service.py`.
- Focused policy/repair checks passed from `backend/`:
  `.venv/bin/python -m pytest tests/test_provider_cost_policy_v2.py
  tests/test_llm_client_json_parsing.py tests/test_manga_generation_service_v2.py
  tests/test_manga_pipeline_quality_repair_stage_v2.py
  tests/test_storyboard_grounding_repair_stage_v2.py
  tests/test_dsl_validation_stage_v2.py -q` -> `34 passed`, with one existing
  Pydantic deprecation warning.
- Per the Task 5 gate, made exactly one tiny MiniMax structured-JSON request:
  `MiniMax-M2.5-highspeed`, `response_format={"type":"json_object"}`,
  `max_tokens=32`, temperature `0.0`, and a 60-second request cap. Exact
  non-secret result: `input_tokens=33`, `output_tokens=32`,
  `content_repr="'<think>\\nWe have a system instruction: \"Return exactly one JSON object with boolean field \\\'ok\\\' set to true.\" The user just says \"Smoke test\\n</think>\\n'"`,
  and `parsed=null`. The client also logged `JSON parse FAIL — raw content
  (0 chars): ''` after stripping the thinking block.
- This is malformed/empty structured output, so MiniMax is not usable for the
  acceptance run at this point. Stopped without any OpenRouter text fallback,
  destructive regeneration, screenshot capture, acceptance claim, or commit.
  The restored 13-page/8-asset baseline remains only the old baseline.

Next concrete step:

- Wait for a MiniMax structured-JSON response that contains valid contract
  payload rather than a token-capped thinking block, then begin a new Task 5
  attempt from the automatic backup/restore guard. Do not use OpenRouter for
  text and do not accept or screenshot the restored baseline.

2026-07-10 Task 5C/5D continuation (MiniMax-M3 transport repair):

- Consulted the current official MiniMax OpenAI-compatible API documentation.
  It documents M3 as the 1M-context multimodal model and, unlike M2.x,
  supports `extra_body={"thinking":{"type":"disabled"}}`; it also documents
  `reasoning_split=true` for separating reasoning from final content.
- Changed the default text model from `MiniMax-M2.5-highspeed` to `MiniMax-M3`
  in the backend config/client and frontend fixed MiniMax selector. Text calls
  now use `max_completion_tokens` and M3 sends documented disabled-thinking +
  split-reasoning controls. They no longer assume unsupported
  `response_format=json_object`; existing prompt, parser, and Pydantic
  validation remain the strict-JSON enforcement layer.
- Locked the visual-review factory to M3 because the documented OpenAI-compatible
  image/video content parts are M3-only. Strict stages preserve an existing
  MiniMax client unless an explicit MiniMax override is supplied, so stale
  OpenRouter model options cannot reroute calls.
- Verification:
  - focused policy/pipeline suite -> `55 passed`, one existing Pydantic warning;
  - full backend `pytest tests -q` -> `460 passed`, one existing Pydantic warning;
  - frontend `npm exec tsc -- --noEmit && npm run build` -> passed.
- New live MiniMax-M3 smoke request used the server-owned key with a
  60-second cap, `max_completion_tokens=128`, temperature `0.2`, and the
  documented M3 thinking controls. It returned valid `{"ok": true}` JSON
  (`179` input / `6` output tokens). This clears the prior M2.5 smoke gate;
  no image request was made.

Next concrete step:

- Run the guarded zero-image 13-page benchmark regeneration with M3, preserve
  all eight assets, and proceed to the persisted-page rubric only if it
  succeeds.

2026-07-10 Task 5C/5D continuation (first M3 generation attempt):

- A guarded M3 zero-image attempt began successfully and completed source
  facts, adaptation plan, character-world bible, beat sheet, and manga script.
  It then held an active MiniMax connection in the schema-bound
  `script_review_stage` for more than three minutes without returning a report
  or reaching storyboard/persistence. No image request was made.
- The temporary runner exited before persistence. The project was immediately
  restored from `/tmp/bookreel-task5-before-reset.json`; verified state is
  `complete`, 1 baseline slice, 13 baseline pages, and all 8 original assets.
  This remains the old baseline and is not an acceptance result.
- Fixed the timeout gap: `script_review_stage` now uses the same MiniMax-only
  strict client routing as the other schema-bound stages, so it receives the
  configured `script_review_timeout_seconds` (default 300 seconds) instead of
  the generic 30-minute client timeout. Focused script-review/provider/service
  tests -> `22 passed`, one existing Pydantic warning.

Next concrete step:

- Make one bounded, guarded M3 retry with a 120-second script-review timeout.
  Restore and stop if it does not reach the 13-page persisted-state rubric.

2026-07-10 Task 5C/5D continuation (M3 DB acceptance achieved):

- Replaced the legacy `MiniMax-M2.5-highspeed` default with `MiniMax-M3` for
  text and visual review. M3 calls use the documented `reasoning_split=true`
  plus disabled-thinking control, and no longer assume `response_format` gives
  M-series models a JSON guarantee. The fixed MiniMax-only policy and
  server-owned key remain intact.
- Corrected strict review routing so `script_review_stage` receives its
  bounded stage timeout. Changed an explicit `target_storyboard_pages` into an
  executable lower bound as well as the upper budget, so Task 5's 13-page
  target is truly 13-to-13.
- Added deterministic page-composition fallback geometry for invalid/missing
  LLM compositions. It uses only existing asset-manifest expressions and
  existing dialogue lines to supply valid grids, sprite layers, and bubbles;
  it creates neither images nor visible prose. Added page-scoped sprite
  filtering to remove a composition sprite whose character is not visually
  present in the matching storyboard panel.
- Final guarded M3 run used `generate_images=False`, `image_mode=none`,
  `max_storyboard_pages=13`, `target_storyboard_pages=13`. It persisted one
  new slice with exactly 13 validated `RenderedPage` docs and preserved all 8
  existing assets. No image generation was scheduled.
- Page-level DB rubric (page index: sprite layers / bubble placements):
  `0: 3/3`, `1: 4/4`, `2: 4/3`, `3: 5/3`, `4: 4/1`, `5: 4/1`, `6: 4/3`,
  `7: 6/2`, `8: 3/3`, `9: 3/3`, `10: 4/2`, `11: 4/2`, `12: 5/1`.
  All 13 pages pass the required non-empty validated sprite/bubble placement
  rubric (requirement was at least 10/13).
- Verification after the final code changes:
  - focused composition/render/DSL suite -> `49 passed`, one existing
    Pydantic warning;
  - full backend `pytest tests -q` -> `462 passed`, one existing Pydantic
    warning;
  - frontend `npm exec tsc -- --noEmit && npm run build` -> passed.

Blocker before commit:

- Task 5 still requires 13 visual reader screenshots. Backend is running on
  `127.0.0.1:8001` and frontend on `127.0.0.1:3001` with the API pointed to
  port 8001; port 8000 was untouched. The mandatory in-app browser surface is
  unavailable in this environment (browser list is empty), so screenshots
  were not captured. Do not commit until an in-app browser session is exposed,
  all 13 screenshots are saved, and the visual pass is checked.

## 2026-07-19 Documentation: Technical Architecture Blueprint

Created:

- `docs/TECHNICAL_ARCHITECTURE_BLUEPRINT.md`

The blueprint records the proposed manga-first target architecture without
claiming it is already implemented. It covers the current and target stack,
Mongo-owned durable context, Pi session boundaries, shared contracts, the manga
and reel lanes, Remotion skills and component registry, prompt-injection
containment, APIs, deployment, testing, two-person ownership, and the single
recommended implementation order.

## 2026-08-07 Planning: v2 tracker, branch, and research direction

- GitHub tracker filed: epic #11 with children #2-#10, extended with #12
  (hybrid page-art economics / rendering mechanism) and #13 (whole-book
  single-run orchestration). Manga lane first; reel lane (#9) deferred.
- Long-lived integration branch `v2-architecture` created from up-to-date
  main. All v2 work lands here via feature branches; main is merged only
  after owner confirmation.
- Local checkout reconciled with origin/main (was 12 commits behind).
  NOTE: the visual-upgrade PR's .gitignore now ignores all of `docs/`;
  `TECHNICAL_ARCHITECTURE_BLUEPRINT.md` and `research-report.md` were
  force-added here because the issue tracker cites them as canonical.
  Other local docs (architecture/product-blueprint/hackathon HTMLs, reader
  evidence PNGs) stay untracked; safety copy of everything at
  `/Volumes/Mrigesh SSD/Book-Reel-local-backup-2026-08-07/`. Owner should
  decide whether to keep `docs` in .gitignore.
- Research spikes on this branch under `docs/research/` (commit 0a3dd60):
  layout template library DONE (spec + compiler + 5 golden previews; RTL read
  ranks verified) and real-manga contract deltas DONE. The lane-C conditioned
  full-page inking experiment (issue #12) is script-ready but BLOCKED: the
  OpenRouter key's $9 total spend limit is exhausted (live 403). Raise the key
  limit, then run `docs/research/art-economics/spike_lane_c_inking.py` (~$0.12).
- Verified: ScrollStack's vertical-slice work is merged on its GitHub main
  (ScrollStack PR #10); no unique work is trapped in the orphaned local
  worktree `/Volumes/Mrigesh SSD/ScrollStack-manga`.

## 2026-08-07 Session: ADR-010 + durable-context port (issues #2, #4 first half)

Executed on `v2-architecture` in three commits (`dd2ab7e` ADRs, `a54158e`
contracts, `7c989c6` persistence+services+tests), plus this handoff commit.

Step 0 (lane-C spike, issue #12): SKIPPED — key still exhausted. Live probe of
`GET /api/v1/key` at session start and again before execution both returned
`limit: 9, limit_remaining: 0, usage: 43.545`. The spike remains fully built
and un-run (`docs/research/art-economics/out/` still has no receipts.json).
The 2026-08-07 blocker comment on #12 already records this; raise the key
limit (~$0.15 headroom needed), then run the one command in
`docs/research/art-economics/findings.md`.

What was ported (all verbatim from ScrollStack local `main` @ `43300b5`,
which is 2 commits ahead of its origin — not pushed, not our call):

- `backend/app/contracts/` — 10 modules, 30 registered contract models.
- `backend/app/persistence/` — 9 beanie Docs + protocols + InMemory/Beanie
  repositories + mongo bootstrap.
- `backend/app/services/{hashing,errors,source_units,scopes,context_compiler,
  memory,generation_runs}.py`.
- `backend/scripts/export_contracts.py`; `packages/fixtures/` (32 canonical +
  6 invalid); `packages/contracts/schema/` (30 JSON Schemas).
- `docs/adr/001–009` adopted as-is + new ADR-010 (decision, full inventory,
  name-mapping table, boundary-edit log, deferrals). NOTE: `docs/` is
  gitignored (`.gitignore:39`) — ADRs were committed with `git add -f`.
- Tests: `backend/tests/{test_durable_context,test_contracts}.py` (54 tests).

Boundary edits — the complete list (everything else is byte-identical to the
donor, verified by `diff -r` before commit):

1. sys.path shim prepended to the two ported test files (repo convention;
   donor used pyproject `pythonpath`).
2. 19/30 schema JSONs regenerated under this repo's pydantic 2.10.3 (donor
   generated them under 2.11.7; output differs across pydantic minors).
   `PYTHONPATH=. uv run python scripts/export_contracts.py --check` is clean.
3. `pytest==9.1.1` added to `backend/requirements.txt` (was ad-hoc-only in
   `.venv`, gate unreproducible without it).

Deliberately NOT done (recorded in ADR-010):

- `generation_workflow.py` NOT ported: 1792 lines importing 7 modules outside
  the port set (ScrollStack's manga pipeline — rejected by ADR-010); its only
  test coverage is the whole-app `test_vertical_slice.py`. Deferred to the
  orchestration/agent-worker phase.
- TS contracts package (generate.mjs / Ajv / vitest): deferred to the pnpm
  workspace phase.
- Nothing wired into v1: ported Docs are in none of the three `init_beanie`
  lists (`main.py`, `celery_worker.py`, `scripts/_db.py`); grep for
  `app.contracts|app.persistence` across v1 modules is empty.
  `persistence/mongo.py` must not be called until the wiring phase (it
  assumes beanie 2.x semantics; this repo runs beanie 1.27 + motor — see
  ADR-010 for the wiring-phase decision).

Verification evidence:

- Pre-port compatibility: donor suites run against THIS repo's venv
  (beanie 1.27.0 / pydantic 2.10.3 / pymongo 4.10.1) → 53/54, sole failure
  was the schema drift fixed by boundary edit 2.
- Baseline before any change: `cd backend && uv run pytest tests/ -q` →
  462 passed. After port: 516 passed (462 + 54 new), zero regressions,
  same 1 pre-existing pydantic deprecation warning.
- `uv run` resolves `backend/.venv` (uv 0.11.15, non-project mode), so the
  `cd backend && uv run pytest tests/ -q` gate works as written.
- `git diff --check` clean on every commit.

Next concrete steps:

1. Raise the OpenRouter key limit, run the lane-C spike, decide #12.
2. Issue #4 second half: normalize existing parsed books into source units,
   wire the v1 manga pipeline to consume compiled ContextPacks (no output
   change — blueprint Phase 1 exit), scope-selection API/UI. This is where
   the beanie 1.27-vs-2.0 wiring decision in ADR-010 gets made.
3. TS contracts side + pnpm workspace when the agent-worker phase starts.

## 2026-08-07 Session 2: durable context wired into v1 (issue #4 second half)

Executed on `v2-architecture` in four commits (`c10d8a9` normalization,
`8086bdc` persistence wiring + scope API + ADR-011, `5838db3` flag-gated
ContextPack consumption, plus this handoff/proof commit).

Step 0 (lane-C spike, issue #12): SKIPPED again — live probe of
`GET /api/v1/key` returned `limit: 9, limit_remaining: 0, usage: 43.545`
(unchanged since last session; the blocker comment on #12 stands). Raise the
key limit (~$0.15 headroom), then run the one command in
`docs/research/art-economics/findings.md`.

What landed (blueprint Phase 1 / ADR-011 — read it first, it has the full
rationale):

1. **Wiring decision executed**: stayed on beanie 1.27 + motor. The seven
   collision-free donor Docs are registered at all three init_beanie sites
   through `persistence/v1_bridge.py::init_wired_documents` — the donor
   `initialize_mongo` adapted to motor, INCLUDING its `tz_aware=True` via a
   second client (discovered live: ported contracts demand aware datetimes;
   v1's naive client would have broken `ScopeService`'s duplicate-read path;
   v1's client stays naive so v1 API response shapes are untouched).
   DEVIATION from the session brief: donor `BookDoc`/`MangaProjectDoc` are
   registered NOWHERE — their unique indexes on the live `books` /
   `manga_projects` collections (different schemas, fields absent) would
   corrupt the guards. `V1BridgedRepositories` reroutes book/project methods
   to the live v1 docs; v1 `MangaProjectDoc` gained additive
   `active_memory_version` (blueprint §7.2's pointer), materialized via $set
   by `ensure_genesis_snapshot` because raw $eq never matches missing fields.
   Beanie-1.27 semantics were smoke-tested live on Atlas BEFORE wiring
   (4/4: construct round-trip byte-exact, sorted finds, UpdateResult
   modified_count 1/0, DuplicateKeyError on unique indexes).
2. **Structure-aware source units** (`services/book_normalization.py` +
   `app/scripts/normalize_source_units.py`): section-level units, byte-exact
   splitting under the 20k excerpt cap, conservative front-matter detection
   (empty content + apparatus headings), reconstruction that reproduces
   `build_source_text_for_slice` byte-for-byte and fails loud on drift.
   KEY FINDING: WMC's parse has DEGENERATE page provenance — all 17 chapters
   report pages 1-1 of a 39-page PDF (v1 Docling dropped page ranges; the
   arc outline's "pages 1-14" is model-authored). Pages are stored as
   parsed, never fabricated; chapter_index is the reliable spine.
   WMC normalized: 16 units (3 empty front-matter sections -> 0 units; the
   24.5k story chapter split in 2), byte-equality PASS over 70,580 chars,
   re-run creates 0 units (idempotent).
3. **Scope-selection API** (`api/routes/scopes.py`): POST
   /books/{id}/scopes (page_ranges OR chapter_indexes — chapter selection
   exists because page overlap cannot discriminate on a degenerate-parse
   book; front matter skipped unless include_front_matter), GET list, GET
   scopes/coverage (ToC + front-matter flags + active-snapshot coverage).
   Chapter selection reuses ported ScopeService verbatim through a filtered
   repository view (donor hash/idempotency semantics intact). Curl evidence:
   `docs/evidence/session2-continuity-proof/curl_scopes_api.txt`. NO UI yet.
4. **Flag-gated consumption** (`services/compiled_context_bridge.py` +
   `generation_service.py`): `Settings.use_compiled_context`, default OFF.
   On: genesis -> idempotent scope freeze for the slice range -> ContextPack
   at active memory version -> accepted context_pack ArtifactDoc under an
   idempotent GenerationRunDoc -> slice text rebuilt from hash-verified units,
   byte-compared against the legacy builder, HARD RAISE on mismatch. After a
   successful slice: deterministic MemoryDelta merge (coverage + the exact
   recap/hook strings v1 wrote to its ledger, citing the pack artifact).
   IMPORTANT caveat for the next session: flag-on was proven at bridge level
   (live byte-equality on the real slice range 1-14 + full InMemory two-slice
   continuity tests) — NOT via a full live slice run, because the WMC arc
   outline is fully covered (no next slice exists) and faking ~20 grounded
   LLM stages isn't viable. First real flag-on slice run should happen on the
   next fresh project (Session 3+ / first Manga Director run).
5. **Continuity proof on WMC** (`backend/scripts/continuity_proof_wmc.py`,
   two separate processes; evidence JSONs committed under
   `docs/evidence/session2-continuity-proof/`):
   - phase-a 4/4 PASS (pid 5688): live bridge byte-equality (70,580 chars);
     scope A (story chapters 4-8, 6 units) + pack A + accepted artifact;
     deterministic delta (3 grounded facts w/ real source refs + ending +
     coverage) merged, pointer advanced 0 -> 1 ON THE LIVE v1 doc;
     pack B compiled at v1, hash recorded.
   - phase-b 10/10 PASS (pid 9020, fresh process): scope B idempotent across
     processes; pack B recompiled HASH-IDENTICAL from Mongo alone; pack B
     contains scope A's facts + previous_slice_ending; coverage marks scope
     A's units; required facts survive squeeze to 10,799 tokens (floor
     10,789; `previous_slice_continuity` dropped, all source excerpts kept);
     sub-floor budget fails loud; stale delta (base v0 vs active v1) rejected
     with pointer + snapshot hashes unchanged; run idempotency at active
     memory version (a run against NEW memory is correctly a new key).

Tests: 563 passed (516 baseline preserved + 47 new across
test_book_normalization_v2 / test_compiled_context_bridge_v2 /
test_scopes_api_v2). `git diff --check` clean per commit.

Safety/live-write ledger: backup of book+project+slices+pages+assets at
`/tmp/bookreel-s2-before-wiring.json` (546 KB) BEFORE any live write. Live
writes performed: additive `active_memory_version: 1` on the WMC project doc,
16 source_units, 4 scope_manifests, 2 memory snapshots (v0/v1), 3 runs,
2 context_pack artifacts + indexes on the 7 new collections. NO destructive
operation ran; v1 collections otherwise untouched. No provider calls of any
kind this session (everything deterministic), so no receipts were needed.

NOTE for re-runs: phase-a is one-shot by design — its merge advanced the
pointer 0 -> 1, so a re-run correctly dies with StaleMemoryDeltaError at the
merge step (phase-b is safely re-runnable). Also: the celery get_db init path
was not exercised live this session (the identical double-init pattern was
proven via _db.connect() in three script runs plus the uvicorn boot), and
init_wired_documents' client is not closed in the celery/scripts paths —
matching the pre-existing per-call client pattern there.

Known rough edges / next steps:
1. Raise the OpenRouter key limit, run lane-C, decide #12 (still first).
2. Issue #4 remainder: ToC-picker/coverage UI (API is done); first REAL
   flag-on slice run on a fresh project; front-matter heuristics for
   back-matter ad pages (WMC ch11-16 currently unflagged); GC of
   superseded parse generations.
3. Session 3 per roadmap: pnpm workspace + agent-worker/agent-runtime port
   (#8), MiniMax Manga Director goal (#3) — see docs/next-prompt.md.

## 2026-08-07 Session 3: agent plane live — pnpm workspace, Pi runtime, broker, first MiniMax Director goal (issues #8, #3 first half)

Executed on `v2-architecture` in seven commits (`139c738` workspace +
contracts TS, `9855e98` agent-runtime/agent-worker, `2e2d298` broker
backend, `47ce4d2` director driver, `d3225ba` injection suites, `0f0d81a`
live run + evidence, ADR-012 docs commit), plus this handoff. Read
docs/adr/012 first — it enumerates every boundary edit and deviation.

Step 0 (lane-C spike, issue #12): SKIPPED again — live probe of
`GET /api/v1/key` at session start returned `limit: 9, limit_remaining: 0,
usage: 43.545` (unchanged since Session 2; the blocker comment on #12
stands). Raise the key limit (~$0.15 headroom), then run the one command in
`docs/research/art-economics/findings.md`.

What landed (blueprint Phase 0 exit closed + all of Phase 2):

1. **pnpm workspace + contracts TS side** (ADR-010's deferred piece):
   generate.mjs / Ajv validators / vitest fixtures ported verbatim from
   ScrollStack @ 43300b5; `src/generated/*` regenerated under THIS repo's
   pydantic-2.10.3 schemas; `pnpm test` in packages/contracts -> 42 passed —
   Python and TypeScript now validate the same 32+6 fixtures. Environment:
   node v22.23.0 (>=22.19 requirement met), pnpm 10.15.1, APFS volume.
2. **packages/agent-runtime + apps/agent-worker** verbatim @ 43300b5.
   Pi SDK exact-pinned 0.80.10 (re-evaluated, kept — donor-proven).
   minimax/MiniMax-M3 resolves from the BUNDLED catalog with network
   discovery disabled. Package names keep the @scrollstack scope for
   diff-provable fidelity (rename deferred; ADR-012 edit 2).
3. **Domain-tool broker**: donor `domain_tools.py` + `agent_worker.py`
   verbatim; `internal_tools.py` router adapted (no container / no global
   error handler here — ADR-012 edit 5) and mounted in main.py over
   V1BridgedRepositories. Every tool call re-authorized against
   run/stage/context-pack ownership; unknown tools fail closed 404;
   cross-project 403. NOT ported: `page_domain_tools.py` (needs Session 4's
   manga_layout/manga_page_planning/manga_validation).
4. **Manga Director driver** (`app/services/manga_director.py`, NEW code
   mirroring the donor's workflow stage): scope -> ContextPack at ACTIVE
   memory version -> accepted context_pack artifact under idempotent
   run/stage rows -> typed AgentGoal (ADR-004 allowlist, bounded budget:
   max_text_cost_usd 0.50, max_pages 8) -> worker -> candidate must ALREADY
   exist as a broker-validated artifact -> MiniMax receipt required
   (issue #3 policy: manga_direction -> minimax/MiniMax-M3) -> accepted
   artifact + ModelReceipt. Idempotent re-run returns the existing plan
   with no model call.
5. **Prompt-injection containment** (blueprint §14): schema-valid malicious
   fixtures under `packages/fixtures/injection/` (outside manifest.json by
   design); 16 Python + 7 TS tests assert the capability boundary: built-in
   tool names fail closed, allowlists cannot be expanded by pack content,
   fabricated/hash-tampered evidence is rejected, injected text returns as
   bounded untrusted data.
6. **LIVE Phase 2 exit** (evidence: `docs/evidence/session3-live-director/`):
   one bounded MANGA_DIRECTION goal on the WMC project, scope B
   (3 units, memory v1). Pi session `019fdc46-81a1-786a-94b4-15a59143fc0e`
   returned a MangaPlan accepted by every canonical validator. Receipt:
   minimax / MiniMax-M3, 18,844 in / 43,940 out tokens, $0.06791976,
   291,379 ms. Complete control-plane call log for the run:
   submit_manga_plan x3 (422, 422, 200) — nothing else; the two rejections
   are the deterministic validators catching schema-invalid drafts (12 and
   39 pydantic errors), repaired by the model. v1 collections byte-untouched
   (1 slice / 13 pages / 8 assets, memory pointer still v1). Idempotent
   re-invocation: reused=True, 12.5 s, zero model calls.

MiniMax spend this session (authorized): TWO live worker runs. Run 1
(~310 s) FAILED at the driver's receipt gate because both of its
submissions were 422-rejected — its tokens were consumed but no artifact
was accepted, so NO receipt exists for it; estimated ~$0.06 by analogy.
Run 2 succeeded with the $0.0679 receipt above. Honest total: ~$0.13-0.14.
Per-goal actuals to budget with going forward: ~$0.07 / ~5 min per
direction goal (NOT the $0.02-0.04 OpenAI-lane figure — see the thinking
deviation in ADR-012: Pi routes M3 through api.minimax.io/anthropic with
reasoning ON and no extra-body hook, so disabled-thinking/reasoning_split
controls are unreachable through the pinned SDK).

Verification: backend 609 passed (563 baseline + 46 new); pnpm suites
42 + 19 + 12; `node scripts/generate.mjs --check` and
`PYTHONPATH=. uv run python scripts/export_contracts.py --check` both
clean; `git diff --check` clean per commit.

Safety/live-write ledger: full-DB backup (17 collections, 56 docs, 764 KB)
at `/tmp/bookreel-s3-before-live-director.json` BEFORE any live write.
Live writes were purely additive v2-lane rows: 1 context_pack artifact,
1 candidate + 1 accepted manga_plan artifact, 1 generation run, 1 stage
run. No destructive operation ran; both dev servers (uvicorn :8001, worker
:8788) were shut down at session end.

Running the stack live (values NOT committed anywhere — compose your own):
backend needs `DOMAIN_TOOL_BROKER_TOKEN`; the worker needs that same token
plus a DISTINCT `AGENT_WORKER_TOKEN` (both >=32 chars or config.ts throws),
`DOMAIN_TOOL_BROKER_URL=http://127.0.0.1:<backend port>`,
`AGENT_PROVIDER=minimax`, `AGENT_MODEL=MiniMax-M3`,
`AGENT_MODEL_API_KEY_ENV=MINIMAX_API_KEY` (enforced for minimax), and
`MINIMAX_API_KEY` from backend/.env. Then `GET /readyz` on the worker must
be 200 before any goal (proves catalog + credential), and
`backend/scripts/live_manga_director.py <scope_id>` drives one goal.

Known rough edges / next steps:
1. OpenRouter key limit still exhausted -> lane-C spike -> #12 (unchanged).
2. First REAL flag-on v1 slice run STILL outstanding (Session 2 carryover):
   WMC's arc is fully covered so it needs a fresh project, and at measured
   M3 costs a ~20-stage run is >$1 — deliberately not burned this session.
3. `page_domain_tools.py` port + MANGA_PAGE_WRITING / MANGA_THUMBNAIL goals
   belong to Session 4 (layout compiler brings their dependencies).
4. Tool-call traces not yet durably persisted (receipt + session id are);
   worker egress not yet restricted; ARTIFACT_REPAIR has no goal policy.
5. Session 4 per roadmap: layout compiler + page-script/thumbnail stages +
   template library + craft validators; SVG preview loop on one WMC
   chapter — see docs/next-prompt.md.

## 2026-08-08 Session 4: layout lane live — port, drivers, templates, craft validators, bake-off (issues #5, #6, #3, #8)

Executed on `v2-architecture` (commits `b5a04d4` port, `cc7938e` drivers +
injection walls, `5b21276` templates + craft validators, `c3abfe5` agentic
flag lane, `b754470` live-run fixes, `eb95c68` evidence + ADR addendum, plus
bake-off evidence and this handoff). Read the ADR-012 **Session 4 addendum**
first — it enumerates every boundary edit, the adapter bug, and the skill
generalization.

Step 0 (lane-C, issue #12): **already executed by the planning session**
minutes before this session started (out/ files 14:00–14:01 IST, verdict
comment on #12, prompt updated to forbid re-running). Verified independently
here: the key's live usage ($0.0784488) equals the three receipts exactly,
and my own review of the generated pages against findings.md's protocol
concurs with the posted verdict (6/7 boundary adherence, conditioning is
the mechanism, zero real text — OCR gate false-positives on screentone,
identity holds, content drift is the open risk). NOT re-run; zero image
spend this session.

What landed:

1. **Layout-lane port** (verbatim @ 43300b5, ADR-010/012 rule):
   `manga_layout.py` (authoritative compiler + SVG previews),
   `manga_page_planning.py` (durable page-script/thumbnail artifacts),
   `manga_validation.py`, `page_domain_tools.py`
   (MangaPlanningToolService + MangaDomainToolService dispatcher), plus
   both donor test suites (sys.path shim only). `main.py` now mounts the
   merged dispatcher; the donor's `list_relevant_assets` planning-first
   dispatch quirk is kept verbatim and PINNED by test (never fired live —
   0×403/404 across every live goal this session).
2. **Typed planning goal drivers** (`manga_page_planner.py`, NEW code
   mirroring donor `generation_workflow` internals): MANGA_PAGE_WRITING and
   MANGA_THUMBNAIL extend the Manga Director's run with fresh
   purpose-scoped ContextPacks per stage, donor allowlists/budgets,
   broker-validated candidates, and EXACT per-instance model receipts
   (issue-#3 policy: both planning purposes -> MiniMax-M2.7-highspeed;
   `required_model` override = documented A/B hatch). Panel target derives
   from the accepted plan's beat count (live-run deviation from the donor's
   fixed 4 — see addendum).
3. **Injection walls extended** (`test_prompt_injection_pages_v2.py`, 17
   tests): director tools unreachable from page-writing scopes and vice
   versa; builtin names fail closed through the merged dispatch (403 wall
   before the 404 wall under planning stages); purpose-mismatched packs
   refused; the dispatch quirk pinned.
4. **Layout-template library** (`manga_layout_templates.py`): all 18
   catalog templates from the research spike as pure ADR-009 node data;
   `instantiate_template(panel_ids in reading order)` -> layout_root +
   reading-edge chain; purpose/tempo/panel filters; every AdaptationBeat
   purpose has >=2 templates; all 18 compile through the PORTED compiler
   with RTL-coherent flow (25 tests). Deferred: `layout-template.v1`
   contract schema, `list_layout_templates` broker tool, seeded jitter,
   mask export for lane-C conditioning.
5. **Craft validators** (`manga_craft_validation.py`, advisory warnings,
   red fixture each — 8 tests): PANEL_COUNT_HIGH, CLIMAX_PAGE_UNJUSTIFIED,
   MONOTONE_SHOT_PAGE, FLAT_PAGE_ENDING, TEXT_BUDGET_EXCEEDED (90-char
   bubble line), RTL_READING_FLOW_INCOHERENT (geometric Z-path lint).
   Proven immediately on live output — see 8 below.
6. **AGENTIC_MANGA_PIPELINE_V1** (default OFF, `agentic_pipeline_bridge.py`
   + `generation_service.py` hook, 7 tests): flag ON runs
   direction->page-writing->thumbnail as a fallback-guarded SHADOW lane on
   the slice's frozen ADR-011 scope after a successful v1 slice; every lane
   failure is logged and swallowed; flag OFF never imports the module — v1
   byte-identical (684-test suite green).
7. **Live-run fixes** (commit `b754470`, full story in the ADR addendum):
   the pinned Pi SDK never sends tool-result `details` to the model, so
   every READ tool degraded to a one-line summary — a donor bug invisible
   until the first goal that needed to read. Fixed in `tool-adapter.ts`
   (bounded data now rides in model-visible text) + regression test. The
   planning skills' bounded sections hard-coded the legacy 3-panel shape
   while driver instructions are untrusted user notes — now goal-shape-
   generic (`manga-page-writing` 1.3.0, `manga-thumbnail` 1.4.0).
8. **SVG preview loop on WMC** (zero image calls,
   `scripts/preview_bakeoff_thumbnails.py`, evidence in
   `docs/evidence/session4-svg-previews/`): both accepted thumbnail pages
   reconstructed from Mongo+storage alone (ADR-009 resume path), rendered
   to PNG, eyeballed. Reading-order finding: the accepted set carries
   RTL_READING_FLOW_INCOHERENT defects (top rows read left-to-right on
   both pages) that the error-level validators cannot see — issue #5's
   craft-gap thesis demonstrated on live output. Deliberately NOT
   regenerated: accepted artifacts are immutable evidence; enforcement
   wiring is Session 5.

Verification: backend `uv run pytest tests/ -q` -> **684 passed** (609
baseline + 75 new; zero new warnings). TS: contracts 42, agent-runtime 20
(19 + 1 new), agent-worker 12. `node scripts/generate.mjs --check` and
`PYTHONPATH=. uv run python scripts/export_contracts.py --check` clean.
`git diff --check` clean per commit.

Model bake-off (issue #3, owner-requested): MiniMax-M2.7-highspeed vs M3
on the SAME MANGA_DIRECTION goal shape (prompt `manga-direction.v2`,
identical skill hash, same WMC chapter set — the hs arm froze its OWN
scope over byte-identical source units via
`backend/scripts/bakeoff_session4.py`). The structured-JSON smoke on
M2.7-highspeed PASSED first ($0.000174, 2.0 s) before any goal spend —
the M2.5-highspeed lesson applied. Evidence:
`docs/evidence/session4-bakeoff/`.

| goal (model) | tokens in/out | cost | latency | validator attempts | quality notes |
|---|---|---|---|---|---|
| direction — M2.7-highspeed | 16,102 / 4,725 | $0.026453 | 77.4 s | accepted, receipt attempt 1 (submission-level log not durably captured — S5 step 0.3) | passes every canonical validator; coherent hook->cliffhanger arc; beats grounded (source_refs + fact ids); prose literal/summary-like |
| direction — M3 (Session 3 receipt reused as baseline*) | 18,844 / 43,940 | $0.067920 | 291.4 s | 3 submissions (422, 422, 200 — Session 3 broker log) | passes every canonical validator; equivalent structure (8 beats / 8 pages, ~8% larger JSON); dramatization reads more cinematically manga-directed |
| page-writing — M2.7-highspeed (no M3 comparator ran) | 34,135 / 3,599 | $0.030163 | 42.0 s | accepted, receipt attempt 1 (same caveat) | accepted `page_script_set`; fast-lane actual, not a comparison row |
| thumbnail — M2.7-highspeed (no M3 comparator ran) | 157,944 / 12,939 | $0.131697 | 165.4 s | accepted, receipt attempt 1 (same caveat) | accepted `thumbnail_set`; input dominated by the validate_layout_draft echo (S5 step 0.1); accepted set carries RTL craft warnings (validator gap, S5 step 0.2) |

\* Not a same-day controlled arm: different run + context pack (18,844 vs
16,102 input tokens), and M3's 43,940 output tokens include reasoning
(the pinned Pi SDK routes M3 with reasoning ON — ADR-012). The harness's
`m3` arm exists (`bakeoff_session4.py m3`) and was deliberately NOT run
(~$0.07 saved): the Session 3 receipt already answers the question at
direction-goal granularity.

**VERDICT (owner decision rule applied): quality EQUIVALENT at the
deterministic-validator level** — both plans fully accepted, structurally
equivalent; the only M3 edge is subjective prose quality on the one
purpose already assigned to M3. So: **change nothing — the issue-#3
policy table stands and the fast lane is CONFIRMED live** (page-writing +
thumbnail on M2.7-highspeed, direction on M3). hs direction is 2.6x
cheaper and 3.8x faster, but that is no basis for switching direction off
M3 (never silently switch defaults). The speed/quality ModelPolicy modes
(speed=M2.7-highspeed, quality=M3, default quality/M3, per-purpose
defaults config-not-code) are standing owner policy 2026-08-08; their
plumbing is Session 5 Goal B. Table + verdict posted as a comment on
issue #3.

Capture footnote: `arm_hs.json`'s direction goal says `reused: true` —
that is the idempotent re-invocation during the JSON capture; the receipt
itself is the arm's own fresh Session 4 M2.7-highspeed call
(`run_dir_a99464c…`, distinct from Session 3's `run_dir_d03359d…`,
created 2026-08-08T09:22:45Z).

MiniMax spend this session — receipted, $0.188486 across 4 receipts:
smoke $0.000174, direction $0.026453, page-writing $0.030163, thumbnail
$0.131697 (all in `docs/evidence/session4-bakeoff/`). Estimated, NO
receipts — failed worker runs persist nothing (the gap is Session 5 step
0.3): the details-bug page-writing failure and the skill-shape refusal,
both input-heavy/low-output, ~$0.03 each by analogy with the successful
page-writing profile (~$0.05-0.08 combined). Kept separate from the
receipted total on purpose. Image spend: ZERO this session — lane-C's
$0.0784 was the pre-session planning spike, receipts committed in
`docs/research/art-economics/out/receipts.json` and verified equal to the
key's live usage.

Safety/live-write ledger: full-DB backup (715 KB) at
`/tmp/bookreel-s4-before-bakeoff.json` BEFORE any live write (14:49 IST;
first receipt 14:52 IST). Live writes were purely additive v2-lane rows
on the hs arm's own scope/run (`scope_fcf2959…` / `run_dir_a99464c…`):
context packs, candidate + accepted artifacts (manga_plan,
page_script_set, thumbnail_set, page_layouts, compiled_layouts,
thumbnail_previews, validation report). No destructive operation ran; v1
collections untouched.

Deviations from the session brief:

1. The bake-off's M3 arm was not re-run; Session 3's receipt serves as
   the M3 baseline (see the table footnote). Deliberate: evidence-
   preserving and ~$0.07 cheaper.
2. Failed-run costs are estimates — no durable traces exist for failed
   agent runs (named Session 5 step 0.3).
3. Panel target derives from the accepted plan's beat count, not the
   donor's fixed 4 (ADR-012 addendum item 2).
4. This closeout (bake-off table, verdict, this handoff, issue updates)
   was completed by a follow-up agent working from on-disk state after
   the session's working agent crashed on a network failure. All
   substantive work above was already committed and pushed through
   `eb95c68`.

Known rough edges / carry-forwards (Session 5 — docs/next-prompt.md):

1. validate_layout_draft model-visible payload trim (the 158k-token
   thumbnail input — step 0.1).
2. Craft warnings not surfaced in the live loop: the ACCEPTED WMC
   thumbnails carry RTL_READING_FLOW_INCOHERENT defects (step 0.2).
3. Failed-run receipts/traces + tool_calls on stage rows (step 0.3,
   issue #8 traces checkbox).
4. First REAL flag-on v1 slice run on a fresh project (Sessions 2-4
   carryover).
5. Worker egress restriction; ARTIFACT_REPAIR goal policy (Session 3
   carryover).
6. layout-template.v1 contract schema, `list_layout_templates` broker
   tool, seeded jitter, skeleton/mask export from compiled geometry
   (feeds the lane-C conditioning work).
7. Issue #6 knowledge-base rewrite — reference files are still stubs;
   Session 4 only generalized the bounded shape sections.

## 2026-08-09 Session 5: rendering mechanism live — page-art stage, gates, ModelPolicy modes, carry-fix trio (issues #12, #7, #5, #3, #8)

Executed on `v2-architecture` (commits `f534373` step 0.1, `0630224` step
0.2, `4ab7df6` step 0.3, `ee100ee` Goal B, `e218cbd` page-art machinery,
`78867ff` live-run evidence, plus this closeout). Read the ADR-012
**Session 5 addendum** (entries 1–6) — every boundary edit and the live
gate calibration are enumerated there.

**HEADLINE FINDING (top input to Session 6):** the Session 4 ACCEPTED WMC
page scripts carry ONE-WORD story beats ("hook", "conflict", "reveal")
and ZERO text elements. Live consequence measured this session: the
lane-C image model drew from nearly-empty briefs (content drift straight
into invented imagery), vision QA brief-matching was noisy, and live
lettering was vacuous (nothing to letter). The rendering mechanism is
proven; the PAGE-WRITING CONTENT QUALITY is now the binding constraint.
Fix the page-writing skill/instructions (real beats, authored text
elements) and gate on it before reader-v2 scoring.

What landed:

1. **Step 0.1 — validate_layout_draft trim** (`f534373`): per-tool
   MODEL_VISIBLE_DATA_KEYS projection in `tool-adapter.ts`; the model sees
   `passed/compiler_hash/preview_hash/issues/normalized_page_plan` only;
   `compiled_layout` + `preview_svg` stay in details + broker response.
   Kills the measured 158k-token thumbnail echo ($0.13/goal class).
2. **Step 0.2 — craft warn-vs-block gate** (`0630224`):
   `CRAFT_RULE_POLICY` — RTL_READING_FLOW_INCOHERENT BLOCKS (escalated to
   error at validate_layout_draft AND thumbnail acceptance); the other
   five rules warn. Craft validator v2. Regression fixture frozen from
   the live defective accepted WMC page
   (`backend/tests/fixtures/wmc_session4_rtl_defect_page_plan.json`):
   the Session 4 accepted set is now REJECTED on resubmission (accepted
   artifacts in Mongo untouched — immutable evidence). NOTE: fresh
   planning runs must produce RTL-coherent sets from here on.
3. **Step 0.3 — durable failed-run receipts** (`4ab7df6`): pi-runtime
   snapshots stats on every exit path; `AgentRuntimeRunError` carries the
   trace; worker 422 body exposes `failure_trace`; Python client parses
   it; both drivers persist failed stages (status, error, measured trace,
   `failure_history` receipt that survives retries) and mark the run;
   retries re-arm with attempt+=1. Success traces (incl. tool_calls) now
   stored on stage rows — issue #8 traces checkbox done.
4. **Goal B — ModelPolicy modes** (`ee100ee`): `model_policy.py` — mode
   speed=MiniMax-M2.7-highspeed, quality=MiniMax-M3, DEFAULT quality;
   per-purpose defaults config-not-code (`Settings.agent_model_mode_*`,
   env-overridable): direction=quality, page-writing/thumbnail=speed;
   vision LOCKED to M3 in code (speed override refused). Drivers resolve
   through the policy; constructor `required_model` = receipted A/B hatch.
   `ModelReceipt` += `model_mode` + `model_mode_source` (additive;
   schemas + TS regenerated) — receipts prove mode AND provenance.
   Worker still binds ONE model per process; mixed-mode pipelines need
   per-mode workers (receipt gates fail loud on mismatch).
5. **Page-art machinery** (`e218cbd`): `manga_page_art.py` (pure) +
   `manga_page_art_stage.py` (durable driver) + `manga_vision_qa.py` (M3
   adapter). Deterministic rendering-mode policy in CODE (B=splash/
   spread, A=all-hold-no-action, C=default); conditioning skeleton (thick
   borders + read badges) + polygon->mask export (the Session 4 deferred
   item) from compiled geometry; production OCR gate (dictionary + min
   confidence + min word count); border-adherence accept/retry signal
   (deliberately NOT Layout-IoU — #10/Session 6); M3 vision QA (panel
   count + briefs + identity) with selective per-page retry + hardened
   prompt; v2 composition with code-owned lettering (bubbles, captions,
   SFX; tails deferred); DSL-only degradation (never block a page on an
   image); `page_art`/`composed_page`/`provider_receipt` ArtifactDoc rows
   (schema strings; contract promotion with the Session 6 reader
   consumer); bridge wiring with zero-budget default (flag-on spends no
   image dollars unless granted).
6. **Live lane-C run on the Session 4 accepted WMC pages** (`78867ff`,
   evidence `docs/evidence/session5-page-art/`): batch 1 (gates v1,
   4 calls, $0.156) — border adherence 1.0 and OCR CLEAN on every
   attempt (skeleton conditioning + noise filter both WORK), but all
   attempts rejected solely by vision `contains_text` firing on drawn
   scribble/pseudo-glyph texture. Calibration (GATE_POLICY_VERSION
   v2, part of the stage input hash): OCR gate is the text authority
   (issue #12 flowchart); vision text flag is advisory; rejected art now
   persists to evidence. Batch 2 (gates v2, 2 calls, $0.078): BOTH pages
   ACCEPTED attempt 1 — 4/4 panels, borders 1.0, OCR clean, full artifact
   lineage (page_art + slicing map + composed pages). The art is
   genuinely strong (maze corridors, cheese, mice, bunny-slipper Hem);
   identity vs reference sheets is loose (recorded).

Verification: backend `uv run pytest tests/ -q` -> **722 passed** (684
baseline + 38 new; no new warning classes — utcnow/config classes
pre-existing, more instances from new tests). TS: contracts 42,
agent-runtime 22 (20+2), agent-worker 13 (12+1). `node scripts/generate.mjs
--check` + `PYTHONPATH=. uv run python scripts/export_contracts.py --check`
clean. Injection suites green (17+16+7 inside those totals).
`git diff --check` clean per commit.

Spend ledger (ALL receipted — 12 `provider_receipt` artifacts + evidence
ledger `receipts.jsonl` + `vision_smoke.json`):

| lane | calls | cost | notes |
|---|---|---|---|
| image (OpenRouter, gemini-2.5-flash-image) | 6 | **$0.2341125** | batch 1: 4 x ~$0.039 = $0.156 (all rejected under gates v1 — calibration evidence, receipted); batch 2: 2 x ~$0.039 = $0.078 (both accepted). EXACTLY equals the key's live usage delta (0.0784488 -> 0.3125613). |
| MiniMax M3 vision QA | 6 + 1 smoke | **$0.002628** | ledger $0.002224 (4 batch-1 + 2 batch-2 calls) + smoke $0.000404 (9.8s, measured BEFORE the batch, receipted in vision_smoke.json); per-call ~$0.0002–0.0008 |
| MiniMax agent goals | 0 | $0.00 | Session 4 accepted planning artifacts reused; no new agent goals |

Total session provider spend: **$0.2367405** (image cap $1.00: used 23%;
text cap ~$1.00: used 0.3%). Full-DB backup BEFORE live writes:
`/tmp/bookreel-s5-before-pageart.json` (17 collections / 93 docs / 1.08 MB).
Live writes were additive v2-lane rows on the hs-arm run
(`run_dir_a99464c…`): 2 page-art stage rows (gates v1 + v2 — the v1 stage
row with its DSL-only outcome is immutable evidence), 12 receipts, 2
page_art, 4 composed_page artifacts. No destructive operation; v1
collections untouched; run left status=succeeded.

Deviations from the session brief (enumerated):

1. Border-adherence, NOT Layout-IoU: real IoU needs detected panels and
   belongs to #10 (Session 6). Named as such in code/artifacts.
2. Mid-session gate recalibration (v1 -> v2): vision contains_text
   demoted to advisory after the live false-positive evidence; policy
   version rides the stage input hash (no silent reuse). Batch 1's
   rejected art was NOT persisted (gap fixed for batch 2+); batch 1's
   run_summary.json was overwritten by batch 2 — its full story lives in
   the v1 stage row trace + the 8 batch-1 receipts in receipts.jsonl.
3. Main-goal 4 partially delivered: lettering is fresh minimal code
   (bubbles/captions/SFX, wrap, z-order) — bubble TAILS and the v1
   vector-scene/bubble-rules carry are DEFERRED to Session 6. Lane A/B
   pages currently compose DSL-only (no sprite/key-panel paths yet).
4. Rendering-mode policy inputs are page_kind + tempo/purpose (not yet
   dialogue density / budget remaining as #12's box sketches).
5. `supersedes` on page_art is plumbed but never populated — regeneration
   over an existing ACCEPTED page_art won't chain lineage yet (the retry
   loop only regenerates within one stage run). Session 6.
6. Vision QA is one page-level call with per-panel verdicts (smoke-priced
   at $0.0004; per-panel sliced calls unnecessary at this cost/quality).
7. Carry-forward (a) — first REAL flag-on v1 slice on a FRESH project —
   NOT satisfied by this session (the live run reused the Session 4
   scope); carried again with reason: image+calibration budget was
   concentrated on the rendering mechanism per the session brief.

Known rough edges / carry-forwards (Session 6 — docs/next-prompt.md):

1. Page-writing content quality (the headline finding): one-word beats +
   zero text elements in accepted scripts; skill/instruction fix + a
   content-quality gate before reader-v2 scoring.
2. Real Layout-IoU + Magi/eval metrics (#10) replacing/augmenting
   border-adherence; empty-balloon detection in vision QA (#7).
3. Lettering tails + v1 vector-scene/bubble-rules carry into composition;
   lane A (sprites+vector) and lane B (key panel) composition paths.
4. Contract promotion: page_art / composed_page / provider_receipt into
   packages/contracts with the reader-v2 consumer; supersedes lineage.
5. The Session 4 accepted WMC thumbnail set is now KNOWN-RTL-defective
   under the live craft gate — fresh planning runs required for reader-v2
   material.
6. Standing: (a) fresh flag-on v1 slice; (b) worker egress; (c)
   ARTIFACT_REPAIR policy; (d) layout-template.v1 contract +
   list_layout_templates broker tool + seeded jitter (mask export DONE
   this session); (e) issue #6 knowledge-base rewrite.
