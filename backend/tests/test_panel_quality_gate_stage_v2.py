"""Phase 7 + 10 tests \u2014 storyboard precision and panel-level quality gate.

We test the unit behaviours that the new pipeline depends on:

* StoryboardPanel auto-includes dialogue speakers in ``character_ids``.
* The storyboard \u2192 V4 mapper carries the full ``character_ids`` list through.
* V4Panel.to_dict round-trips ``character_ids``.
* The panel quality gate stage flags hallucinated characters, missing reference
  attachments, and renderer/state mismatches \u2014 and is a no-op when image
  generation didn't run.
* build_v2_generation_stages includes the gate after panel rendering when
  ``with_panel_rendering=True``.

We avoid network or filesystem; the gate is pure over the panel + result + bible.
"""

from __future__ import annotations

import asyncio

from app.domain.manga import (
    CharacterDesign,
    CharacterWorldBible,
    PanelPurpose,
    PanelRenderArtifact,
    QualityIssue,
    QualityReport,
    RenderedPage,
    ScriptLine,
    ShotType,
    StoryboardPage,
    StoryboardPanel,
)
from app.domain.manga.types import SourceRange, SourceSlice, SourceSliceMode
from app.manga_pipeline.context import PipelineContext
from app.manga_pipeline.stages import panel_quality_gate_stage
from app.manga_pipeline.stages.panel_quality_gate_stage import (
    _merge_into_report,
)
from app.services.manga.generation_service import build_v2_generation_stages


# ---------------------------------------------------------------------------
# Phase 7 \u2014 storyboard precision
# ---------------------------------------------------------------------------


def _line(speaker: str, text: str) -> ScriptLine:
    return ScriptLine(speaker_id=speaker, text=text)


def _panel(
    *,
    panel_id: str = "p1",
    scene_id: str = "s1",
    purpose: PanelPurpose = PanelPurpose.EXPLANATION,
    shot_type: ShotType = ShotType.MEDIUM,
    composition: str = "two characters facing off in mid-shot",
    action: str = "they argue",
    dialogue: list[ScriptLine] | None = None,
    character_ids: list[str] | None = None,
) -> StoryboardPanel:
    return StoryboardPanel(
        panel_id=panel_id,
        scene_id=scene_id,
        purpose=purpose,
        shot_type=shot_type,
        composition=composition,
        action=action,
        dialogue=dialogue or [],
        character_ids=character_ids or [],
    )


def test_storyboard_panel_auto_includes_dialogue_speakers():
    panel = _panel(
        dialogue=[_line("alpha", "we have to move"), _line("beta", "not yet")],
        character_ids=["alpha"],
    )
    # Speakers always count as visually present; beta gets added even though
    # the LLM forgot to list them.
    assert panel.character_ids == ["alpha", "beta"]


def test_storyboard_panel_keeps_listed_silent_characters():
    # A non-speaking character explicitly listed must survive the auto-merge.
    panel = _panel(
        dialogue=[_line("alpha", "look at this")],
        character_ids=["alpha", "ghost-witness"],
    )
    assert panel.character_ids == ["alpha", "ghost-witness"]


def test_storyboard_panel_dedupes_and_preserves_order():
    panel = _panel(
        dialogue=[_line("alpha", "one"), _line("alpha", "two")],
        character_ids=["alpha"],
    )
    assert panel.character_ids == ["alpha"]


# ---------------------------------------------------------------------------
# Phase 10 \u2014 panel-level quality gate
# ---------------------------------------------------------------------------


def _bible(*ids: str) -> CharacterWorldBible:
    return CharacterWorldBible(
        slice_id="slice-1",
        world_summary="A test world.",
        visual_style="clean ink lines",
        characters=[
            CharacterDesign(
                character_id=cid,
                name=cid.title(),
                role="protagonist" if i == 0 else "supporting",
                visual_lock=f"{cid} looks distinct",
                silhouette_notes="tall narrow",
                outfit_notes="dark coat",
                hair_or_face_notes="short hair",
            )
            for i, cid in enumerate(ids)
        ],
    )


def test_panel_gate_skips_when_no_renderer_summary():
    # Image generation was off \u2014 stage should be a no-op.
    context = _context_with_rendered_pages_and_bible(rendered_panels=False, with_summary=False)
    asyncio.run(panel_quality_gate_stage.run(context))
    # No quality report mutation: it stays None when nothing else set it.
    assert context.quality_report is None


def test_panel_gate_merges_into_existing_quality_report():
    context = _context_with_rendered_pages_and_bible(
        rendered_panels=True,
        with_summary=True,
        unknown_character=True,
    )
    context.quality_report = QualityReport(
        passed=True,
        issues=[QualityIssue(severity="warning", code="prior", message="prior issue")],
    )
    asyncio.run(panel_quality_gate_stage.run(context))
    report = context.quality_report
    assert report is not None
    codes = {issue.code for issue in report.issues}
    # Both the prior warning and the new error must coexist.
    assert "prior" in codes
    assert "panel_unknown_character" in codes
    assert report.passed is False  # has an error now


def test_merge_report_from_none_starts_passing_unless_error():
    issues = [QualityIssue(severity="warning", code="x", message="m")]
    report = _merge_into_report(None, issues)
    assert report.passed is True

    err_issues = [QualityIssue(severity="error", code="y", message="m")]
    report = _merge_into_report(None, err_issues)
    assert report.passed is False


# ---------------------------------------------------------------------------
# Pipeline wiring
# ---------------------------------------------------------------------------


def test_panel_quality_gate_runs_after_panel_rendering_when_enabled():
    names = [
        stage.__module__.rsplit(".", 1)[-1]
        for stage in build_v2_generation_stages(with_panel_rendering=True)
    ]
    assert "panel_rendering_stage" in names
    assert "panel_quality_gate_stage" in names
    assert names.index("panel_quality_gate_stage") == names.index("panel_rendering_stage") + 1


def test_panel_quality_gate_absent_when_panel_rendering_off():
    names = [
        stage.__module__.rsplit(".", 1)[-1]
        for stage in build_v2_generation_stages(with_panel_rendering=False)
    ]
    assert "panel_rendering_stage" not in names
    assert "panel_quality_gate_stage" not in names


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _context_with_rendered_pages_and_bible(
    *,
    rendered_panels: bool,
    with_summary: bool,
    unknown_character: bool = False,
) -> PipelineContext:
    """Build the standard 'one panel + bible + optional render summary' fixture.

    The helper used to be ``_context_with_v4_pages_and_bible`` and built
    a parallel V4 dict alongside the typed ``RenderedPage``. Phase 4.5c
    deleted the V4 surface, so the V4 dict + ``v4_pages=`` plumbing are
    gone and the helper now builds only the typed page.
    """
    bible = _bible("alpha")
    panel_character_ids = ["alpha"]
    if unknown_character:
        # The bible doesn't define 'ghost', so the gate should flag the
        # storyboard's character_ids as a hallucination.
        panel_character_ids = ["alpha", "ghost"]

    options: dict = {}
    if with_summary:
        options["panel_rendering_summary"] = {
            "rendered": 1 if rendered_panels else 0,
            "failed": 0 if rendered_panels else 1,
            "results": [
                {
                    "panel_id": "p1",
                    "page_index": 0,
                    "image_path": "manga_panels/proj/slice/page_00/p1.png" if rendered_panels else "",
                    "aspect_ratio": "1:1" if rendered_panels else "",
                    "error": "" if rendered_panels else "boom",
                    "used_reference_assets": ["alpha"] if rendered_panels else [],
                }
            ],
        }

    return PipelineContext(
        book_id="book-1",
        project_id="proj",
        source_slice=SourceSlice(
            slice_id="slice-1",
            book_id="book-1",
            mode=SourceSliceMode.PAGES,
            source_range=SourceRange(page_start=1, page_end=2),
        ),
        prior_continuity=__import__("app.domain.manga", fromlist=["ContinuityLedger"]).ContinuityLedger(
            project_id="proj"
        ),
        options=options,
        character_bible=bible,
        # Phase 4.5c: ``v4_pages=`` is gone. The gate reads
        # ``context.rendered_pages`` exclusively now.
        rendered_pages=[
            _rendered_page_for_test(
                panel_character_ids=panel_character_ids,
                rendered=rendered_panels,
                with_summary=with_summary,
            )
        ],
    )


def _rendered_page_for_test(
    *, panel_character_ids: list[str], rendered: bool, with_summary: bool = True
) -> RenderedPage:
    """Build a RenderedPage that mirrors the v4 page used by the legacy helper.

    ``with_summary=False`` represents the "image gen was off" branch: the
    artifact stays in its empty default state (no path, no error). The
    gate's short-circuit treats this as 'nothing to evaluate' — same
    semantic as the old 'no renderer_summary present' short-circuit it
    replaces.

    ``rendered=False, with_summary=True`` represents the "renderer ran
    but failed" branch: the artifact carries an error string and no
    image_path. The gate enters its evaluation loop in that case.
    """
    panel = StoryboardPanel(
        panel_id="p1",
        scene_id="s1",
        purpose=PanelPurpose.EXPLANATION,
        shot_type=ShotType.MEDIUM,
        composition="two characters facing off in mid-shot",
        action="placeholder action so the panel validates",
        narration="",
        dialogue=[],
        character_ids=list(panel_character_ids),
    )
    page = StoryboardPage(page_id="page-0", page_index=0, panels=[panel])
    if not with_summary:
        # "Image generation was off" — leave artifact empty so the gate
        # short-circuits the same way it did when no renderer_summary
        # was present.
        artifact = PanelRenderArtifact(
            requested_character_count=len({c for c in panel_character_ids if c}),
        )
    else:
        artifact = PanelRenderArtifact(
            image_path="manga_panels/proj/slice/page_00/p1.png" if rendered else "",
            image_aspect_ratio="1:1" if rendered else "",
            used_reference_assets=["alpha"] if rendered else [],
            requested_character_count=len({c for c in panel_character_ids if c}),
            error="" if rendered else "boom",
        )
    return RenderedPage(
        storyboard_page=page,
        panel_artifacts={"p1": artifact},
    )


# ---------------------------------------------------------------------------
# Phase 3.3 — sprite-bank hit-rate warning surfaces on QualityReport.
# ---------------------------------------------------------------------------


def _ctx_with_hit_rate(hit_rate: float | None, requested: int = 5, resolved: int = 1) -> PipelineContext:
    """Minimal context that triggers the gate's hit-rate branch.

    Reuses ``_context_with_rendered_pages_and_bible`` for the panel/page
    bones and overlays a panel_rendering_summary with the hit-rate we
    care about. Building a second helper would duplicate the bible /
    rendered_pages plumbing for a one-line difference.
    """
    ctx = _context_with_rendered_pages_and_bible(rendered_panels=True, with_summary=True)
    ctx.options["panel_rendering_summary"] = {
        "rendered": 1,
        "failed": 0,
        "character_slots_requested": requested,
        "character_slots_resolved": resolved,
        "sprite_bank_hit_rate": hit_rate,
        "results": [
            {
                "panel_id": "p1",
                "page_index": 0,
                "image_path": "manga_panels/proj/slice/page_00/p1.png",
                "aspect_ratio": "1:1",
                "error": "",
                "used_reference_assets": ["alpha"],
                "requested_character_count": 1,
            }
        ],
    }
    return ctx


def test_panel_quality_gate_warns_on_low_sprite_bank_hit_rate():
    ctx = _ctx_with_hit_rate(0.2, requested=5, resolved=1)
    asyncio.run(panel_quality_gate_stage.run(ctx))
    assert ctx.quality_report is not None
    codes = {issue.code for issue in ctx.quality_report.issues}
    assert "sprite_bank_low_hit_rate" in codes
    # Warnings should NOT flip passed=False — that would refuse to ship a
    # slice over a soft signal. Errors do; warnings explain.
    assert ctx.quality_report.passed is True


def test_panel_quality_gate_silent_when_hit_rate_above_threshold():
    """At 0.8 the bank is doing its job; no warning should land."""
    ctx = _ctx_with_hit_rate(0.8, requested=5, resolved=4)
    asyncio.run(panel_quality_gate_stage.run(ctx))
    assert ctx.quality_report is not None
    codes = {issue.code for issue in ctx.quality_report.issues}
    assert "sprite_bank_low_hit_rate" not in codes


def test_panel_quality_gate_silent_when_hit_rate_is_none():
    """None means 'no panel asked for a character' — celebrating that as
    a 100% hit-rate is misleading; not warning is correct."""
    ctx = _ctx_with_hit_rate(None, requested=0, resolved=0)
    asyncio.run(panel_quality_gate_stage.run(ctx))
    assert ctx.quality_report is not None
    codes = {issue.code for issue in ctx.quality_report.issues}
    assert "sprite_bank_low_hit_rate" not in codes
