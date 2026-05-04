"""Tests for manga project service helpers."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from types import SimpleNamespace

from app.domain.manga import ContinuityLedger
from app.services.manga import build_project_seed, load_project_ledger, serialize_project


def test_build_project_seed_initializes_empty_ledger():
    seed = build_project_seed(
        book_id="book_123",
        style="manga",
        engine="v4",
        title="A Test Manga",
        project_options={"page_window": 10},
    )

    assert seed["book_id"] == "book_123"
    assert seed["style"] == "manga"
    assert seed["engine"] == "v4"
    assert seed["title"] == "A Test Manga"
    assert seed["project_options"] == {"page_window": 10}
    assert seed["continuity_ledger"]["project_id"] == "pending"


def test_load_project_ledger_round_trips_domain_model():
    project = SimpleNamespace(
        id="project_123",
        continuity_ledger=ContinuityLedger(
            project_id="project_123",
            known_fact_ids=["f001"],
        ).model_dump(mode="json"),
    )

    ledger = load_project_ledger(project)

    assert ledger.project_id == "project_123"
    assert ledger.known_fact_ids == ["f001"]


def test_serialize_project_exposes_control_plane_fields():
    project = SimpleNamespace(
        id="project_123",
        book_id="book_123",
        style="manga",
        engine="v4",
        title="Manga Control Plane",
        status="pending",
        project_options={},
        adaptation_plan={},
        character_world_bible={},
        book_synopsis={},
        arc_outline={},
        understanding_status="pending",
        understanding_error="",
        bible_locked=False,
        book_understanding_traces=[],
        fact_registry=[],
        continuity_ledger={"project_id": "pending"},
        coverage={},
        legacy_summary_id=None,
        active_version=1,
        created_at=__import__("datetime").datetime(2026, 1, 1),
        updated_at=__import__("datetime").datetime(2026, 1, 1),
    )

    payload = serialize_project(project)

    assert payload["book_id"] == "book_123"
    assert payload["title"] == "Manga Control Plane"
    assert payload["fact_count"] == 0
    assert payload["continuity_ledger"]["project_id"] == "pending"
    assert payload["active_version"] == 1
    # Phase 1: book-understanding fields surface to the API/UI.
    assert payload["understanding_status"] == "pending"
    assert payload["bible_locked"] is False
    assert payload["book_synopsis"] == {}
    assert payload["arc_outline"] == {}
