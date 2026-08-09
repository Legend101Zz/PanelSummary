"""Session 6: reader-v2 seam — pure selection + media-path safety.

The route itself is a thin read-only assembly over ``Repositories``; the
behavior that can rot silently is pinned here without Mongo:

1. ``latest_composed_per_page`` — supersedes-aware latest-per-page pick
   (the recompose stage stacks superseding rows on the same run);
2. ``storage_media_url`` — only the two rendering-lane folders map onto
   the media route;
3. ``resolve_v2_media_path`` — allowlist + traversal safety.
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.api.routes.manga_v2_reader import (
    latest_composed_per_page,
    resolve_v2_media_path,
    storage_media_url,
)
from app.persistence.documents import ArtifactDoc, construct_document

NOW = datetime(2026, 8, 9, 12, 0, tzinfo=UTC)


def _composed(
    artifact_id: str,
    *,
    page_index: int,
    created_offset_min: int = 0,
    supersedes: str | None = None,
    status: str = "accepted",
) -> ArtifactDoc:
    return construct_document(
        ArtifactDoc,
        artifact_id=artifact_id,
        project_id="project_demo",
        run_id="run_dir_demo",
        stage_run_id="stage_demo",
        kind="composed_page",
        schema_version="composed-page.v1",
        content={"page_index": page_index},
        storage_ref=f"storage://composed-pages/{artifact_id}.png",
        content_hash="c" * 64,
        parent_artifact_ids=[],
        author="system",
        supersedes_artifact_id=supersedes,
        source_refs=[],
        model_receipt=None,
        validation_status=status,
        validation_report={"passed": True, "issues": [], "validator_version": "t"},
        created_at=NOW + timedelta(minutes=created_offset_min),
    )


def test_superseded_rows_are_never_served() -> None:
    original = _composed("composed_old", page_index=0)
    recomposed = _composed(
        "composed_new", page_index=0, created_offset_min=5, supersedes="composed_old"
    )
    picked = latest_composed_per_page([original, recomposed])
    assert [artifact.artifact_id for artifact in picked] == ["composed_new"]


def test_latest_wins_per_page_and_pages_sort_by_index() -> None:
    rows = [
        _composed("composed_p1", page_index=1),
        _composed("composed_p0_old", page_index=0),
        _composed("composed_p0_new", page_index=0, created_offset_min=3),
    ]
    picked = latest_composed_per_page(rows)
    assert [artifact.artifact_id for artifact in picked] == [
        "composed_p0_new",
        "composed_p1",
    ]


def test_non_accepted_rows_are_ignored() -> None:
    rows = [_composed("composed_bad", page_index=0, status="invalid")]
    assert latest_composed_per_page(rows) == []


def test_media_url_maps_only_rendering_lane_folders() -> None:
    assert (
        storage_media_url("storage://composed-pages/abc.png")
        == "/v2-media/composed-pages/abc.png"
    )
    assert (
        storage_media_url("storage://page-art/abc.png")
        == "/v2-media/page-art/abc.png"
    )
    assert storage_media_url("storage://images/private.png") is None
    assert storage_media_url("storage://pdfs/book.pdf") is None
    assert storage_media_url(None) is None


def test_media_path_resolution_is_allowlisted_and_traversal_safe(tmp_path: Path) -> None:
    (tmp_path / "composed-pages").mkdir()
    target = tmp_path / "composed-pages" / "page.png"
    target.write_bytes(b"png")
    secret = tmp_path / "secret.txt"
    secret.write_text("nope")

    assert resolve_v2_media_path(tmp_path, "composed-pages/page.png") == target
    with pytest.raises(HTTPException):
        resolve_v2_media_path(tmp_path, "images/page.png")  # not allowlisted
    with pytest.raises(HTTPException):
        resolve_v2_media_path(tmp_path, "composed-pages/../secret.txt")
    with pytest.raises(HTTPException):
        resolve_v2_media_path(tmp_path, "composed-pages/missing.png")


# ---------------------------------------------------------------------------
# Session 7 fold: page_art fallback when a page has no composed row
# ---------------------------------------------------------------------------


def _page_art(
    artifact_id: str,
    *,
    page_index: int,
    created_offset_min: int = 0,
    supersedes: str | None = None,
) -> ArtifactDoc:
    return construct_document(
        ArtifactDoc,
        artifact_id=artifact_id,
        project_id="project_demo",
        run_id="run_dir_demo",
        stage_run_id="stage_demo",
        kind="page_art",
        schema_version="page-art.v1",
        content={
            "page_index": page_index,
            "page_plan_id": f"plan_p{page_index}",
            "rendering_mode": "C",
            "gates": {"accepted": True},
        },
        storage_ref=f"storage://page-art/{artifact_id}.png",
        content_hash="a" * 64,
        parent_artifact_ids=[],
        author="system",
        supersedes_artifact_id=supersedes,
        source_refs=[],
        model_receipt=None,
        validation_status="accepted",
        validation_report={"passed": True, "issues": [], "validator_version": "t"},
        created_at=NOW + timedelta(minutes=created_offset_min),
    )


def test_latest_accepted_per_page_generalizes_to_page_art() -> None:
    from app.api.routes.manga_v2_reader import latest_accepted_per_page

    rows = [
        _page_art("art_old", page_index=0),
        _page_art("art_new", page_index=0, created_offset_min=2, supersedes="art_old"),
        _page_art("art_p1", page_index=1),
    ]
    picked = latest_accepted_per_page(rows, kind="page_art")
    assert {index: item.artifact_id for index, item in picked.items()} == {
        0: "art_new",
        1: "art_p1",
    }


def test_route_serves_art_only_pages_instead_of_404() -> None:
    """A page with accepted page_art but NO composed row (mid-pipeline
    crash / compose regression) is served with composed=None; a project
    with art rows only no longer 404s."""
    import asyncio

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.api.routes.manga_v2_reader import manga_v2_reader_router
    from app.persistence.documents import GenerationRunDoc
    from app.persistence.repositories import InMemoryRepositories

    repository = InMemoryRepositories()
    repository.runs["run_dir_demo"] = construct_document(
        GenerationRunDoc,
        run_id="run_dir_demo",
        project_id="project_demo",
        scope_id="scope_demo",
        requested_outputs=["manga"],
        pipeline_version="manga-page-dsl.v2",
        memory_version=1,
        status="succeeded",
        active_stage=None,
        budget={},
        created_by="user_demo",
        idempotency_key="run_demo_key",
        created_at=NOW,
        updated_at=NOW,
    )
    composed = _composed("composed_p0", page_index=0)
    art_only = _page_art("art_p1", page_index=1)
    repository.artifacts[composed.artifact_id] = composed
    repository.artifacts[art_only.artifact_id] = art_only

    app = FastAPI()
    app.include_router(
        manga_v2_reader_router(repository, storage_root=Path("/tmp/unused"))
    )
    client = TestClient(app)

    payload = client.get("/manga-projects/project_demo/v2/pages").json()
    assert [page["page_index"] for page in payload["pages"]] == [0, 1]
    composed_page, art_page = payload["pages"]
    assert composed_page["composed"] is not None
    assert art_page["composed"] is None
    assert art_page["page_art"]["artifact_id"] == "art_p1"
    assert art_page["page_art"]["image_url"] == "/v2-media/page-art/art_p1.png"
    assert art_page["page_art"]["gates_accepted"] is True
