"""Tests for the MiniMax-lane vector scene direction stage."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import (
    ContinuityLedger,
    PanelPurpose,
    ShotType,
    SourceRange,
    SourceSlice,
    SourceSliceMode,
    StoryboardPage,
    StoryboardPanel,
)
from app.manga_pipeline import PipelineContext
from app.manga_pipeline.llm_contracts import LLMStageName
from app.manga_pipeline.stages import vector_scene_stage


class FakeLLMClient:
    provider = "fake"
    model = "fake-visual-director"

    def __init__(self, parsed: dict[str, Any]) -> None:
        self.parsed = parsed
        self.calls: list[dict[str, Any]] = []

    async def chat(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        return {
            "content": "{}",
            "parsed": self.parsed,
            "input_tokens": 111,
            "output_tokens": 222,
            "estimated_cost_usd": 0.003,
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
        options={"visual_direction_provider": "main"},
    )
    context.storyboard_pages = [
        StoryboardPage(
            page_id="pg1",
            page_index=0,
            panels=[
                StoryboardPanel(
                    panel_id="p1",
                    scene_id="s1",
                    purpose=PanelPurpose.REVEAL,
                    shot_type=ShotType.WIDE,
                    composition="wide interior with a low horizon and empty center",
                    action="Kai sees the room stretch.",
                )
            ],
        )
    ]
    return context


def _artifact() -> dict[str, Any]:
    return {
        "pages": [
            {
                "page_index": 0,
                "panels": [
                    {
                        "panel_id": "p1",
                        "vector_scene": {
                            "background": {"fill": "#fff8e7", "gradient_to": "#eadfca"},
                            "tone": {"pattern": "dots", "opacity": 0.2, "scale": 5},
                            "linework": [
                                {"kind": "horizon", "x1": 4, "y1": 66, "x2": 96, "y2": 62}
                            ],
                        },
                    }
                ],
            }
        ]
    }


def test_vector_scene_stage_authors_panel_vector_scene_with_llm():
    client = FakeLLMClient(_artifact())
    context = _context(client)

    result = asyncio.run(vector_scene_stage.run(context))

    panel = result.storyboard_pages[0].panels[0]
    assert panel.vector_scene is not None
    assert panel.vector_scene.tone.pattern == "dots"
    assert result.llm_traces[0].stage_name == LLMStageName.VISUAL_DIRECTION
    prompt = client.calls[0]["user_message"]
    assert "composition" in prompt
    assert "action" in prompt
    assert "shot_type" in prompt
    assert "purpose" in prompt
    assert "Every panel must get at least tone and line-work" in prompt


def test_vector_scene_stage_adds_deterministic_fallback_without_llm_client():
    context = _context(None)

    result = asyncio.run(vector_scene_stage.run(context))

    panel = result.storyboard_pages[0].panels[0]
    assert panel.vector_scene is not None
    assert panel.vector_scene.tone is not None
    assert panel.vector_scene.linework
