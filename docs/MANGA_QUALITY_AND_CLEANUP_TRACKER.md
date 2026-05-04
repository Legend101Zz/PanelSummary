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
| B2 — `sprite_quality_gate` (vision check) | ✅ done | New `vision_contracts` + `VisionLLMClient`; `sprite_quality_service` (pure) + `sprite_quality_gate` (DB-aware) with bounded auto-retry; wired into book_understanding flow when image generation is on. |
| B3 — bible silhouette uniqueness check | ✅ done | `bible_uniqueness.py` + `bible_silhouette_uniqueness_stage`; warnings only (twins / body-doubles still allowed) |
| B4 — Character Library UI | ⬜ todo | new route + components |
| B5 — image-model selector in `GeneratePanel` | ⬜ todo | UI only |

### Phase C — Page composition

| Step | Status | Notes |
| --- | --- | --- |
| C1 — `page_composition_stage` | ✅ done | New `PageComposition`/`SliceComposition` domain types; one LLM call per slice, coerced + empty-fallback. `V4Page` now carries `gutter_grid`, `page_turn_panel_id`, `composition_notes`; mapper applies emphasis overrides. |
| C2 — RTL reading-flow validator | ✅ done | New `validate_composition_against_rtl` in `manga_dsl.py` + `rtl_composition_validation_stage`. Three issue codes: `DSL_RTL_PAGE_TURN_NOT_LAST`, `DSL_RTL_TBC_NOT_PAGE_TURN`, `DSL_RTL_PAGE_TURN_NARROW`. All warnings (composer can override) but appear on the canonical QualityReport. |
| C3 — frontend RTL grid using `gutter_grid` | ✅ done | New `page_layout.ts` helper; `V4PageRenderer` renders one CSS sub-grid per gutter row with `direction: rtl`; falls back to legacy panel-count layout when composition absent. New `showPageTurnAnchor` QA prop highlights cliffhanger cell. |
| C4 — SVG speech bubble with tail | ✅ done | New `SpeechBubble.tsx` (SVG path body + triangular tail; speech / thought / shout variants; tail side+offset configurable). `DialoguePanel` now uses it. Tail side is auto-derived per line. |
| C5 — SFX layer | ✅ done | New `SfxLayer.tsx` reads recognised SFX tokens from existing `effects` array (no schema change). Impact tokens render big + accent + with `!`; soft tokens render with `…`. Stable per-token rotation/position. |

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
| 2026-05-04 | Phase B2 (sprite quality vision gate) | 411 → 425 | (pending) |
| 2026-05-04 | Phase C1 (page composition stage + V4 grid) | 425 → 435 | (pending) |
| 2026-05-04 | Phase C2 (RTL composition validators + stage) | 435 → 448 | (pending) |
| 2026-05-04 | Phase C3–C5 (RTL grid renderer, SVG bubbles, SFX layer) | 448 → 448 (frontend) | (pending) |

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
