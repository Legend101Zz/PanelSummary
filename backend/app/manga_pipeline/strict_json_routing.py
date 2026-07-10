"""MiniMax routing helpers for strict JSON stages."""

from __future__ import annotations

from typing import Callable

from app.config import get_settings
from app.llm_client import DEFAULT_TEXT_LLM_MODEL, LLMClient
from app.manga_pipeline.context import PipelineContext


def minimax_api_key_for(context: PipelineContext) -> str:
    return str(
        context.options.get("minimax_api_key")
        or get_settings().minimax_api_key
        or getattr(context.llm_client, "api_key", "")
        or ""
    ).strip()


def strict_json_client_for(
    context: PipelineContext,
    *,
    model_option_key: str,
    timeout_option_key: str,
    client_factory: Callable[..., object] = LLMClient,
):
    if context.llm_client is None:
        raise ValueError("strict JSON stage requires context.llm_client")

    current_provider = getattr(context.llm_client, "provider", "").lower()
    if current_provider in {"fake", "test"}:
        client = context.llm_client
    else:
        requested_model = str(context.options.get(model_option_key) or "").strip()
        current_model = str(getattr(context.llm_client, "model", "") or "").strip()
        # An existing MiniMax client is already within policy. Preserve it
        # unless the caller supplied an explicit MiniMax override; stale
        # OpenRouter model values must never trigger a reroute.
        model = (
            requested_model
            if requested_model.lower().startswith("minimax")
            else (
                current_model
                if current_provider == "minimax" and current_model.lower().startswith("minimax")
                else DEFAULT_TEXT_LLM_MODEL
            )
        )
        if current_provider == "minimax" and current_model == model:
            client = context.llm_client
        else:
            client = client_factory(
                api_key=minimax_api_key_for(context),
                provider="minimax",
                model=model,
            )

    timeout = float(context.options.get(timeout_option_key, 300))
    if hasattr(client, "request_timeout_seconds"):
        client.request_timeout_seconds = timeout
    return client
