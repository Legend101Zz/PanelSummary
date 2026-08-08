"""Session 6 (issue #7): vision-QA gate upgrades under page-art-gates.v3.

1. The two donor ScrollStack images that rendered the English heading
   (`SATIATION, THEN THE LOCAL-VS-GLOBAL TRADE-OFF.`) are now red fixtures
   for the production OCR gate — the exact evidence the issue names
   (ported from the donor's phase2-openrouter-preview evidence dir, hashes
   pinned in its NEXT_SESSION.md asset ledger).
2. Empty-balloon detection is a REJECT reason: a drawn balloon-like empty
   shape fights the code-owned lettering layer.
3. Every gated attempt persists a durable ``qa_report`` artifact —
   accepted AND rejected.
"""

import asyncio
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import pytest

from app.services.manga_page_art import ocr_gate
from app.services.manga_page_art_stage import (
    GATE_POLICY_VERSION,
    MangaPageArtStageService,
)
from test_manga_page_art_v2 import (
    _echo_skeleton_caller,
    _good_vision,
    _planning_lineage,
)
from test_manga_page_planner_v2 import PROJECT_ID

HAS_TESSERACT = shutil.which("tesseract") is not None
OCR_FIXTURES = Path(__file__).resolve().parent / "fixtures" / "ocr_gate"


def run(coro):
    return asyncio.run(coro)


def test_gate_policy_is_v3():
    assert GATE_POLICY_VERSION == "page-art-gates.v3"


@pytest.mark.skipif(not HAS_TESSERACT, reason="tesseract binary unavailable")
@pytest.mark.parametrize(
    "fixture_name",
    ["donor_heading_page0.png", "donor_heading_page1.png"],
)
def test_donor_heading_images_fail_the_ocr_gate(fixture_name):
    result = ocr_gate(OCR_FIXTURES / fixture_name)
    assert result.clean is False
    detected = " ".join(word["text"].lower() for word in result.text_words)
    assert "satiation" in detected


def _balloon_vision(expected: int):
    async def vision_qa(*, image_path, briefs, expected_panel_count, system_prompt):
        # The v3 prompt must ask for the balloon verdict.
        assert "empty_balloon" in system_prompt
        return {
            "parsed": {
                "panel_count": expected,
                "panels": [
                    {
                        "index": i + 1,
                        "matches_brief": True,
                        "identity_ok": True,
                        "contains_text": False,
                        "empty_balloon": i == 0,
                        "notes": "drawn empty balloon in panel 1",
                    }
                    for i in range(expected)
                ],
                "overall_ok": True,
            },
            "usage": {"prompt_tokens": 900, "completion_tokens": 150},
            "cost_usd": 0.002,
        }

    return vision_qa


@pytest.mark.skipif(not HAS_TESSERACT, reason="tesseract binary unavailable")
def test_empty_balloon_rejects_and_qa_reports_persist(tmp_path):
    async def scenario():
        repositories, run_id = await _planning_lineage(tmp_path)
        service = MangaPageArtStageService(
            repositories,
            media_root=tmp_path,
            image_caller=_echo_skeleton_caller(),
            vision_qa=_balloon_vision(2),
        )
        outcome = await service.run_page_art_stage(
            project_id=PROJECT_ID, run_id=run_id, image_budget_usd=0.50
        )
        # Both attempts per page reject on the balloon verdict; the pages
        # still ship DSL-only (issue #7: never block a page on an image).
        for page in outcome.pages:
            assert page.status == "dsl_only_after_rejected"
            assert page.attempts == 2
            assert "balloon" in page.gate_summary["reject_reason"]
            assert page.gate_summary["vision_empty_balloon"] is True
            # One durable QA report per gated attempt, rejected included.
            assert len(page.qa_report_artifact_ids) == 2

        artifacts = await repositories.list_artifacts(run_id, accepted_only=True)
        reports = [a for a in artifacts if a.kind == "qa_report"]
        assert len(reports) == 4  # 2 pages x 2 attempts
        for report in reports:
            assert report.schema_version == "qa-report.v1"
            assert report.content["gate_policy_version"] == "page-art-gates.v3"
            assert report.content["accepted"] is False
            assert report.content["gates"]["vision_empty_balloon"] is True

    run(scenario())


@pytest.mark.skipif(not HAS_TESSERACT, reason="tesseract binary unavailable")
def test_accepted_pages_persist_accepted_qa_reports(tmp_path):
    async def scenario():
        repositories, run_id = await _planning_lineage(tmp_path)
        service = MangaPageArtStageService(
            repositories,
            media_root=tmp_path,
            image_caller=_echo_skeleton_caller(),
            vision_qa=_good_vision(2),
        )
        outcome = await service.run_page_art_stage(
            project_id=PROJECT_ID, run_id=run_id, image_budget_usd=0.20
        )
        assert [page.status for page in outcome.pages] == ["art_accepted"] * 2
        for page in outcome.pages:
            assert len(page.qa_report_artifact_ids) == 1
        artifacts = await repositories.list_artifacts(run_id, accepted_only=True)
        reports = [a for a in artifacts if a.kind == "qa_report"]
        assert len(reports) == 2
        assert all(report.content["accepted"] is True for report in reports)

    run(scenario())
