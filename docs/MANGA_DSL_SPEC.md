# Manga DSL Specification

**Version:** 1.0 (Phase 2 of MANGA_REVAMP_PLAN.md)
**Status:** Active — enforced by `backend/app/manga_pipeline/manga_dsl.py`
**Owner:** Manga generation pipeline

---

## 1. What this document is

This is the **canonical contract** for the structural shape of every manga
slice the pipeline emits. It is the prose form of the rules that
`backend/app/manga_pipeline/manga_dsl.py` enforces in code.

If the code and this document disagree, **the code wins** — but that is a bug
either in the code, in this doc, or in both. Open a PR that updates both.

This DSL is **not** a markup language. It is the set of structural and
editorial constraints that the existing typed artifacts
(`BeatSheet`, `MangaScript`, `StoryboardArtifact`) must satisfy when serialized
through the pipeline. The artifacts ARE the DSL; this document explains the
rules they carry.

---

## 2. Why a DSL at all

Phase 1 (book understanding) gave us a frozen project bible, a global fact
registry, an adaptation plan, and an arc outline. Without Phase 2's DSL, the
per-slice stages still had aspirational prompts and no mechanism to enforce
manga-quality structure. The result was the "very average" output the original
plan called out:

- Pages with too many panels (storyboard photocopies).
- Panels stuffed with five long dialogue lines (drowned art).
- Beats that paraphrased a fact without anchoring it to a panel
  (ungrounded readers).
- Slices that all read like the same medium-shot blur (no shot variety).

The DSL fixes this by making the rules **enforced** — every storyboard runs
through `validate_storyboard_against_dsl` before persistence; every violation
becomes a `QualityIssue` that the existing repair stage can fix.

---

## 3. Per-arc-role budgets

The arc outline (Phase 1) labels every slice with one of five Ki-Sho-Ten-Ketsu
roles. Each role has its own budgets because the editorial rhythm differs:
a Ki opening earns establishing pages; a Ten reveal can afford one more page;
a Recap is intentionally short.

### 3.1 Page count per slice

| Role  | min | preferred | max |
|-------|-----|-----------|-----|
| KI    | 3   | 4         | 6   |
| SHO   | 3   | 4         | 6   |
| TEN   | 2   | 3         | 5   |
| KETSU | 3   | 4         | 6   |
| RECAP | 1   | 2         | 3   |

### 3.2 Panel count per page

| Role  | min | preferred | max |
|-------|-----|-----------|-----|
| KI    | 3   | 4         | 6   |
| SHO   | 3   | 5         | 6   |
| TEN   | 2   | 4         | 5   |
| KETSU | 3   | 4         | 5   |
| RECAP | 2   | 3         | 4   |

`min` and `max` are **enforced** by the validator. `preferred` is the target the
prompt asks the LLM to hit. The window exists so that an editorial choice
(one big splash for a reveal) is not punished.

### 3.3 Dialogue budget

Uniform across roles today. We keep the lookup per-role so a future
"TEN slices allow shorter dialogue for stronger reveals" tweak is a one-line
change.

| Constraint                       | Cap |
|----------------------------------|-----|
| Lines per panel                  | 3   |
| Characters per panel (total)     | 160 |
| Lines per page (warning, not error) | 10  |

`ScriptLine.text` ALSO enforces a 180-character cap on a single line via the
domain validator. The DSL caps are the AGGREGATE caps so a panel cannot stuff
five short lines that together drown the art.

### 3.4 Shot variety

Across a slice the storyboard MUST use **at least 3 distinct shot types** from
`ShotType` (`extreme_wide`, `wide`, `medium`, `close_up`, `extreme_close_up`,
`insert`, `symbolic`).

We do not enforce per-page variety because some pages are intentionally uniform
(e.g. a sequence of close-ups during emotional escalation).

### 3.5 Anchor facts

Every fact ID listed in the arc entry's `must_cover_fact_ids` MUST appear in
at least one panel's `source_fact_ids` across the slice. Paraphrasing a fact
without anchoring it counts as not covering it.

This is the rule that keeps the manga **grounded in the source PDF**. Without
it, the LLM happily talks AROUND a fact without ever pinning it to a panel.

---

## 4. Structural invariants (already enforced by the artifacts)

These rules live in the Pydantic models, not in `manga_dsl.py`, because
violating them prevents the artifact from being constructed at all. They are
listed here so the contract is in one place.

| Rule | Enforced by |
|------|-------------|
| `StoryboardArtifact.pages` is non-empty | `storyboard_needs_pages_and_stable_indices` |
| `page_index` values are contiguous from 0 | `storyboard_needs_pages_and_stable_indices` |
| Each `StoryboardPage.panels` is non-empty and ≤ 7 | `page_needs_manga_flow` |
| Each `StoryboardPanel.composition` is non-blank | `panel_needs_readable_content` |
| Each panel has action OR dialogue OR narration | `panel_needs_readable_content` |
| `ScriptLine.text` ≤ 180 chars | `dialogue_should_be_brief` |
| `MangaScript.scenes` is non-empty | `script_needs_scenes` |
| Each `MangaScriptScene` maps to ≥ 1 beat_id | `scene_needs_content` |
| Each `Beat` references facts OR threads | `beat_must_do_something` |

---

## 5. The validation issue codes

Stable codes the repair stage can route by:

| Code | Severity | Triggered when |
|------|----------|----------------|
| `DSL_SLICE_UNDER_PAGE_BUDGET` | error | Slice has fewer pages than the role's min |
| `DSL_SLICE_OVER_PAGE_BUDGET` | error | Slice has more pages than the role's max |
| `DSL_PAGE_UNDER_PANEL_BUDGET` | error | A page has fewer panels than the role's min |
| `DSL_PAGE_OVER_PANEL_BUDGET` | error | A page has more panels than the role's max |
| `DSL_PANEL_OVER_DIALOGUE_LINES` | error | A panel has too many dialogue lines |
| `DSL_PANEL_OVER_DIALOGUE_CHARS` | error | A panel's dialogue total exceeds char cap |
| `DSL_PAGE_OVER_DIALOGUE_LINES` | warning | A page exceeds the per-page line cap |
| `DSL_LOW_SHOT_VARIETY` | warning | Slice uses fewer than 3 distinct shot types |
| `DSL_MISSING_ANCHOR_FACTS` | error | A `must_cover` fact has no panel anchor |

`error` blocks persistence (the quality gate fails). `warning` is logged but
does not block.

---

## 6. Pipeline integration

The DSL lives at three points in the per-slice pipeline:

```
beat_sheet → manga_script → storyboard
                               ↓
                       dsl_validation_stage    ← runs the rules above
                               ↓
                       quality_gate_stage      ← refuses to proceed on errors
                               ↓
                       quality_repair_stage    ← LLM fixes flagged issues
                               ↓
                       dsl_validation_stage    ← re-validate after repair
                               ↓
                       quality_gate_stage      ← final gate
                               ↓
                       character_asset_plan → storyboard_to_v4 → persist
```

`render_dsl_prompt_fragment(arc_entry)` is appended to the user message of the
`beat_sheet`, `manga_script`, and `storyboard` stages so the LLM sees the SAME
budgets the validator will measure against. This closes the loop: aspirational
prompts no longer drift away from enforced reality.

---

## 7. Adding a new arc role or budget

1. Add the role to `app/domain/manga/book_understanding.py::ArcRole`.
2. Add a row to `PANEL_BUDGETS_BY_ARC_ROLE`, `PAGE_BUDGETS_BY_ARC_ROLE`, and
   `DIALOGUE_BUDGETS_BY_ARC_ROLE` in `manga_pipeline/manga_dsl.py`.
3. Add a row to the tables in section 3 of this document.
4. Run `pytest tests/test_manga_dsl_v2.py` — the
   `test_every_arc_role_has_a_*_budget` tests will fail loudly if you forgot
   step 2.

---

## 8. What the DSL deliberately does NOT enforce

- **Visual style.** That lives in the frozen `CharacterWorldBible.visual_style`
  and the per-character `visual_lock`. The DSL is structural only.
- **Reading direction.** The validator does not parse panel coordinates. The
  storyboard prompt instructs the LLM to author top-right-to-bottom-left and
  the renderer enforces flow at draw time.
- **Rendering correctness.** `storyboard_to_v4_stage` is responsible for
  turning storyboard pages into V4 page documents; any V4-shaped invariants
  belong in the renderer module, not here.

---

## 9. Versioning

This document and `manga_dsl.py` move together. Bump the version at the top of
this file when:

- A budget number changes.
- A new issue code is added.
- The pipeline integration order changes.

A version bump means existing persisted slices may now report new warnings on
re-validation. It does NOT trigger automatic regeneration; that is an explicit
operator action.
