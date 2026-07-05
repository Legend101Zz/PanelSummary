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

## Task log

### Task 1: Kill the text-wall

Status: complete; pending commit.

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

## Next concrete step

Commit Task 1, then start Task 2: additive `vector_scene` DSL field, MiniMax
visual-direction stage, and inline SVG renderer behind sprites/bubbles.
