"""Tests for v2 structured LLM orchestration contracts."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.domain.manga import AdaptationPlan, ProtagonistContract
from app.manga_pipeline.llm_contracts import (
    LLMOutputValidationError,
    LLMStageName,
    StructuredLLMRequest,
    build_json_contract_prompt,
    run_structured_llm_stage,
)


class FakeLLMClient:
    """Deterministic model client for testing orchestration behavior."""

    provider = "fake"
    model = "fake-creative-model"

    def __init__(self, responses: list[dict[str, Any]]) -> None:
        self.responses = responses
        self.calls: list[dict[str, Any]] = []

    async def chat(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        if not self.responses:
            raise AssertionError("FakeLLMClient received too many calls")
        return self.responses.pop(0)


def _valid_plan_dict() -> dict[str, Any]:
    return {
        "title": "The Scale Labyrinth",
        "logline": "Kai turns a dense PDF into a visual quest for the central idea.",
        "central_thesis": "Good adaptation preserves source meaning through narrative structure.",
        "protagonist_contract": {
            "who": "Kai, a curious reader",
            "wants": "to understand the document without losing nuance",
            "why_cannot_have_it": "the ideas are scattered across many pages",
            "what_they_do": "maps facts into trials, allies, and reveals",
        },
        "important_fact_ids": ["f001"],
    }


def _response(parsed: Any, content: str = "{}") -> dict[str, Any]:
    return {
        "content": content,
        "parsed": parsed,
        "input_tokens": 100,
        "output_tokens": 50,
        "estimated_cost_usd": 0.001,
    }


def _request() -> StructuredLLMRequest:
    return StructuredLLMRequest(
        stage_name=LLMStageName.ADAPTATION_PLANNING,
        system_prompt="You are a manga adaptation planner.",
        user_message="Create a source-grounded adaptation plan.",
        max_tokens=2000,
        temperature=0.8,
    )


def test_structured_llm_stage_returns_validated_artifact_on_first_attempt():
    client = FakeLLMClient([_response(_valid_plan_dict())])

    result = asyncio.run(
        run_structured_llm_stage(
            client=client,
            request=_request(),
            output_type=AdaptationPlan,
        )
    )

    assert isinstance(result.artifact, AdaptationPlan)
    assert result.artifact.protagonist_contract.who.startswith("Kai")
    assert result.trace.total_cost_usd == 0.001
    assert len(client.calls) == 1


def test_structured_llm_stage_repairs_json_parse_failure_with_model_call():
    client = FakeLLMClient([
        _response(None, content="not json, tiny chaos goblin"),
        _response(_valid_plan_dict()),
    ])

    result = asyncio.run(
        run_structured_llm_stage(
            client=client,
            request=_request(),
            output_type=AdaptationPlan,
        )
    )

    assert result.artifact.title == "The Scale Labyrinth"
    assert len(client.calls) == 2
    assert "VALIDATION ISSUES" in client.calls[1]["user_message"]
    assert result.trace.attempts[0].issues[0].code == "json_parse_failed"


def test_structured_llm_stage_repairs_schema_failure_with_model_call():
    invalid = _valid_plan_dict()
    invalid["important_fact_ids"] = []
    client = FakeLLMClient([_response(invalid), _response(_valid_plan_dict())])

    result = asyncio.run(
        run_structured_llm_stage(
            client=client,
            request=_request(),
            output_type=AdaptationPlan,
        )
    )

    assert result.artifact.important_fact_ids == ["f001"]
    assert len(client.calls) == 2
    assert "adaptation plan needs important source facts" in client.calls[1]["user_message"]


def test_structured_llm_stage_fails_loudly_after_validation_attempts():
    invalid = _valid_plan_dict()
    invalid["protagonist_contract"] = ProtagonistContract(
        who="Kai",
        wants="read",
        why_cannot_have_it="dense",
        what_they_do="tries",
    ).model_dump()
    invalid["important_fact_ids"] = []
    client = FakeLLMClient([_response(invalid), _response(invalid), _response(invalid)])

    with pytest.raises(LLMOutputValidationError, match="adaptation_planning"):
        asyncio.run(
            run_structured_llm_stage(
                client=client,
                request=_request(),
                output_type=AdaptationPlan,
            )
        )

    assert len(client.calls) == 3


def test_json_contract_prompt_includes_schema_without_fallback_language():
    prompt = build_json_contract_prompt(AdaptationPlan)

    assert "JSON_SCHEMA" in prompt
    assert "important_fact_ids" in prompt
    assert "fallback" not in prompt.lower()
