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


def test_quality_repair_stage_clears_stale_failed_report_after_replacement():
    client = FakeLLMClient(_repaired_storyboard())
    context = _context(client)

    result = asyncio.run(quality_repair_stage.run(context))

    assert result.quality_report is None


def test_quality_repair_uses_minimax_for_strict_json(monkeypatch):
    drafting_client = FakeLLMClient(_repaired_storyboard())
    drafting_client.provider = "minimax"
    drafting_client.model = "MiniMax-M2.5-highspeed"
    drafting_client.api_key = "minimax-key"
    quality_client = FakeLLMClient(_repaired_storyboard())
    constructed: list[dict[str, str | None]] = []

    def fake_llm_client(
        *,
        api_key: str,
        provider: str = "openai",
        model: str | None = None,
    ) -> FakeLLMClient:
        constructed.append({"api_key": api_key, "provider": provider, "model": model})
        quality_client.request_timeout_seconds = 0
        return quality_client

    monkeypatch.setattr(quality_repair_stage, "LLMClient", fake_llm_client, raising=False)
    context = _context(drafting_client)
    context.options["api_key"] = "openrouter-key"
    context.options["quality_repair_model"] = "quality-json-model"

    result = asyncio.run(quality_repair_stage.run(context))

    assert len(result.storyboard_pages[0].panels) == 2
    assert len(drafting_client.calls) == 1
    assert drafting_client.calls[0]["temperature"] == 0.25
    assert quality_client.calls == []
    assert constructed == []


def test_quality_repair_default_strict_lane_uses_current_minimax_model(monkeypatch):
    drafting_client = FakeLLMClient(_repaired_storyboard())
    drafting_client.provider = "minimax"
    drafting_client.model = "MiniMax-M2.5-highspeed"
    drafting_client.api_key = "minimax-key"
    quality_client = FakeLLMClient(_repaired_storyboard())
    constructed: list[dict[str, str | None]] = []

    def fake_llm_client(
        *,
        api_key: str,
        provider: str = "openai",
        model: str | None = None,
    ) -> FakeLLMClient:
        constructed.append({"api_key": api_key, "provider": provider, "model": model})
        return quality_client

    monkeypatch.setattr(quality_repair_stage, "LLMClient", fake_llm_client, raising=False)
    context = _context(drafting_client)
    context.options["api_key"] = "openrouter-key"

    asyncio.run(quality_repair_stage.run(context))

    assert len(drafting_client.calls) == 1
    assert constructed == []


def test_quality_repair_stage_prompt_tells_model_how_to_fix_text_overflow():
    client = FakeLLMClient(_repaired_storyboard())
    context = _context(client)
    context.quality_report = QualityReport(
        passed=False,
        issues=[
            QualityIssue(
                severity="error",
                code="DSL_PANEL_OVER_DIALOGUE_CHARS",
                message="panel p001 dialogue totals 130 chars; DSL allows at most 90",
                artifact_id="p001",
            ),
            QualityIssue(
                severity="error",
                code="DSL_PAGE_OVER_TEXT_WORDS",
                message="page 0 has 92 total words; DSL allows at most 60",
                artifact_id="pg001",
            ),
        ],
    )

    asyncio.run(quality_repair_stage.run(context))

    combined_prompt = (
        client.calls[0]["system_prompt"] + "\n" + client.calls[0]["user_message"]
    )
    assert "split beats into more panels" in combined_prompt
    assert "cut words" in combined_prompt
    assert "convert narration into silent panels, action, or SFX" in combined_prompt
    assert "renderer must never truncate" in combined_prompt


def test_quality_repair_stage_defaults_to_large_replacement_budget():
    client = FakeLLMClient(_repaired_storyboard())
    context = _context(client)

    asyncio.run(quality_repair_stage.run(context))

    assert client.calls[0]["max_tokens"] == 24000


def test_quality_repair_stage_prompt_honors_page_budget_override():
    client = FakeLLMClient(_repaired_storyboard())
    context = _context(client)
    context.options["max_storyboard_pages"] = 13
    context.options["target_storyboard_pages"] = 13

    asyncio.run(quality_repair_stage.run(context))

    assert "pages per slice: between 13 and 13 (target 13)" in client.calls[0]["user_message"]


def test_quality_repair_stage_noops_when_quality_passed():
    client = FakeLLMClient(_repaired_storyboard())
    context = _context(client)
    context.quality_report = QualityReport(passed=True)

    result = asyncio.run(quality_repair_stage.run(context))

    assert result is context
    assert client.calls == []
