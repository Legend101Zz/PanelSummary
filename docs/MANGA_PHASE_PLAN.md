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

## Phase 4 — Panel-Craft DSL Upgrade ⏳ in progress

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
* `V4Panel` (dataclass, `app/v4_types.py`) — thinner, hand-rolled
  renderer wire format. Carries `type` (splash/dialogue/narration/...),
  `mood`, `scene`, `pose`, ``, `effects`, `emphasis`.

They are bridged by `app/rendering/v4/storyboard_mapper.py`, which is a
**lossy projection**. `shot_type`, `purpose`, `composition` prose, and
`source_fact_ids` are silently discarded. The renderer keys aspect ratio
off `V4Panel.type` (panel role), not `shot_type` — so an `EXTREME_WIDE`
framed `dialogue` panel renders 1:1 and the storyboarder's framing
intent is lost. The only shot-variety enforcement is slice-wide
`MIN_DISTINCT_SHOT_TYPES_PER_SLICE = 3`, which is too coarse to stop
four mediums in a row or a flat page-turn cell.

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
| 4.1 | `RenderedPage` + `PanelRenderArtifact` domain models; `panel_rendering_service` rewritten to consume `StoryboardPanel`; aspect ratio keyed off `shot_type` | domain + service | ⏳ |
| 4.2 | `panel_rendering_stage` + `panel_quality_gate_stage` consume `RenderedPage`; new tiny `rendered_page_assembly_stage`; `storyboard_to_v4_stage` deleted | pipeline | ⏳ |
| 4.3 | Three new shot-variety validators (`DSL_REPEATED_SHOT_RUN`, `DSL_PAGE_TURN_NO_PUNCH`, `DSL_PAGE_FLAT_SHOTS`) in `manga_dsl.py` | dsl | ⏳ |
| 4.4 | Storyboarder system prompt rewritten with production-grade shot-design guidance; DSL fragment lists every validator code | prompts | ⏳ |
| 4.5 | Wire flip: `MangaPageDoc.v4_page` → `rendered_page`; API rename; `app/v4_types.py` + `app/rendering/v4/` deleted; frontend `V4Engine/` replaced by `MangaReader/`; one-shot migration script | persistence + api + frontend | ⏳ |
| 4.6 | Docs + scoreboard close-out commit | docs | ⏳ |

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

---

## Parking lot

- Voice-card *enforcement* via reflection (LLM hears its own line read
  aloud and grades it). Defer until Phase 5 critic exists.
- Per-character art-style memory across PROJECTS (so a returning
  protagonist looks the same in book 2). Defer; needs a new identity
  store.
- LLM-driven shot-design critic stage (re-grades each panel's shot
  choice against its emotional context). Defer until Phase 4 ships and
  we see whether DSL validators + upgraded prompt are sufficient.
