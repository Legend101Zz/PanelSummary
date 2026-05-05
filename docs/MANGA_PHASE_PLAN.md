# Manga Phase Plan — Story Quality Roadmap

> Canonical roadmap for the manga generation rebuild. Companion docs
> (`MANGA_QUALITY_AND_CLEANUP_PLAN.md`, the
> `manga_creation_system_review_and_plan/` folder) were deleted in the
> 2026-05-04 cleanup commit (`5c49054`); this file and
> `MANGA_V2_LLM_ORCHESTRATION_ADR.md` are the only planning docs.
>
> The plan tracks the **5 narrative-quality phases** Comreton is driving
> in rolling sessions with Mrigesh, in priority order. Each phase ships
> in one PR, leaves the test count strictly higher, and never breaks
> the green build.

---

## Vision (re-stated for posterity)

A user uploads a PDF; we return a **manga that captures the gist** so a
manga-loving reader gets the same insight a serious reader would get
from the book. Not a slideshow of bullet points — a story.

A manga that hits requires, in this order:

1. **A spine** the system understands before it draws a single panel.
2. **Source-grounded, continuous** scenes that don't drift from the
   book or each other.
3. **Visually distinct, on-model** characters the reader can recognise
   silhouette-first.
4. **Panels that read like manga**: RTL flow, varied shots, deliberate
   page turns, real bubbles, real SFX.
5. **Coherent pages**: lettering, gutter rhythm, emphasis where the
   beat demands it.

Phases below mirror that order.

---

## Phase 1 — Book Spine ✅ shipped (2026-05-04)

**Theme:** the system must *understand the whole book* before it
generates anything. No more per-slice myopia.

**What landed:**
- Run-once `book_understanding_*` stages (synopsis → fact registry →
  adaptation plan → bible → arc outline → voice cards).
- New `CharacterVoiceCard` / `CharacterVoiceCardBundle` domain types
  (≥2, ≤6 example lines, no duplicate character ids).
- Voice cards stamped into `manga_script_stage` AND
  `script_review_stage` prompts via `render_voice_cards_block()`.
- Frontend `<BookSpine>` viewer: logline, central thesis, protagonist
  contract, arc, characters w/ voice cards.
- `MangaV2ProjectPanel` auto-fires understanding on project create,
  blocks slice generation until ready, surfaces progress + retry.

Tests: 293 → 298 backend, frontend `tsc` clean.

---

## Phase 2 — Source Grounding & Memory ✅ shipped (2026-05-04)

**Theme:** every scene must be defensibly true to the source AND must
remember what came before it.

**Problems Phase 1 left on the table** (verified in code 2026-05-04):

1. **Latent crash on slice 2.** `generation_service.py` calls
   `update_ledger_after_slice(ledger, …, recap=…, last_page_hook=…)`
   but the function is keyword-only with `recap_for_next_slice=`. The
   first slice works (the function isn't called yet); slice 2 raises
   `TypeError`. Multi-slice generation has been silently broken.
2. **Recap is garbage.** `recap=final_context.manga_script.scenes[-1].action`
   pastes the last scene's stage direction verbatim into the next
   slice's continuity prompt. Not a recap, just a rerun of stage
   directions.
3. **Writer never sees the ledger.** `build_continuation_prompt_context`
   exists, is exported, and is referenced by ZERO callers. The script
   stage has no idea what happened in prior slices except via the beat
   sheet (which only sees `last_page_hook` + `recap_for_next_slice`).
4. **Ungrounded dialogue is allowed.** `ScriptLine.source_fact_ids` is
   `default_factory=list`. Nothing checks whether a substantive line
   cites any source. The LLM can hallucinate freely and the editor
   stage won't flag it.
5. **Fact-coverage data is computed but invisible.** The continuity
   gate already raises `CONTINUITY_ARC_FACT_MISSING` for the arc's
   must-cover facts but it never populates
   `QualityReport.grounded_fact_ids` / `.missing_fact_ids`, so the QA
   panel cannot show "5/7 must-cover facts landed in this slice".

### Phase 2 deliverables

| ID | Deliverable | Layer | Status |
| --- | --- | --- | --- |
| 2.1 | Fix `update_ledger_after_slice` call-site (kwargs + bug fix) | service | ✅ done |
| 2.2 | `build_recap_seed()` pure helper (closing scene + last_page_hook → 1 line) | domain/manga/continuity.py | ✅ done |
| 2.3 | Wire `build_continuation_prompt_context` into `manga_script_stage` prompt | pipeline | ✅ done |
| 2.4 | New `grounding_validator.py` + heuristic issues `SCRIPT_SCENE_UNGROUNDED` (err) / `SCRIPT_LINE_UNGROUNDED` (warn) | services + script_review wiring | ✅ done |
| 2.5 | Continuity gate populates `grounded_fact_ids` / `missing_fact_ids` on the QualityReport | pipeline | ✅ done |
| 2.6 | Frontend: surface fact-coverage on the slice card in the v2 reader sidebar | frontend | ✅ done |

### Phase 2 invariants (will be tested)

- Two consecutive slice generations on the same project never raise
  `TypeError` in `update_ledger_after_slice`.
- The recap seed is deterministic w.r.t. inputs (same scene + hook ⇒
  same recap line).
- `manga_script_stage` system + user message includes the literal
  marker `MANGA CONTINUITY SO FAR:` whenever `prior_continuity` has
  any covered ranges.
- A scene whose beats cite 3 facts but whose dialogue+narration cite 0
  raises `SCRIPT_SCENE_UNGROUNDED` (error severity).
- A short flavour line (`< 40` chars, e.g. *"…tch."*) does NOT trip
  `SCRIPT_LINE_UNGROUNDED`.
- After the continuity gate runs, `QualityReport.grounded_fact_ids` is
  the set of fact ids cited by any storyboard panel; `missing_fact_ids`
  is `arc_entry.must_cover_fact_ids` minus that set.

### Phase 2 non-goals

- We are NOT adding an LLM-driven hallucination critic. The deterministic
  grounding check + the existing editor LLM (which already reads the
  fact registry) is the cheaper combo. If hallucination still slips
  through after Phase 2, Phase 5 can layer one in with image-vision.
- We are NOT changing the `SourceFact` schema. The plumbing already
  carries `fact_id` everywhere we need.

---

## Phase 3 — Sprite & Character Library Polish ✅ shipped (2026-05-04)

**Theme:** characters look like *the same person* on every panel and
are silhouette-distinct from each other.

**Already done in earlier rebuild work (now baseline):**
- B1 multi-angle reference sheets, B2 sprite vision gate, B3 silhouette
  uniqueness, B4 Character Library UI, B5 image-model picker.

**Phase 3 here = the polish layer on top:**

1. **Per-character expression matrix** — currently planned but not gated.
   - `services/manga/expression_coverage.compute_missing_expressions`
     (pure) compares planner output to persisted asset docs.
   - `SpriteQualityReport.missing_expressions` + `passed=False` on gaps.
   - `SPRITE_EXPRESSION_MISSING` check code.
   - Library UI: per-character chip row + global "Missing N" pill.
2. **Reference-sheet acceptance interview** — vision LLM scores costume
   AND silhouette independently.
   - Vision prompt asks for `outfit_match_score` + `outfit_notes`.
   - `SPRITE_OUTFIT_MISMATCH` check code with its own threshold.
   - `AssetSpriteReview.outfit_match_score` round-trips through the
     serializer; AssetCard renders "sil X/5 · fit Y/5".
3. **Sprite-bank hit-rate metric** — % of panel character-slots that
   resolved a real reference vs fell back to prompt-only.
   - `PanelRenderResult.requested_character_count` + summary props
     `character_slots_requested/resolved/sprite_bank_hit_rate`.
   - `panel_quality_gate_stage` emits `sprite_bank_low_hit_rate` warning
     when ratio < 0.6 — surfaces in the existing slice QA list.
4. **Lock-pose affordance** — user can pin the best sheet and the
   selector honours it.
   - `build_asset_lookup` picks pinned doc first, then angle preference.
   - The pin button already existed in B4 — the selector now respects it.

**Tests:** +15 across `test_phase3_sprite_polish_v2.py` and
`test_panel_quality_gate_stage_v2.py`. 330 backend tests green.

---

## Phase 4 — Panel-Craft DSL Upgrade ✅ 4.1–4.5c shipped; 4.5c.1 cleanup open

**Theme:** collapse the v2/v4 panel surface into ONE structured DSL the
storyboarder LLM emits, the page-composition stage consumes, and the
panel renderer treats as gospel — with deliberate shot-type variety
the way pro manga does.

### Why this is the next phase

The pipeline currently carries panels in two parallel shapes:

* `StoryboardPanel` (Pydantic, `app/domain/manga/artifacts.py`) — rich,
  validated, LLM-authored. Carries `purpose`, `shot_type`, `composition`
  prose, `action`, `dialogue`, `narration`, `character_ids`,
  `source_fact_ids`.
* `V4Panel` (dataclass, deleted in 4.5c) — thinner, hand-rolled
  renderer wire format that used to carry `type`, `mood`, `scene`,
  `pose`, `effects`, and `emphasis`.

They used to be bridged by `app/rendering/v4/storyboard_mapper.py`, a
**lossy projection** that discarded `shot_type`, `purpose`,
`composition` prose, and `source_fact_ids`. That bridge was deleted in
4.5c. The renderer now reads the typed `RenderedPage` contract
assembled from the storyboard directly.

### Locked design decisions

* **One DSL, no projection layer.** `StoryboardPanel` is the canonical
  panel artifact. The renderer consumes it directly; the wire format
  serialises it directly; the frontend types match it directly. V4 is
  deleted, not aliased.
* **Pre-render and post-render artifacts are separated.**
  `StoryboardPanel` stays creative-only (LLM authors it). A new
  `PanelRenderArtifact` (per-panel `image_path`, `image_aspect_ratio`,
  `used_reference_assets`) carries the renderer's output. They live
  side-by-side inside a new composite `RenderedPage` model. This is
  the SOLID boundary: the storyboard never mutates after render.
* **LLM-first shot design.** The storyboarder prompt gets
  production-grade shot guidance (when to pick each shot, page-turn
  punch rule, rhythm rules, per-arc-role exemplars), not platitudes.
  Validators enforce the floor; the LLM owns the creative ceiling.
* **Aspect ratio is keyed off `shot_type`.** Every shot type maps to a
  framing-true aspect ratio (extreme-wide → 21:9, close-up → 4:5,
  insert → 1:1, etc.) so framing intent survives all the way to the
  image model.
* **Persistence rename, not dual-read.** `MangaPageDoc.v4_page`
  becomes `MangaPageDoc.rendered_page` with a typed shape. A one-shot
  migration script handles existing dev data; we do not accumulate a
  legacy compatibility codepath.

### Phase 4 deliverables

| ID | Deliverable | Layer | Status |
| --- | --- | --- | --- |
| 4.1 | `RenderedPage` + `PanelRenderArtifact` domain models; `panel_rendering_service` rewritten to consume `StoryboardPanel`; aspect ratio keyed off `shot_type` | domain + service | ✅ shipped |
| 4.2 | `panel_rendering_stage` + `panel_quality_gate_stage` consume `RenderedPage`; new tiny `rendered_page_assembly_stage`; `storyboard_to_v4_stage` retained as a SHADOW (still produces `v4_pages` so persistence/frontend keep working until 4.5) | pipeline | ✅ shipped |
| 4.3 | Shot-variety editorial floor in `app/manga_pipeline/shot_variety.py` (NEW sibling module — `manga_dsl.py` is at 595/600 lines): `DSL_SHOT_TYPE_DOMINANCE`, `DSL_NO_ESTABLISHING_SHOT`. **See “4.3 delta” below — shipped two validators instead of the three originally planned; the other three failure modes are deferred to 4.3-followups.** | dsl | ✅ shipped (with delta) |
| 4.4 | `render_shot_variety_prompt_fragment()` co-located with the validators (drift between prompt + validator now structurally impossible); `storyboard_stage.SYSTEM_PROMPT` rewritten to teach rotation, establishing-beat, purpose-drives-shot, AND per-panel composition-prose requirement; 12 substring-snapshot tests pin the prompt copy | prompts | ✅ shipped |
| 4.5 | Wire flip + frontend rebuild on `RenderedPage`. Decomposed into 4.5a / 4.5b / 4.5c so every commit stayed green. | persistence + api + frontend | ✅ shipped |
| 4.5c.1 | Production cleanup: old-doc migration decision, frontend type tidy, visual smoke. | data + docs + frontend | ⏳ |
| 4.6 | Docs + scoreboard close-out commit | docs | ✅ this handoff pass |

### 4.3 delta (honest call-out)

The original 4.3 plan listed three validators — `DSL_REPEATED_SHOT_RUN`,
`DSL_PAGE_TURN_NO_PUNCH`, `DSL_PAGE_FLAT_SHOTS`. The audit on real
storyboards showed a different dominant failure mode ("wall of MEDIUM
with two token exceptions, no establishing beat anywhere") that the
original three would have missed because they're per-page or
consecutive-run signals. We shipped instead:

* `DSL_SHOT_TYPE_DOMINANCE` — slice-wide; > 70% of panels at one
  `ShotType` (the "wall of MEDIUM" catcher). Skips slices < 5 panels.
* `DSL_NO_ESTABLISHING_SHOT` — slice has zero `WIDE`/`EXTREME_WIDE`.

Plus `MAX_CONSECUTIVE_SAME_SHOT_TYPE = 2` as a **prompt-only** rule
(no validator) because consecutive runs are noisy on short slices and
the LLM responds well to the explicit cap.

**4.3 follow-ups (still open, parking lot below):**

* `DSL_REPEATED_SHOT_RUN` — promote the prompt-only consecutive cap
  into a real validator once we have data showing the prompt isn't
  enough.
* `DSL_PAGE_TURN_NO_PUNCH` — page-turn anchor cell must be a punchy
  shot type (`CLOSE_UP` / `EXTREME_CLOSE_UP` / splash). Needs the
  Phase C1 page-turn anchor (`SliceComposition.page_turn_panel_id`)
  plumbed to the validator.
* `DSL_PAGE_FLAT_SHOTS` — per-page version of dominance (no single
  page should be all the same shot). Different signal from the
  slice-wide check; both can fire on different content.

### Phase 4.5 sub-decomposition (locked)

4.5 was attempted as one PR; vetoed in-session because the README's
"every commit green" rule cannot survive a single PR that simultaneously
migrates a Beanie schema, deletes an orchestrator stage, AND rebuilds
the frontend viewer. The safe shape is three sub-phases each landing
on their own commit with `pytest -q` + `tsc --noEmit` green.

* **4.5a — backend storage decoupling.** Shipped. Added
  `rendered_page` beside `v4_page`, dual-wrote for one release, and
  surfaced both on the API.
* **4.5b — frontend cutover.** Shipped. Added `MangaReader/` typed
  against the `RenderedPage` DTO and wired the v2 reader through it.
* **4.5c — delete v4.** Shipped. Deleted `context.v4_pages`, the v4
  shadow sync, `storyboard_to_v4_stage`, `app/v4_types.py`,
  `app/rendering/v4/`, `MangaPageDoc.v4_page`, and the old frontend
  V4Engine surface.
* **4.5c.1 — production cleanup.** Open. Decide whether old docs with
  empty `rendered_page` need migration or can be regenerated/deleted;
  remove stale frontend v4 type aliases; run the manual visual smoke.

Do NOT reintroduce v4 as a compatibility layer. Old data is handled by
an explicit one-shot migration or by documented regeneration/deletion.

### Phase 4 invariants (will be tested)

* `RenderedPage` round-trips losslessly through `model_dump`/
  `model_validate`; every `StoryboardPanel.panel_id` has a matching
  artifact slot.
* `aspect_ratio_for_panel(panel)` returns the documented ratio for every
  `ShotType` enum value; an unknown shot type raises (not silently 1:1).
* `build_panel_prompt` includes the storyboard's `composition` prose
  verbatim and names the panel's `purpose` and `shot_type` in the
  prompt body.
* The new shot-variety validators each fire on a positive case and stay
  silent on a negative case; reading order respects
  `SliceComposition.panel_order` when present.
* The storyboarder system prompt names every shot-variety validator
  code so the model sees the rules AND the per-rule failure surface.
* Persistence reads `rendered_page` from `MangaPageDoc`; the v4 field
  is gone. A migrated dev document loads cleanly.
* Frontend `tsc --noEmit` is clean after the wire flip; the reader
  renders a painted panel against a `RenderedPage` payload.

### Phase 4 non-goals (parking lot, not in scope)

* An LLM-driven shot-design critic stage. Validators + the upgraded
  storyboarder prompt are the floor. Add the critic only if real
  generations show variety still drifts after Phase 4.
* Per-page or per-character emotional-arc validation. That belongs in
  Phase 5 (page composition & lettering).
* Dual-read or feature-flag the v4 → rendered_page rename. We commit to
  the new shape.


---

## Phase 5 — Page Composition & Lettering

**Theme:** the rendered page reads like a real manga page.

Targets:
- SFX layer that already exists (Phase C5) gets a font catalogue
  (impact / whisper / quake), placement rules, and a render-time
  collision check against bubbles.
- Bubble tail aim: deterministic projection from speaker's panel
  position rather than the current per-line side flag.
- Lettering: long lines get an automatic pre-render line break that
  respects Japanese-style top-down balance for narrow panels.
- Panel critic (vision LLM): one call per page, returns ≤5 ranked
  defects; the user can one-click "fix" any defect.

---

## Working agreement

- Each phase opens its own PR.
- `pytest -q` MUST be green before merge. Frontend `tsc --noEmit`
  MUST be clean.
- A deliverable flips from ⏳ to ✅ only after the test suite proves
  it (a focused test file in `backend/tests/test_*_v2.py` pinning the
  invariant).
- Anything not in this doc is YAGNI for the current sprint. New ideas
  go to the "parking lot" at the bottom of THIS file.
- **Do NOT reduce LLM usage to save cost.** This pipeline exists
  because the LLM is good at things heuristics are bad at — voice
  consistency, framing intent, character beats, editorial judgment.
  Every time we replace an LLM call with a regex or a constant, we
  lose ground. Cost optimisation is the wrong axis. Quality at the
  ceiling of what the model can do is the axis. If a stage feels
  expensive, the answer is usually "design around the model's
  strengths" (better prompts, better grounding, narrower task), not
  "cut the call".

---

## Manga-writer’s process → pipeline mapping (north-star checklist)

The v2 pipeline is built to mirror how working manga writers actually
structure a chapter. Use this section as the editorial checklist when
planning new phases or auditing an existing slice. ✅ = covered today,
⚠️ = partially covered, ❌ = gap (file an idea in the parking lot).

| Writer’s step | Pipeline stage(s) | Status |
| --- | --- | --- |
| **Define key elements** — protagonist, want, obstacle, action | `whole_book_synopsis_stage` (logline, central thesis, protagonist contract) + `global_adaptation_plan_stage` | ✅ |
| **Write a logline** — one-sentence story test | `BookSynopsis.logline` field, surfaced in frontend `<BookSpine>` | ✅ |
| **Outline the plot** — beginning/middle/end via Ki-Sho-Ten-Ketsu | `arc_outline_stage` produces `ArcOutline` of `ArcSliceEntry`s tagged with `ArcRole` (KI / SHO / TEN / KETSU); `panel_budget_for(arc_role)` per-role budgets | ✅ |
| **Write the script** — scenes + panel-by-panel action + dialogue | `beat_sheet_stage` → `manga_script_stage` → `script_review_stage` → `script_repair_stage` (LLM editor pass on dialogue before storyboard) | ✅ |
| **Create character profiles** — appearance, personality, strengths, flaws | `global_character_world_bible_stage` (`CharacterWorldBible`) | ✅ |
| **Visually distinct silhouettes** | `bible_silhouette_uniqueness_stage` (heuristic gate, no LLM — a *floor*, not a substitute for vision review) | ⚠️ heuristic only; vision LLM check is parking-lot |
| **Character voice consistency** | `character_voice_cards_stage` + `render_voice_cards_block()` injected into every script-stage prompt | ✅ |
| **Character art direction** | `character_art_direction_stage` + `character_asset_plan_stage` (per-slice plan) | ✅ |
| **Draw character sheets** — multi-angle + expressions for consistency | turnaround sheets land via the sprite library (Phase 3); **expression sheets per character are not yet a stage** | ⚠️ turnaround ✅, expressions ❌ → parking lot |
| **Create thumbnails** — page layout + pacing + dialogue placement | `storyboard_stage` (StoryboardPanel) + `page_composition_stage` (gutter grid + page-turn anchor) | ✅ |
| **Reading flow** — top-right to bottom-left | `rtl_composition_validation_stage` + Phase C3 RTL grid renderer on the frontend | ✅ |
| **Vary shot types** — close-up / medium / wide / establishing | `manga_dsl._validate_shot_variety` (cardinality) + `shot_variety.evaluate_shot_dominance` + `evaluate_establishing_coverage` (4.3) + `render_shot_variety_prompt_fragment` (4.4) | ✅ measurement + LLM-side intervention shipped; per-page + page-turn-punch follow-ups open |
| **Penciling / inking / screentones** — the actual drawing | `panel_rendering_stage` (multimodal image gen) — single combined call, not separated by pass | ⚠️ one pass today; splitting passes is a Phase 5+ design question, **not** a cost-saving collapse |
| **Lettering** — dialogue + SFX placement | Phase C4 SVG speech bubbles + Phase C5 SFX layer; deterministic bubble-tail aim + collision-aware SFX is **Phase 5 scope** | ⚠️ basic lettering shipped; production-grade lettering is Phase 5 |
| **Get feedback** — show storyboards, iterate | `script_repair_stage` + `quality_repair_stage` are the in-loop critics today; vision-LLM page critic is Phase 5 | ⚠️ text critics ✅, vision critic Phase 5 |

**Reading the table:** any row that is ⚠️ or ❌ is fair game for a
future phase. Any row that is ✅ must STAY ✅ — if a refactor would
regress one, the refactor is wrong.

---

## Parking lot

- **4.3 follow-up validators** (deferred from the original 4.3 plan):
  - `DSL_REPEATED_SHOT_RUN` — promote `MAX_CONSECUTIVE_SAME_SHOT_TYPE`
    from prompt-only to a real validator once we have data showing the
    prompt isn't carrying the load.
  - `DSL_PAGE_TURN_NO_PUNCH` — page-turn anchor cell must be a punchy
    shot type (CLOSE_UP / EXTREME_CLOSE_UP / splash). Wires into the
    Phase C1 `SliceComposition.page_turn_panel_id` already on context.
  - `DSL_PAGE_FLAT_SHOTS` — per-page version of dominance. Different
    signal from the slice-wide check; both can fire on different content.
- **Character expression sheets** — today’s sprite library carries
  turnaround sheets but no per-character expression atlas (happy /
  angry / surprised / etc.). When a panel’s storyboard mood doesn’t
  match any reference expression the renderer is forced to invent one,
  which is the leading cause of off-model faces in long slices.
- **Vision-LLM bible silhouette check** — promote
  `bible_silhouette_uniqueness_stage` from heuristic to a real vision
  LLM call. Heuristic is the floor; the model is the ceiling.
- Voice-card *enforcement* via reflection (LLM hears its own line read
  aloud and grades it). Defer until Phase 5 critic exists.
- Per-character art-style memory across PROJECTS (so a returning
  protagonist looks the same in book 2). Defer; needs a new identity
  store.
- LLM-driven shot-design critic stage (re-grades each panel's shot
  choice against its emotional context). Defer until Phase 4 ships and
  we see whether DSL validators + upgraded prompt are sufficient.
