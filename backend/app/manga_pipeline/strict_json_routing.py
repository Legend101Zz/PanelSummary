"""LLM routing helpers for strict JSON stages.

Geometry and repair stages fail badly when fast drafting models return
truncated or loose JSON. These helpers keep prose drafting on the configured
client while routing strict contract work to an OpenRouter quality model.
"""

from __future__ import annotations

from typing import Callable

from app.config import get_settings
from app.llm_client import LLMClient, OPENROUTER_MODELS
from app.manga_pipeline.context import PipelineContext


def openrouter_api_key_for(context: PipelineContext) -> str:
    for key in ("openrouter_api_key", "api_key", "image_api_key"):
        value = str(context.options.get(key) or "").strip()
        if value:
            return value

    client = context.llm_client
    if client is not None and getattr(client, "provider", "").lower() == "openrouter":
        value = str(getattr(client, "api_key", "") or "").strip()
        if value:
            return value

    return get_settings().openrouter_api_key.strip()


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
        model = str(context.options.get(model_option_key) or OPENROUTER_MODELS["quality"])
        current_model = str(getattr(context.llm_client, "model", "") or "")
        if current_provider == "openrouter" and current_model == model:
            client = context.llm_client
        else:
            client = client_factory(
                api_key=openrouter_api_key_for(context),
                provider="openrouter",
                model=model,
            )

    timeout = float(context.options.get(timeout_option_key, 300))
    if hasattr(client, "request_timeout_seconds"):
        client.request_timeout_seconds = timeout
    return client
