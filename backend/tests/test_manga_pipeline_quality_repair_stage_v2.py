"""Tests for the v2 LLM-backed quality repair stage."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import (
    ContinuityLedger,
    MangaScript,
    MangaScriptScene,
    PanelPurpose,
    QualityIssue,
    QualityReport,
    ScriptLine,
    ShotType,
    SourceRange,
    SourceSlice,
    SourceSliceMode,
    StoryboardPage,
    StoryboardPanel,
)
from app.manga_pipeline import PipelineContext
from app.manga_pipeline.stages import quality_repair_stage


class FakeLLMClient:
    provider = "fake"
    model = "fake-quality-editor"

    def __init__(self, parsed: dict[str, Any]) -> None:
        self.parsed = parsed
        self.calls: list[dict[str, Any]] = []

    async def chat(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        return {
            "content": "{}",
            "parsed": self.parsed,
            "input_tokens": 999,
            "output_tokens": 444,
            "estimated_cost_usd": 0.011,
        }


def _context(llm_client: FakeLLMClient | None = None) -> PipelineContext:
    context = PipelineContext(
        book_id="book_123",
        project_id="project_123",
        source_slice=SourceSlice(
            slice_id="slice_001",
            book_id="book_123",
            mode=SourceSliceMode.PAGES,
            source_range=SourceRange(page_start=1, page_end=10),
        ),
        prior_continuity=ContinuityLedger(project_id="project_123"),
        llm_client=llm_client,
    )
    context.manga_script = MangaScript(
        slice_id="slice_001",
        scenes=[
            MangaScriptScene(
                scene_id="s001",
                beat_ids=["b001"],
                location="Archive",
                scene_goal="Explain scale.",
                action="Kai studies the growing lock.",
                dialogue=[ScriptLine(speaker_id="kai", text="It changes as it grows.")],
            )
        ],
        to_be_continued=True,
    )
    context.storyboard_pages = [
        StoryboardPage(
            page_id="pg001",
            page_index=0,
            panels=[
                StoryboardPanel(
                    panel_id="p001",
                    scene_id="s001",
                    purpose=PanelPurpose.REVEAL,
                    shot_type=ShotType.WIDE,
                    composition="Kai faces a growing lock.",
                    action="The lock expands.",
                )
            ],
        )
    ]
    context.quality_report = QualityReport(
        passed=False,
        issues=[
            QualityIssue(
                severity="error",
                code="missing_to_be_continued",
                message="Partial source generation needs a To Be Continued panel/page.",
            )
        ],
    )
    return context


def _repaired_storyboard() -> dict[str, Any]:
    return {
        "slice_id": "slice_001",
        "pages": [
            {
                "page_id": "pg001",
                "page_index": 0,
                "panels": [
                    {
                        "panel_id": "p001",
                        "scene_id": "s001",
                        "purpose": "reveal",
                        "shot_type": "wide",
                        "composition": "Kai faces a growing lock.",
                        "action": "The lock expands.",
                    },
                    {
                        "panel_id": "p_tbc",
                        "scene_id": "s001",
                        "purpose": "to_be_continued",
                        "shot_type": "symbolic",
                        "composition": "A larger lock waits in shadow.",
                        "narration": "The next scale waits.",
                    },
                ],
            }
        ],
    }


def test_quality_repair_stage_repairs_failed_report_with_llm():
    client = FakeLLMClient(_repaired_storyboard())
    context = _context(client)

    result = asyncio.run(quality_repair_stage.run(context))

    assert len(result.storyboard_pages[0].panels) == 2
    assert result.storyboard_pages[0].panels[1].purpose == PanelPurpose.TO_BE_CONTINUED
    assert result.llm_traces[0].stage_name.value == "quality_repair"
    assert "quality_report" in client.calls[0]["user_message"]
    assert "JSON_SCHEMA" in client.calls[0]["user_message"]


def test_quality_repair_stage_noops_when_quality_passed():
    client = FakeLLMClient(_repaired_storyboard())
    context = _context(client)
    context.quality_report = QualityReport(passed=True)

    result = asyncio.run(quality_repair_stage.run(context))

    assert result is context
    assert client.calls == []
