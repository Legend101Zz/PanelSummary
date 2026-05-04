# Manga Phase Plan — Story Quality Roadmap

> Companion doc to `MANGA_QUALITY_AND_CLEANUP_PLAN.md` and the
> `manga_creation_system_review_and_plan/` folder. Where those go wide,
> this one tracks the **5 narrative-quality phases** I (Comreton) am
> driving in the rolling sessions with Mrigesh, in priority order.
>
> Each phase ships in one PR, leaves the test count strictly higher,
> and never breaks the green build.

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

**Already done (per `MANGA_QUALITY_AND_CLEANUP_TRACKER.md` Phase B):**
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

## Phase 4 — Panel-Craft DSL Upgrade

**Theme:** stop letting the LLM author panel layouts in prose. The
DSL already exists (`manga_dsl.py`); make it the *only* way panels are
specified, and teach it the things real manga editors check.

Targets:
- Shot-type variety budget per page (no 4 medium shots in a row).
- "Page turn earns the reveal" rule: the page-turn panel must change
  emotional tone.
- DialogueBudget per arc role (already partially there) extended to
  enforce a *whitespace-to-ink* ratio derived from panel area.
- Panel composition annotations (gutters, sub-grids) become part of
  the storyboard contract instead of the post-storyboard LLM step they
  are now (Phase C1 of the cleanup tracker).

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
- Tracker rows in `MANGA_QUALITY_AND_CLEANUP_TRACKER.md` flip to ✅
  only after the test suite proves the deliverable.
- Anything not in this doc is YAGNI for the current sprint. New ideas
  go to the "parking lot" at the bottom of the tracker, not into the
  in-progress phase.

---

## Parking lot

- Voice-card *enforcement* via reflection (LLM hears its own line read
  aloud and grades it). Defer until Phase 5 critic exists.
- Per-character art-style memory across PROJECTS (so a returning
  protagonist looks the same in book 2). Defer; needs a new identity
  store.
- Music / SFX timing for an animated reader. Out of scope for the
  manga product; tracked under `REEL_ENGINE_PLAN.md`.
