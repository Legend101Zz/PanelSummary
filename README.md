# PanelSummary — PDF → Manga

> **One-line:** Upload a PDF; the backend distils it into a manga that captures
> the gist of the source so a reader who likes comics gets the same essence
> they'd get from reading the book.
>
> **Stack:** Python 3.12 · FastAPI · Celery · MongoDB (Beanie) · uv · Next.js 14 · Tailwind
>
> **Status (2026-05-05):** Phases 1–3 shipped; Phase 4 is structurally complete through 4.5c (v4 deleted). Phase 5 remains planned.
> Current handoff: [`docs/MANGA_REFACTOR_HANDOFF.md`](docs/MANGA_REFACTOR_HANDOFF.md). Canonical roadmap: [`docs/MANGA_PHASE_PLAN.md`](docs/MANGA_PHASE_PLAN.md).

---

## TL;DR for a brand-new agent session

You are picking up a focused refactor of the manga generation pipeline. Read
this file once, then read [`docs/MANGA_PHASE_PLAN.md`](docs/MANGA_PHASE_PLAN.md)
and [`docs/MANGA_REFACTOR_HANDOFF.md`](docs/MANGA_REFACTOR_HANDOFF.md).
The detailed running log is
[`docs/SESSION_NOTES_2026-05-04_phase4_panel_dsl.md`](docs/SESSION_NOTES_2026-05-04_phase4_panel_dsl.md).

**The user's complaint that started this refactor (verbatim, paraphrased):**

> "Codebase is loose. Manga we generate is average. Dialogue is incoherent.
> Sprite characters are weak even though we have image-model capability.
> Is our DSL approach right? A great manga has a defined protagonist,
> logline, structured plot (Ki-Sho-Ten-Ketsu), distinct silhouettes,
> consistent character sheets, varied shot types. Critically analyse the
> whole flow and give me a plan."

We responded by gutting the dead code (Phase D — already done), writing the
phased plan, and shipping Phases 1, 2, 3. Below is what each phase moved.

---

## What was here BEFORE the refactor (so you know what's gone)

* Two parallel rendering engines: **V2 (verbose DSL)** and **V4 (semantic intent)**.
* Legacy surfaces: BookSummary, LivingPanel, video reels, Reel Engine.
* A shifting collection of plan/tracker docs (`MANGA_REVAMP_PLAN.md`,
  `MANGA_QUALITY_AND_CLEANUP_PLAN.md`, `manga_creation_system_review_and_plan/`,
  etc.) that contradicted each other.

**All of that is deleted.** Don't look for it in git history unless you have
a specific reason — the new design supersedes it. Current docs are:

* `docs/MANGA_PHASE_PLAN.md` — canonical roadmap.
* `docs/MANGA_REFACTOR_HANDOFF.md` — current status + next-session prompt.
* `docs/MANGA_V2_LLM_ORCHESTRATION_ADR.md` — architectural ADR.
* `docs/SESSION_NOTES_2026-05-04_phase4_panel_dsl.md` — running Phase 4 log.

---

## The five-phase rebuild

> Phases follow the order a real manga writer would: **story → characters →
> sprites → panels → letters**. Solving panel art before the story is grounded
> in source facts produces the exact incoherence the user complained about.

| # | Theme | Status | Commit prefix |
|---|---|---|---|
| **1** | Book Spine — voice cards + character picker | ✅ shipped 2026-05-04 | `Phase 1:` |
| **2** | Source Grounding & Memory — script lines must cite SourceFacts; recap seeds carry across slices | ✅ shipped 2026-05-04 | `Phase 2:` |
| **3** | Sprite & Character Library Polish — expression coverage, outfit score, hit-rate metric, pinned-asset selector | ✅ shipped 2026-05-04 | `Phase 3:` |
| **4** | Panel-Craft DSL Upgrade — collapse v2/v4 panel surface into one structured DSL; vary shot types deliberately | ✅ 4.5c shipped; cleanup left | `v2 Phase 4:` |
| **5** | Page Composition & Lettering — bubble shape semantics, SFX font catalogue, RTL flow critic | ⏳ planned | `v2 Phase 5:` |

### What Phase 1 did
* `domain/manga/voice_cards.py` — `VoiceCard` model (speech_register,
  taboo_phrases, signature_lines).
* `pipeline/stages/book/character_voice_cards_stage.py` — synthesises voice
  cards from the bible + arc outline.
* `frontend/components/BookSpine.tsx` — spine-style character chooser in v2.

### What Phase 2 did
* `services/manga/grounding_validator.py` — pure helper; flags script lines
  whose claims aren't backed by `SourceFact` IDs.
* `domain/manga/continuity.py` — recap-seed builder + ledger updater for
  cross-slice memory.
* `pipeline/stages/manga_script_stage` + `script_review_stage` +
  `continuity_gate_stage` — wired into the typed pipeline contract.
* Frontend: slice cards now show recap and grounding warnings in the v2 panel.

### What Phase 3 did (this session)
* **3.1 Expression coverage gate** — `services/manga/expression_coverage.py`
  (pure). `SpriteQualityReport.missing_expressions` + `passed=False` on gaps.
  `SPRITE_EXPRESSION_MISSING` check code. Library UI: per-character chips +
  global "Missing N" pill.
* **3.2 Outfit acceptance** — vision LLM now scores **costume independently**
  from silhouette. `outfit_match_score`, `SPRITE_OUTFIT_MISMATCH` code,
  AssetCard renders "sil X/5 · fit Y/5".
* **3.3 Sprite-bank hit-rate** — `PanelRenderResult.requested_character_count`
  + summary props. `panel_quality_gate_stage` emits
  `sprite_bank_low_hit_rate` warning when ratio < 0.6.
* **3.4 Selector honours `pinned`** — `build_asset_lookup` picks the pinned
  doc first, then falls back to the front/side/back angle preference.

**Test scoreboard at end of Phase 3:** **330 backend tests green**; `tsc --noEmit` clean.

---

## What is LEFT to do

### Phase 4 — Panel-Craft DSL Upgrade (next)
The user's biggest live complaint. Current state has v2 and v4 panel
representations scattered across the codebase. Goal: **one structured panel
DSL** that the storyboarder LLM emits, the page-composition stage consumes,
and the panel renderer treats as gospel. Within that, force shot-type variety
(close-up vs medium vs wide) the way pro manga does.

Detail to expand when Phase 4 starts. The expansion lives in
`docs/MANGA_PHASE_PLAN.md` under "Phase 4 — Panel-Craft DSL Upgrade".

### Phase 5 — Page Composition & Lettering
Bubble shape semantics (thought vs shout vs whisper), SFX font catalogue,
right-to-left flow critic. Detail to expand when Phase 4 ships.

---

## Refactor rules (NON-NEGOTIABLE — read before editing anything)

These are the rules this refactor was held to. New session: stay on them.

1. **Zen of Python applies to all code, not just Python.** Explicit > implicit;
   simple > clever; flat > nested; readability > brevity.
2. **Files ≤ 600 lines.** If it grows past that, split — but never split
   purely to hit a number if cohesion suffers.
3. **DRY, YAGNI, SOLID.** No speculative abstractions. No "we might need this
   later" hooks.
4. **Comments explain WHY, not WHAT.** The code shows what. Explain the
   trade-off, the alternative you rejected, the failure mode the choice
   prevents. Look at any file in `app/services/manga/` or
   `app/domain/manga/` for the established voice.
5. **Every behavioural change is pinned by a test.** The pattern is:
   * Pure helpers (`grounding_validator`, `expression_coverage`) get
     `tests/test_<thing>_v2.py` with focused asserts and a one-sentence
     docstring per test explaining the invariant being pinned.
   * Stages get a fixture builder + `asyncio.run(stage.run(ctx))` + assert
     on the mutation (`ctx.quality_report`, `ctx.options`, etc.).
6. **Domain layer stays I/O-free.** No Mongo, no LLM, no filesystem in
   `app/domain/manga/`. Helpers in `app/services/manga/` may import the
   domain but never the other way.
7. **Pure functions over classes** unless the class earns its keep with state.
   `compute_missing_expressions`, `build_asset_lookup` are functions because
   they have no state; `SpriteQualityServiceConfig` is a model because it
   bundles tuneable defaults that change together.
8. **Commit often, with a phase prefix.** Format:
   ```
   v2 Phase N: <one-line summary>
   <blank>
   - bullet of what moved
   - bullet of why
   - test scoreboard at end
   ```
   Going forward use the **`v2 Phase N`** prefix (Phases 1–3 used `Phase N:`
   without the v2 prefix; new phases get the prefix because we're now
   exclusively in the v2 path — the v1/v4 surfaces are gone).
9. **Never force-push.** Roll forward with new commits.
10. **Tests must pass before every commit.** Run:
    ```
    cd backend && uv run --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple --allow-insecure-host pypi.ci.artifacts.walmart.com pytest tests/ -q
    cd frontend && npx tsc --noEmit
    ```
11. **Wire-format pinned by tests.** When you add a field to a serializer
    or pipeline contract, add an invariant test. `test_phase3_sprite_polish_v2.py`
    has examples (`test_vision_prompt_asks_for_both_scores` is the cheapest
    pattern — string `in` system prompt).
12. **Walmart environment.** `uv` everywhere; never touch
    `~/.code-puppy-venv`; install with the artifactory `--index-url` shown
    in rule 10.

---

## What you (new agent) should do at the START of your session

1. **Read this file. Read `docs/MANGA_PHASE_PLAN.md`.** Stop and confirm
   you understand which phase is next before writing any code.
2. **Run the test suite** to confirm the tree is green before touching it
   (rule 10 commands).
3. **Create a session notes doc.** Path:
   `docs/SESSION_NOTES_<YYYY-MM-DD>_<short-topic>.md`.
   Inside, log: what you set out to do, decisions you made, blockers you
   hit, tests you added. End with "next session pickup point".
4. **Pick the next phase** (Phase 4 unless told otherwise) and **expand the
   detail in `docs/MANGA_PHASE_PLAN.md`** before you write code. The user
   will read that section to confirm scope.
5. **Commit early, commit often** with `v2 Phase 4: …` prefix. Three small
   commits beat one big one every time.

---

## Layout cheat sheet

```
backend/
  app/
    api/routes/manga_projects.py       # all v2 HTTP endpoints
    domain/manga/                      # I/O-free models + pure helpers
      artifacts.py                       core LLM-authored types (Beat, Script, Storyboard, ...)
      sprite_quality.py                  SpriteCheck, AssetSpriteReview, MissingExpression, SpriteQualityReport
      continuity.py                      recap-seed builder, ledger update
      voice_cards.py                     VoiceCard
      ...
    manga_pipeline/
      context.py                       PipelineContext (mutable bag the stages read/write)
      stages/                          one file per stage, each with `async def run(ctx) -> ctx`
        book/                            book-level stages (arc outline, voice cards, ...)
        manga_script_stage.py
        script_review_stage.py
        continuity_gate_stage.py
        panel_rendering_stage.py
        panel_quality_gate_stage.py
    services/manga/
      grounding_validator.py             pure: lines vs SourceFacts
      expression_coverage.py             pure: planner specs vs persisted docs
      sprite_quality_service.py          vision LLM call + check translation
      sprite_quality_gate.py             persistence-aware orchestrator
      panel_rendering_service.py         multimodal panel renderer + selectors
      character_library_service.py       asset doc CRUD
      ...
    manga_models.py                    Beanie Documents (MangaProjectDoc, MangaAssetDoc, ...)
  tests/                              one test file per module, suffix _v2

frontend/
  app/books/[id]/manga/v2/             v2 reader + Character Library page
  components/CharacterLibrary/         AssetCard
  components/MangaV2ProjectPanel.tsx   slice cards (recap, grounding warnings, QA list)
  components/BookSpine.tsx             character picker
  lib/api.ts, lib/types.ts             single API surface

docs/
  MANGA_PHASE_PLAN.md                  CANONICAL roadmap — read this
  MANGA_V2_LLM_ORCHESTRATION_ADR.md    why the pipeline is LLM-first
  SESSION_NOTES_<date>_<topic>.md      you create one per session
```

---

## Quick test command (memorise this)

```bash
cd backend && \
  uv run --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple \
  --allow-insecure-host pypi.ci.artifacts.walmart.com pytest tests/ -q
```

Last green count: **330 passed** (2026-05-04 end-of-Phase-3).

---

## Author / contact

Refactor authored by `code-puppy-0c26ab` for **Mrigesh Thakur**, on top of
the existing PanelSummary codebase. The Phase 1–3 commits in `git log`
tell the story end-to-end if you want context for any specific decision.
