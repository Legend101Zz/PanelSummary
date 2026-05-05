"""Phase 4.5a (post-4.5c) — rendered_page is the only persisted page contract.

Pins the safe-foundation invariants the storage decoupling rests on:

* The ``rendered_page`` field default is **opt-in** — every legacy doc
  / artifact / pipeline result loads cleanly without a Beanie
  migration. Pre-4.5a docs whose ``rendered_page`` is the default
  empty dict are expected to be regenerated, not migrated client-side.
* A real ``RenderedPage`` round-trips losslessly through
  ``model_dump(mode="json")`` ⇄ ``model_validate``. This is the
  contract the persistence layer and the frontend rely on to treat
  the dict as a typed shape.
* The persistence write-site in ``generation_service`` passes the
  ``rendered_page=`` kwarg. We pin this with an ``inspect.getsource``
  substring check rather than mocking out half of Mongo, because the
  write-site is one small loop inside a much larger orchestration
  function and a wiring guard is the cheapest way to fail loudly if a
  future refactor drops the kwarg.
* ``PipelineContext.result()`` actually performs the ``model_dump``
  serialisation — so the typed ``RenderedPage`` flows out of the
  pipeline as JSON-ready dicts and downstream callers never have to
  think about enum coercion.
* The HTTP serialiser surfaces ``rendered_page`` as the only page
  payload. (Phase 4.5c removed the ``v4_page`` key it briefly carried
  alongside, alongside the V4 frontend that consumed it.)
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
    """Docs persisted before 4.5a must load cleanly — default is an empty dict."""
    # ``model_construct`` bypasses Beanie's collection-init guard so we
    # can exercise the field defaults without spinning up a Mongo /
    # init_beanie context. Default factories still fire in v2's
    # ``model_construct`` so this is a real test of the field default.
    doc = MangaPageDoc.model_construct(project_id="p", slice_id="s", page_index=0)
    assert doc.rendered_page == {}


def test_manga_page_artifact_rendered_page_defaults_to_empty_dict():
    """The domain twin of MangaPageDoc carries the same default shape."""
    artifact = MangaPageArtifact(page_id="x", page_index=0)
    assert artifact.rendered_page == {}


def test_pipeline_result_rendered_pages_defaults_to_empty_list():
    """A pipeline that never assembled a rendered page emits an empty list, not None."""
    result = PipelineResult(
        source_slice=_source_slice(),
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


def test_generation_service_persists_rendered_page():
    """The MangaPageDoc constructor in the persistence loop names ``rendered_page``.

    A wiring guard, not a behaviour test: the loop runs deep inside a
    long Mongo-bound function, so we pin the kwarg at the source level.
    Drop the kwarg and this fails loudly with the exact field name that
    went missing. (Phase 4.5c removed the parallel ``v4_page=v4_page``
    kwarg this guard used to also pin.)
    """
    source = inspect.getsource(generation_service)
    assert "rendered_page=rendered_page_dump," in source
    # And the legacy kwarg must NOT come back accidentally during a
    # rebase or revert — the V4 surface is gone for good.
    assert "v4_page=v4_page," not in source


# --- API serialiser surfaces rendered_page as the only payload ---------------


def test_serialize_page_doc_surfaces_rendered_page_only():
    """The HTTP response carries ``rendered_page`` and not the deleted ``v4_page``."""
    rp = _rendered_page()
    rendered_dump = rp.model_dump(mode="json")
    doc = MangaPageDoc.model_construct(
        project_id="p",
        slice_id="s",
        page_index=0,
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
    assert payload["rendered_page"] == rendered_dump
    # Phase 4.5c invariant: the V4 key is gone from the wire.
    assert "v4_page" not in payload
