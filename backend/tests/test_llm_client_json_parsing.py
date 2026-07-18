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


def test_minimax_provider_uses_env_key_and_openai_compatible_base_url(monkeypatch):
    monkeypatch.setenv("MINIMAX_API_KEY", "env-minimax-key")

    client = LLMClient(api_key="ignored-user-key", provider="minimax")

    assert client.provider == "minimax"
    assert client.api_key == "env-minimax-key"
    assert str(client.client.base_url) == "https://api.minimax.io/v1/"
    assert client.model == "MiniMax-M3"


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


class _CapturingCompletions:
    def __init__(self):
        self.kwargs = None

    async def create(self, **kwargs):
        self.kwargs = kwargs
        message = type("Message", (), {"content": '{"ok": true}'})()
        choice = type("Choice", (), {"message": message})()
        return type("Response", (), {"choices": [choice], "usage": None})()


def test_minimax_m3_disables_thinking_and_splits_reasoning_for_json():
    client = object.__new__(LLMClient)
    client.provider = "minimax"
    client.model = "MiniMax-M3"
    completions = _CapturingCompletions()
    client.client = type(
        "Client",
        (),
        {"chat": type("Chat", (), {"completions": completions})()},
    )()
    client.encoder = _FakeEncoder()
    client._supports_cache_control = False
    client.request_timeout_seconds = 1.0
    client.slow_warning_seconds = 999.0

    result = asyncio.run(client.chat("system", "user", json_mode=True))

    assert result["parsed"] == {"ok": True}
    assert completions.kwargs["max_completion_tokens"] == 4000
    assert completions.kwargs["extra_body"] == {
        "reasoning_split": True,
        "thinking": {"type": "disabled"},
    }
    assert "response_format" not in completions.kwargs


def test_non_minimax_text_provider_is_hard_routed_to_minimax(monkeypatch):
    monkeypatch.setenv("MINIMAX_API_KEY", "env-minimax-key")

    client = LLMClient(
        api_key="openrouter-key",
        provider="openrouter",
        model="anthropic/claude-sonnet-5",
    )

    assert client.provider == "minimax"
    assert client.api_key == "env-minimax-key"
    assert client.model == "MiniMax-M3"
    assert str(client.client.base_url) == "https://api.minimax.io/v1/"


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
