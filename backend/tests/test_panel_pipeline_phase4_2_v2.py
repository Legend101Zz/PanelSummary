"""Phase 4.2 \u2014 panel pipeline rewired around RenderedPage.

Pins the invariants of the new typed render path:

* ``rendered_page_assembly_stage`` zips storyboard + composition into
  ``context.rendered_pages`` with one ``PanelRenderArtifact`` per panel.
* ``aspect_ratio_for_storyboard_panel`` keys off ``ShotType`` and
  every enum value has an entry (no silent 1:1 fallback).
* ``build_storyboard_panel_prompt`` includes purpose, shot type, and
  the LLM-authored composition prose verbatim \u2014 the three fields the
  V4 projection used to drop.
* ``evaluate_rendered_pages`` walks the typed surface and surfaces
  the same three structural defects the gate has always checked
  (unknown character, no reference attached, render success/failure
  invariants).
* ``panel_rendering_stage`` mutates artifacts in place. The v4 dict
  shadow loop that this stage maintained through 4.2-4.5b is gone
  (deleted in 4.5c alongside the V4 frontend); ``RenderedPage`` is
  the only contract now.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.domain.manga import (
    CharacterDesign,
    CharacterWorldBible,
    ContinuityLedger,
    PageComposition,
    PageGridRow,
    PanelPurpose,
    PanelRenderArtifact,
    RenderedPage,
    ScriptLine,
    ShotType,
    SliceComposition,
    StoryboardPage,
    StoryboardPanel,
    empty_rendered_page,
)
from app.domain.manga.types import SourceRange, SourceSlice, SourceSliceMode
from app.manga_pipeline.context import PipelineContext
from app.manga_pipeline.stages import (
    panel_quality_gate_stage,
    panel_rendering_stage,
    rendered_page_assembly_stage,
)
from app.manga_pipeline.stages.panel_quality_gate_stage import evaluate_rendered_pages
from app.services.manga.storyboard_panel_renderer import (
    _SHOT_TYPE_ASPECT_RATIO,
    aspect_ratio_for_storyboard_panel,
    build_storyboard_panel_prompt,
    render_rendered_pages,
)


# --- Minimal builders ---------------------------------------------------------


def _bible(*character_ids: str) -> CharacterWorldBible:
    return CharacterWorldBible(
        world_summary="A neon-lit research lab in 2099.",
        visual_style="High-contrast manga ink with halftone shading.",
        characters=[
            CharacterDesign(
                character_id=cid,
                name=cid.title(),
                role="Researcher",
                visual_lock=f"Distinctive look for {cid}.",
                silhouette_notes="Tall and angular.",
                outfit_notes="Lab coat over neon-trim shirt.",
                hair_or_face_notes="Dark hair, sharp jaw.",
            )
            for cid in character_ids
        ],
    )


def _panel(
    panel_id: str,
    *,
    shot: ShotType = ShotType.MEDIUM,
    purpose: PanelPurpose = PanelPurpose.SETUP,
    composition: str = "Two-shot, lab interior.",
    action: str = "Aiko points at the monitor.",
    character_ids: list[str] | None = None,
    dialogue: list[ScriptLine] | None = None,
    narration: str = "",
) -> StoryboardPanel:
    return StoryboardPanel(
        panel_id=panel_id,
        scene_id="scene-1",
        purpose=purpose,
        shot_type=shot,
        composition=composition,
        action=action,
        narration=narration,
        dialogue=list(dialogue) if dialogue is not None else [],
        character_ids=list(character_ids) if character_ids is not None else ["aiko"],
    )


def _page(
    panels: list[StoryboardPanel], *, page_index: int = 0
) -> StoryboardPage:
    return StoryboardPage(
        page_id=f"page-{page_index}", page_index=page_index, panels=panels
    )


def _ctx(
    *,
    storyboard_pages: list[StoryboardPage] | None = None,
    rendered_pages: list[RenderedPage] | None = None,
    slice_composition: SliceComposition | None = None,
    bible: CharacterWorldBible | None = None,
    options: dict | None = None,
) -> PipelineContext:
    return PipelineContext(
        book_id="book-1",
        project_id="proj",
        source_slice=SourceSlice(
            slice_id="slice-1",
            book_id="book-1",
            mode=SourceSliceMode.PAGES,
            source_range=SourceRange(page_start=1, page_end=2),
        ),
        prior_continuity=ContinuityLedger(project_id="proj"),
        options=options or {},
        character_bible=bible,
        storyboard_pages=storyboard_pages or [],
        slice_composition=slice_composition,
        rendered_pages=rendered_pages or [],
    )


# --- rendered_page_assembly_stage --------------------------------------------


def test_assembly_stage_emits_one_rendered_page_per_storyboard_page():
    """The new stage maps storyboard pages to rendered pages 1:1."""
    pages = [_page([_panel("a")], page_index=0), _page([_panel("b")], page_index=1)]
    ctx = _ctx(storyboard_pages=pages)
    asyncio.run(rendered_page_assembly_stage.run(ctx))
    assert [rp.storyboard_page.page_index for rp in ctx.rendered_pages] == [0, 1]


def test_assembly_stage_seeds_empty_artifact_for_every_panel():
    """The renderer relies on a slot per panel id; assembly authors them."""
    page = _page([_panel("a"), _panel("b", character_ids=["aiko", "kai"])])
    ctx = _ctx(storyboard_pages=[page])
    asyncio.run(rendered_page_assembly_stage.run(ctx))
    artifacts = ctx.rendered_pages[0].panel_artifacts
    assert set(artifacts) == {"a", "b"}
    assert all(not artifact.is_rendered for artifact in artifacts.values())
    # Phase 3.3 hit-rate accounting needs the requested-character count
    # pre-populated; the assembly stage owns that derivation.
    assert artifacts["b"].requested_character_count == 2


def test_assembly_stage_attaches_matching_composition_by_page_index():
    """Compositions must be looked up by page_index, not list order."""
    pages = [_page([_panel("a")], page_index=4)]
    composition = PageComposition(
        page_index=4,
        gutter_grid=[PageGridRow(cell_widths_pct=[100])],
        panel_order=["a"],
    )
    slice_comp = SliceComposition(pages=[composition])
    ctx = _ctx(storyboard_pages=pages, slice_composition=slice_comp)
    asyncio.run(rendered_page_assembly_stage.run(ctx))
    rp = ctx.rendered_pages[0]
    assert rp.composition is not None
    assert rp.composition.page_index == 4


def test_assembly_stage_falls_back_when_no_composition_for_a_page():
    """A page without a composition row should still get a RenderedPage."""
    pages = [_page([_panel("a")], page_index=0)]
    ctx = _ctx(storyboard_pages=pages, slice_composition=SliceComposition(pages=[]))
    asyncio.run(rendered_page_assembly_stage.run(ctx))
    assert ctx.rendered_pages[0].composition is None


def test_assembly_stage_rejects_empty_storyboard_pages():
    """Running with no storyboard pages is a wiring bug; fail loud."""
    ctx = _ctx(storyboard_pages=[])
    with pytest.raises(ValueError, match="storyboard_pages"):
        asyncio.run(rendered_page_assembly_stage.run(ctx))


# --- aspect_ratio_for_storyboard_panel ---------------------------------------


@pytest.mark.parametrize(
    "shot,expected",
    [
        (ShotType.EXTREME_WIDE, "21:9"),
        (ShotType.WIDE, "16:9"),
        (ShotType.MEDIUM, "4:3"),
        (ShotType.CLOSE_UP, "4:5"),
        (ShotType.EXTREME_CLOSE_UP, "9:16"),
        (ShotType.INSERT, "1:1"),
        (ShotType.SYMBOLIC, "3:2"),
    ],
)
def test_aspect_ratio_keys_off_shot_type(shot, expected):
    """Each ShotType maps to a framing-true aspect; this is the whole point of 4.2."""
    panel = _panel("p", shot=shot)
    assert aspect_ratio_for_storyboard_panel(panel) == expected


def test_aspect_ratio_table_covers_every_shot_type_enum_value():
    """Adding a ShotType variant without updating the table is a code-change bug."""
    assert set(_SHOT_TYPE_ASPECT_RATIO.keys()) == set(ShotType)


# --- build_storyboard_panel_prompt -------------------------------------------


def test_prompt_includes_purpose_and_shot_type():
    """Editorial intent must reach the image model, not be projected away."""
    panel = _panel(
        "p",
        purpose=PanelPurpose.REVEAL,
        shot=ShotType.EXTREME_CLOSE_UP,
    )
    prompt = build_storyboard_panel_prompt(
        panel=panel, bible=_bible("aiko"), art_direction=None, style="shonen-ink"
    )
    assert "Editorial purpose: reveal" in prompt
    assert "Shot: extreme_close_up" in prompt


def test_prompt_includes_composition_prose_verbatim():
    """The LLM's per-panel framing note is the whole reason 4.2 exists."""
    panel = _panel("p", composition="Aiko backlit by the lab window, in profile.")
    prompt = build_storyboard_panel_prompt(
        panel=panel, bible=_bible("aiko"), art_direction=None, style="shonen-ink"
    )
    assert "Aiko backlit by the lab window, in profile." in prompt


def test_prompt_includes_dialogue_with_speaker_and_intent():
    """Dialogue beats need the speaker + intent so the model paints the right mouth shape."""
    panel = _panel(
        "p",
        dialogue=[ScriptLine(speaker_id="aiko", text="It worked.", intent="awe")],
    )
    prompt = build_storyboard_panel_prompt(
        panel=panel, bible=_bible("aiko"), art_direction=None, style="shonen-ink"
    )
    assert 'aiko: "It worked." (awe)' in prompt


def test_prompt_includes_bible_visual_lock_for_each_character_in_panel():
    """Defense-in-depth: the bible identity block lands in every prompt."""
    panel = _panel("p", character_ids=["aiko", "kai"])
    prompt = build_storyboard_panel_prompt(
        panel=panel, bible=_bible("aiko", "kai"), art_direction=None, style="shonen-ink"
    )
    assert "Aiko" in prompt and "Kai" in prompt
    assert "Distinctive look for aiko." in prompt
    assert "Distinctive look for kai." in prompt


def test_prompt_skips_unknown_characters_silently():
    """Unknown characters are flagged by the QA gate; the prompt simply omits them."""
    panel = _panel("p", character_ids=["aiko", "ghost"])
    prompt = build_storyboard_panel_prompt(
        panel=panel, bible=_bible("aiko"), art_direction=None, style="shonen-ink"
    )
    assert "aiko" in prompt.lower()
    assert "ghost" not in prompt.lower()


# --- evaluate_rendered_pages -------------------------------------------------


def _rendered_with(
    *, panel: StoryboardPanel, artifact: PanelRenderArtifact
) -> RenderedPage:
    return RenderedPage(
        storyboard_page=_page([panel]),
        panel_artifacts={panel.panel_id: artifact},
    )


def test_evaluate_rendered_pages_flags_unknown_character():
    """Storyboarder hallucinations land as panel_unknown_character."""
    panel = _panel("p", character_ids=["aiko", "ghost"])
    artifact = PanelRenderArtifact(
        image_path="x.png", image_aspect_ratio="4:3", used_reference_assets=["aiko"]
    )
    issues = evaluate_rendered_pages(
        rendered_pages=[_rendered_with(panel=panel, artifact=artifact)],
        bible_ids={"aiko"},
    )
    assert any(i.code == "panel_unknown_character" and "ghost" in i.message for i in issues)


def test_evaluate_rendered_pages_warns_when_no_reference_attached():
    """A panel with characters but no references attached will drift; warn (not error)."""
    panel = _panel("p", character_ids=["aiko"])
    artifact = PanelRenderArtifact(
        image_path="x.png", image_aspect_ratio="4:3", used_reference_assets=[]
    )
    issues = evaluate_rendered_pages(
        rendered_pages=[_rendered_with(panel=panel, artifact=artifact)],
        bible_ids={"aiko"},
    )
    no_ref = next(i for i in issues if i.code == "panel_no_reference_attached")
    assert no_ref.severity == "warning"


def test_evaluate_rendered_pages_flags_render_success_invariant_violations():
    """A 'rendered' artifact missing image_path is a wiring bug, not a soft signal."""
    panel = _panel("p", character_ids=[])
    # Artificial inconsistency: no error AND no image_path.
    artifact = PanelRenderArtifact()
    issues = evaluate_rendered_pages(
        rendered_pages=[_rendered_with(panel=panel, artifact=artifact)],
        bible_ids=set(),
    )
    assert any(i.code == "panel_rendered_without_path" for i in issues)


def test_evaluate_rendered_pages_flags_failed_panel_with_path():
    """Failure + populated path must never both be true."""
    panel = _panel("p", character_ids=[])
    artifact = PanelRenderArtifact(image_path="x.png", error="boom")
    issues = evaluate_rendered_pages(
        rendered_pages=[_rendered_with(panel=panel, artifact=artifact)],
        bible_ids=set(),
    )
    assert any(i.code == "panel_failed_but_has_path" for i in issues)


def test_evaluate_rendered_pages_silent_on_clean_render():
    """A panel that rendered cleanly with a known character must not produce issues."""
    panel = _panel("p", character_ids=["aiko"])
    artifact = PanelRenderArtifact(
        image_path="x.png", image_aspect_ratio="4:3", used_reference_assets=["aiko"]
    )
    issues = evaluate_rendered_pages(
        rendered_pages=[_rendered_with(panel=panel, artifact=artifact)],
        bible_ids={"aiko"},
    )
    assert issues == []


def test_panel_rendering_stage_requires_rendered_pages():
    """A wiring bug that skips the assembly stage must fail loud, not silently no-op."""
    ctx = _ctx(
        bible=_bible("aiko"),
        options={"image_api_key": "fake-key"},
    )
    with pytest.raises(ValueError, match="rendered_pages"):
        asyncio.run(panel_rendering_stage.run(ctx))


# --- panel_quality_gate_stage now reads rendered_pages -----------------------


def test_panel_quality_gate_runs_when_artifacts_show_render_attempt():
    """The gate's short-circuit triggers off any rendered-or-errored artifact."""
    panel = _panel("p", character_ids=["aiko"])
    storyboard = _page([panel])
    rendered = empty_rendered_page(storyboard_page=storyboard, composition=None)
    rendered.panel_artifacts["p"].image_path = "x.png"
    rendered.panel_artifacts["p"].image_aspect_ratio = "4:3"
    rendered.panel_artifacts["p"].used_reference_assets = ["aiko"]
    ctx = _ctx(
        storyboard_pages=[storyboard],
        rendered_pages=[rendered],
        bible=_bible("aiko"),
    )
    asyncio.run(panel_quality_gate_stage.run(ctx))
    # No defects \u2014 but the gate ran (quality_report exists).
    assert ctx.quality_report is not None
    assert ctx.quality_report.passed is True


def test_panel_quality_gate_short_circuits_when_no_artifact_was_attempted():
    """When every artifact is in default state, the gate must NOT mutate the report."""
    panel = _panel("p", character_ids=["aiko"])
    storyboard = _page([panel])
    rendered = empty_rendered_page(storyboard_page=storyboard, composition=None)
    ctx = _ctx(
        storyboard_pages=[storyboard],
        rendered_pages=[rendered],
        bible=_bible("aiko"),
    )
    asyncio.run(panel_quality_gate_stage.run(ctx))
    assert ctx.quality_report is None
