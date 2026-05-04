"""Tests for the v2 LLM-backed page-composition stage (Phase C1).

The stage takes the slice's storyboard pages and asks an LLM to author
one ``PageComposition`` per page (gutter grid + page-turn anchor +
emphasis overrides). We test:

* a valid LLM payload flows through and lands on the context
* invalid panel ids in panel_order are coerced back to defaults
* a totally invalid payload (validator rejects it) leaves an empty
  composition row instead of crashing
* missing storyboard short-circuits without an LLM call
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import (
    ContinuityLedger,
    PanelPurpose,
    ScriptLine,
    ShotType,
    SourceRange,
    SourceSlice,
    SourceSliceMode,
    StoryboardPage,
    StoryboardPanel,
)
from app.manga_pipeline import PipelineContext
from app.manga_pipeline.stages import page_composition_stage


# ---------------------------------------------------------------------------
# Fakes.
# ---------------------------------------------------------------------------


class _FakeLLMClient:
    provider = "fake"
    model = "fake-composer"

    def __init__(self, parsed: dict[str, Any] | list[dict[str, Any]]) -> None:
        # Tests can hand in either a single canned reply (used for every
        # call) or a queue of replies consumed in order.
        self._queue: list[dict[str, Any]] = (
            list(parsed) if isinstance(parsed, list) else [parsed]
        )
        self.calls: list[dict[str, Any]] = []

    async def chat(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        idx = min(len(self.calls) - 1, len(self._queue) - 1)
        return {
            "content": "{}",
            "parsed": self._queue[idx],
            "input_tokens": 100,
            "output_tokens": 50,
            "estimated_cost_usd": 0.0001,
        }


def _panel(
    panel_id: str,
    *,
    purpose: PanelPurpose = PanelPurpose.SETUP,
    has_dialogue: bool = False,
) -> StoryboardPanel:
    return StoryboardPanel(
        panel_id=panel_id,
        scene_id="s001",
        purpose=purpose,
        shot_type=ShotType.MEDIUM,
        composition="Kai centred, archive doors behind.",
        action="Kai inspects a door.",
        narration="" if has_dialogue else "Kai pauses.",
        character_ids=["kai"],
        dialogue=(
            [ScriptLine(speaker_id="kai", text="Hmm.")] if has_dialogue else []
        ),
    )


def _context(
    *,
    pages: list[StoryboardPage] | None = None,
    llm_client: _FakeLLMClient | None = None,
) -> PipelineContext:
    if pages is None:
        pages = [
            StoryboardPage(
                page_id="pg001",
                page_index=0,
                page_turn_hook="Door grows larger.",
                panels=[
                    _panel("p001"),
                    _panel("p002", has_dialogue=True),
                    _panel("p003", purpose=PanelPurpose.REVEAL),
                ],
            ),
            StoryboardPage(
                page_id="pg002",
                page_index=1,
                page_turn_hook="Kai grips the key.",
                panels=[
                    _panel("p004"),
                    _panel("p005", purpose=PanelPurpose.TO_BE_CONTINUED),
                ],
            ),
        ]
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
    context.storyboard_pages = pages
    return context


# ---------------------------------------------------------------------------
# Happy path.
# ---------------------------------------------------------------------------


def _valid_composition() -> dict[str, Any]:
    return {
        "pages": [
            {
                "page_index": 0,
                "gutter_grid": [
                    {"cell_widths_pct": [60, 40]},
                    {"cell_widths_pct": [100]},
                ],
                # row-major, RTL within row
                "panel_order": ["p002", "p001", "p003"],
                "page_turn_panel_id": "p003",
                "panel_emphasis_overrides": {"p003": "high"},
                "composition_notes": "Splash on the reveal.",
            },
            {
                "page_index": 1,
                "gutter_grid": [{"cell_widths_pct": [50, 50]}],
                "panel_order": ["p005", "p004"],
                "page_turn_panel_id": "p005",
                "panel_emphasis_overrides": {},
                "composition_notes": "Two-beat page; cliffhanger anchors the turn.",
            },
        ]
    }


def test_valid_composition_lands_on_context():
    client = _FakeLLMClient(_valid_composition())
    context = asyncio.run(page_composition_stage.run(_context(llm_client=client)))

    assert context.slice_composition is not None
    assert len(context.slice_composition.pages) == 2

    first = context.slice_composition.pages[0]
    assert first.page_index == 0
    assert first.page_turn_panel_id == "p003"
    assert first.panel_emphasis_overrides == {"p003": "high"}
    assert [list(row.cell_widths_pct) for row in first.gutter_grid] == [
        [60, 40],
        [100],
    ]
    assert first.panel_order == ["p002", "p001", "p003"]

    # Exactly one LLM call for the whole slice (cost discipline).
    assert len(client.calls) == 1


def test_panel_order_with_unknown_id_is_coerced_to_default():
    payload = _valid_composition()
    # Mangle page 0: panel_order references a panel that does not exist
    # on this storyboard page. The stage should drop the LLM's
    # composition for that page (replace with default empty) but keep
    # page 1.
    payload["pages"][0]["panel_order"] = ["p001", "p002", "ghost_panel"]
    payload["pages"][0]["gutter_grid"] = [{"cell_widths_pct": [40, 30, 30]}]
    client = _FakeLLMClient(payload)

    context = asyncio.run(page_composition_stage.run(_context(llm_client=client)))

    page0 = context.slice_composition.pages[0]
    assert page0.is_default is True
    assert "did not match storyboard" in page0.composition_notes

    # Page 1 is untouched.
    page1 = context.slice_composition.pages[1]
    assert page1.is_default is False
    assert page1.page_turn_panel_id == "p005"


def test_wrong_page_turn_id_is_cleared_but_composition_kept():
    payload = _valid_composition()
    payload["pages"][0]["page_turn_panel_id"] = "ghost_panel"
    client = _FakeLLMClient(payload)

    context = asyncio.run(page_composition_stage.run(_context(llm_client=client)))

    page0 = context.slice_composition.pages[0]
    # Composition still authored \u2014 we kept the grid + order \u2014 only the
    # bad anchor was cleared.
    assert page0.is_default is False
    assert page0.page_turn_panel_id == ""
    assert page0.panel_order == ["p002", "p001", "p003"]


def test_missing_page_in_llm_output_is_backfilled_with_default():
    payload = _valid_composition()
    del payload["pages"][1]  # LLM forgot page 1
    client = _FakeLLMClient(payload)

    context = asyncio.run(page_composition_stage.run(_context(llm_client=client)))

    indices = sorted(c.page_index for c in context.slice_composition.pages)
    assert indices == [0, 1]
    page1 = context.slice_composition.composition_for(1)
    assert page1.is_default is True
    assert "missing from LLM output" in page1.composition_notes


def test_invalid_payload_falls_back_to_empty_composition():
    # Cell widths summing to 90% (not 100) trip the validator on every
    # retry; the structured-call helper raises and we catch it.
    bad = {
        "pages": [
            {
                "page_index": 0,
                "gutter_grid": [{"cell_widths_pct": [50, 40]}],
                "panel_order": ["p001", "p002"],
            }
        ]
    }
    client = _FakeLLMClient(bad)
    context = asyncio.run(page_composition_stage.run(_context(llm_client=client)))

    assert context.slice_composition is not None
    # We get one default-composition row per storyboard page.
    assert len(context.slice_composition.pages) == 2
    assert all(comp.is_default for comp in context.slice_composition.pages)


def test_no_storyboard_pages_short_circuits_without_llm_call():
    client = _FakeLLMClient(_valid_composition())
    context = _context(llm_client=client)
    context.storyboard_pages = []

    result = asyncio.run(page_composition_stage.run(context))

    assert result.slice_composition is not None
    assert result.slice_composition.pages == []
    assert client.calls == []
