"""Tests for defensive JSON extraction from LLM responses."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.llm_client import LLMClient


def _client() -> LLMClient:
    return object.__new__(LLMClient)


def test_parse_json_response_extracts_first_wrapped_object():
    content = 'Here is the object:\n{"world_summary": "x", "recurring_motifs": ["a"]}\nDone.'

    parsed = _client()._parse_json_response(content)

    assert parsed == {"world_summary": "x", "recurring_motifs": ["a"]}


def test_parse_json_response_does_not_return_nested_array_when_root_object_is_malformed():
    content = '{"world_summary": "x", "recurring_motifs": ["a", "b"], "visual_style": bad}'

    parsed = _client()._parse_json_response(content)

    assert parsed is None


class _FakeEncoder:
    def encode(self, text: str) -> list[str]:
        return text.split()


class _SlowCompletions:
    async def create(self, **kwargs):
        await asyncio.sleep(0.05)


class _FakeChat:
    completions = _SlowCompletions()


class _FakeOpenAIClient:
    chat = _FakeChat()


def test_chat_times_out_slow_provider_calls():
    client = object.__new__(LLMClient)
    client.provider = "openrouter"
    client.model = "slow/model"
    client.client = _FakeOpenAIClient()
    client.encoder = _FakeEncoder()
    client._supports_cache_control = False
    client.request_timeout_seconds = 0.01
    client.slow_warning_seconds = 999.0

    with pytest.raises(TimeoutError, match="timed out"):
        asyncio.run(client.chat("system", "user"))
