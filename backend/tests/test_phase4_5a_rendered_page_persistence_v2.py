"""Phase 4.5a — rendered_page lives next to v4_page end-to-end.

Pins the safe-foundation invariants the storage decoupling rests on:

* The new ``rendered_page`` field defaults are **opt-in** — every legacy
  doc / artifact / pipeline result loads cleanly without a Beanie
  migration. (4.5c will write that migration when we delete v4.)
* A real ``RenderedPage`` round-trips losslessly through
  ``model_dump(mode="json")`` ⇄ ``model_validate``. This is the
  contract the persistence layer and (eventually) the frontend rely on
  to treat the dict as a typed shape.
* The persistence write-site in ``generation_service`` passes BOTH
  fields. We pin this with an ``inspect.getsource`` substring check
  rather than mocking out half of Mongo, because the write-site is one
  small loop inside a much larger orchestration function and a wiring
  guard is the cheapest way to fail loudly if a future refactor drops
  one of the kwargs.
* ``PipelineContext.result()`` actually performs the ``model_dump``
  serialisation — so the typed ``RenderedPage`` flows out of the
  pipeline as JSON-ready dicts and downstream callers (the persistence
  layer, the API, future tests) never have to think about enum
  coercion.
* The HTTP serialiser surfaces both keys side-by-side, so the V4
  reader keeps consuming ``v4_page`` while 4.5b builds the new reader
  on ``rendered_page`` without any backend change.
"""

from __future__ import annotations

import inspect
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.api.routes.manga_projects import _serialize_page_doc
from app.domain.manga import (
    ContinuityLedger,
    PanelPurpose,
    RenderedPage,
    ScriptLine,
    ShotType,
    StoryboardPage,
    StoryboardPanel,
    empty_rendered_page,
)
from app.domain.manga.types import (
    MangaPageArtifact,
    SourceRange,
    SourceSlice,
    SourceSliceMode,
)
from app.manga_models import MangaPageDoc
from app.manga_pipeline.context import PipelineContext, PipelineResult
from app.services.manga import generation_service


# --- Minimal builders --------------------------------------------------------


def _panel(panel_id: str, *, character_ids: list[str] | None = None) -> StoryboardPanel:
    return StoryboardPanel(
        panel_id=panel_id,
        scene_id="scene-1",
        purpose=PanelPurpose.SETUP,
        shot_type=ShotType.WIDE,
        composition="Establishing wide of the lab interior.",
        action="Aiko steps through the airlock.",
        narration="",
        dialogue=[
            ScriptLine(
                speaker_id="aiko",
                text="The reactor is online.",
                source_fact_ids=["fact-001"],
            )
        ],
        character_ids=list(character_ids) if character_ids is not None else ["aiko"],
    )


def _rendered_page(panel_id: str = "panel-1") -> RenderedPage:
    page = StoryboardPage(
        page_id="page-0", page_index=0, panels=[_panel(panel_id)]
    )
    # composition=None exercises the renderer's default-stack fallback
    # path. The round-trip invariant must hold for it too.
    return empty_rendered_page(storyboard_page=page, composition=None)


def _source_slice() -> SourceSlice:
    return SourceSlice(
        slice_id="slice-1",
        book_id="book-1",
        mode=SourceSliceMode.PAGES,
        source_range=SourceRange(page_start=1, page_end=2),
    )


def _ctx(*, rendered_pages: list[RenderedPage] | None = None) -> PipelineContext:
    return PipelineContext(
        book_id="book-1",
        project_id="proj-1",
        source_slice=_source_slice(),
        prior_continuity=ContinuityLedger(project_id="proj-1"),
        rendered_pages=rendered_pages or [],
    )


# --- Default-factory invariants (legacy compat) ------------------------------


def test_manga_page_doc_rendered_page_defaults_to_empty_dict():
    """Docs persisted before 4.5a must load cleanly — default is the legacy shape."""
    # ``model_construct`` bypasses Beanie's collection-init guard so we
    # can exercise the field defaults without spinning up a Mongo /
    # init_beanie context. Default factories still fire in v2's
    # ``model_construct`` so this is a real test of the field default.
    doc = MangaPageDoc.model_construct(project_id="p", slice_id="s", page_index=0)
    assert doc.rendered_page == {}
    # Sanity: the legacy field is still default-empty too, so this doc
    # constructs identically to what 4.5a's predecessor produced.
    assert doc.v4_page == {}


def test_manga_page_artifact_rendered_page_defaults_to_empty_dict():
    """The domain twin of MangaPageDoc carries the same default shape."""
    artifact = MangaPageArtifact(page_id="x", page_index=0)
    assert artifact.rendered_page == {}
    assert artifact.v4_page == {}


def test_pipeline_result_rendered_pages_defaults_to_empty_list():
    """A pipeline that never assembled a rendered page emits an empty list, not None."""
    result = PipelineResult(
        source_slice=_source_slice(),
        v4_pages=[],
        quality_report=None,
    )
    assert result.rendered_pages == []


# --- RenderedPage round-trip (the persistence contract) ----------------------


def test_rendered_page_model_dump_round_trips_losslessly():
    """RenderedPage(model_validate(rp.dump())).dump() == rp.dump() — the wire-format invariant."""
    rp = _rendered_page()
    dump = rp.model_dump(mode="json")
    rebuilt = RenderedPage.model_validate(dump)
    assert rebuilt.model_dump(mode="json") == dump
    # ShotType / PanelPurpose surface as strings, not enum objects, so
    # Beanie / FastAPI can serialise the dict without further coercion.
    assert dump["storyboard_page"]["panels"][0]["shot_type"] == "wide"
    assert dump["storyboard_page"]["panels"][0]["purpose"] == "setup"


def test_manga_page_doc_stores_rendered_page_dump_transparently():
    """The doc constructor accepts a RenderedPage dump and round-trips it field-for-field."""
    rp = _rendered_page()
    dump = rp.model_dump(mode="json")
    doc = MangaPageDoc.model_construct(
        project_id="p",
        slice_id="s",
        page_index=0,
        rendered_page=dump,
    )
    # Field-for-field equality, not just key presence — the Beanie field
    # is a dict carrier that must NOT mutate the payload.
    assert doc.rendered_page == dump
    assert RenderedPage.model_validate(doc.rendered_page).model_dump(mode="json") == dump


# --- PipelineContext.result() serialises typed pages -------------------------


def test_pipeline_context_result_dumps_rendered_pages_via_model_dump_json():
    """PipelineContext.result() emits JSON-ready dicts so persistence stays enum-coercion-free."""
    rp = _rendered_page()
    ctx = _ctx(rendered_pages=[rp])
    result = ctx.result()
    assert len(result.rendered_pages) == 1
    assert result.rendered_pages[0] == rp.model_dump(mode="json")
    # Round-trip the dump back into a RenderedPage to prove the dict is
    # typed-shape-preserving (not a lossy projection).
    assert (
        RenderedPage.model_validate(result.rendered_pages[0]).model_dump(mode="json")
        == result.rendered_pages[0]
    )


def test_pipeline_context_result_handles_empty_rendered_pages():
    """An image-gen-disabled run still produces a valid PipelineResult — no rendered pages, no crash."""
    ctx = _ctx(rendered_pages=[])
    result = ctx.result()
    assert result.rendered_pages == []


# --- generation_service write-site wire guard --------------------------------


def test_generation_service_persists_both_v4_page_and_rendered_page():
    """The MangaPageDoc constructor in the persistence loop names BOTH fields.

    A wiring guard, not a behaviour test: the loop runs deep inside a
    long Mongo-bound function, so we pin the kwargs at the source level.
    Drop either kwarg and this fails loudly with the exact field name
    that went missing.
    """
    source = inspect.getsource(generation_service)
    # Both kwargs appear inside the same MangaPageDoc(...) constructor
    # call — the substring check would still pass if they drifted to
    # different call sites, but we only have one MangaPageDoc(...) in
    # generation_service.py and the surrounding loop is small enough
    # that drift is visible in a single read.
    assert "v4_page=v4_page," in source
    assert "rendered_page=rendered_page_dump," in source


# --- API serialiser surfaces both keys ---------------------------------------


def test_serialize_page_doc_surfaces_both_v4_page_and_rendered_page():
    """The HTTP response carries both shapes during the migration window."""
    rp = _rendered_page()
    rendered_dump = rp.model_dump(mode="json")
    # The legacy v4 dict is opaque to 4.5a — only its presence matters
    # to this test. An empty placeholder dict is enough to verify the
    # serialiser does not drop the key.
    legacy_v4 = {"page_index": 0, "panels": []}
    doc = MangaPageDoc.model_construct(
        project_id="p",
        slice_id="s",
        page_index=0,
        v4_page=legacy_v4,
        rendered_page=rendered_dump,
    )
    # ``id`` and ``created_at`` are auto-populated on real inserts; the
    # serialiser reads them but doesn't care about their content for
    # this invariant. ``model_construct`` skips defaults for those, so
    # we stub the bare minimum the serialiser dereferences.
    doc.id = "page-doc-id"
    from datetime import UTC, datetime

    doc.created_at = datetime(2026, 5, 5, tzinfo=UTC)
    payload = _serialize_page_doc(doc)
    assert payload["v4_page"] == legacy_v4
    assert payload["rendered_page"] == rendered_dump
