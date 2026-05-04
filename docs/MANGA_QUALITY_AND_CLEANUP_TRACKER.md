# Manga Quality & Cleanup — Build Tracker

> **Purpose:** keep me (Comreton) on the rails as I work through
> `MANGA_QUALITY_AND_CLEANUP_PLAN.md`. Append-only log of *what shipped*,
> *what's in progress*, and *what's blocked*. Each entry includes the
> phase id, the test count baseline before/after, and the commit message.

## Test baseline at start

* **2026-05-04** — 381 tests passing (`pytest -q` clean).
* Frontend `tsc --noEmit` last reported clean (per `MANGA_BUILD_STATUS.md`).
* Branch: `manga-quality-and-cleanup` (to create).

---

## Phase progress

### Phase A — Story coherence

| Step | Status | Notes |
| --- | --- | --- |
| A1 — `script_review_stage` (LLM editor pass) | ✅ done | Heuristic+LLM merge, dedupe, recompute-passed |
| A1b — `script_repair_stage` | ✅ done | Mirrors quality_repair shape; clears stale review |
| A2 — voice validator (`voice_validator.py`) | ✅ done | Unknown-speaker (err), oversize line (err), generic phrase (warn) |
| A3 — `continuity_gate_stage` | ✅ done | Arc must-cover, prior-hook (warn), arc closing-hook (warn), protagonist on-stage (err for KI/SHO/TEN/KETSU), TBC-after-KETSU (warn) |
| A4 — protagonist contract reinforcement | ✅ done | New `prompt_fragments.py`; injected into script + storyboard prompts |

### Phase B — Character sprite quality

| Step | Status | Notes |
| --- | --- | --- |
| B1 — multi-angle reference sheets (front/side/back) | ✅ done | Plan emits front/side/back per character; selector picks front deterministically; existing assertions updated |
| B2 — `sprite_quality_gate` (vision check) | ⬜ todo | new service + book-stage |
| B3 — bible silhouette uniqueness check | ✅ done | `bible_uniqueness.py` + `bible_silhouette_uniqueness_stage`; warnings only (twins / body-doubles still allowed) |
| B4 — Character Library UI | ⬜ todo | new route + components |
| B5 — image-model selector in `GeneratePanel` | ⬜ todo | UI only |

### Phase C — Page composition

| Step | Status | Notes |
| --- | --- | --- |
| C1 — `page_composition_stage` | ⬜ todo | new stage; produces `PageComposition` |
| C2 — RTL reading-flow validator | ⬜ todo | extend `manga_dsl.py` |
| C3 — frontend RTL grid using `gutter_grid` | ⬜ todo | edit `V4PageRenderer.tsx` |
| C4 — SVG speech bubble with tail | ⬜ todo | new `SpeechBubble.tsx` |
| C5 — SFX layer | ⬜ todo | new `SfxLayer.tsx` |

### Phase D — Codebase cleanup

| Step | Status | Notes |
| --- | --- | --- |
| D1 — wire `manga_pipeline_version` flag | ⬜ todo | startup-time route registration |
| D2 — deprecation warnings on legacy modules | ⬜ todo | docstring + warnings.warn on import |
| D3 — move `living_panels` route to `legacy/` | ⬜ todo | route file move + import path |
| D4 — delete legacy modules | ⬜ todo | after one release with warnings |
| D5 — rename `build_v2_generation_stages` | ⬜ todo | `build_revamp_generation_stages` |

### Phase E — Per-panel regenerate

| Step | Status | Notes |
| --- | --- | --- |
| E1 — `panel_regeneration_service` + API | ⬜ todo | new POST endpoint |
| E2 — UI affordance + modal | ⬜ todo | `PanelActionsOverlay.tsx` |
| E3 — optional `panel_critique_stage` | ⬜ todo | vision LLM auto-retry |

### Phase F — Cross-panel coherence (stretch)

Deferred until A–E ship.

---

## Activity log

| Date | What | Tests before → after | Commit |
| --- | --- | --- | --- |
| 2026-05-04 | Tracker created | 381 → 381 | (pending) |
| 2026-05-04 | Phase A complete (A1–A4) | 381 → 401 | (pending) |
| 2026-05-04 | Phase B partial (B1, B3) | 401 → 411 | (pending) |

---

## Open questions / assumptions parked here

1. Vision-LLM choice for sprite gate + panel critic: defaulting to
   `google/gemini-2.0-flash` via OpenRouter unless told otherwise.
2. Image model for character sheets remains the user-selected Gemini
   nano-banana family unless a stronger one becomes entitlement-OK.
3. Reading-direction default: `rtl` for new projects, `ltr` for
   pre-existing projects (option in `MangaProjectDoc.project_options`).
4. Editor LLM (Phase A1): same model the user picked for primary
   generation, at lower temperature (0.4). Cost-conscious users can
   override per project.

## Rollback strategy reminders

* Every phase opens its own PR. Squash-merge so a single revert
  cleanly removes a phase.
* `pytest -q` MUST be green before merge.
* `git tag pre-manga-quality-baseline` placed before Phase A start.
