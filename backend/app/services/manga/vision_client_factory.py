"""Factory for building a default vision client from project options.

Centralised so every caller (book understanding, panel critic, future
mouth-centroid detector) builds the same shape of client. Without this,
each caller picks its own model name and the cost dashboard becomes a
mess.

Defaults:
* OpenRouter \u2192 ``google/gemini-2.0-flash-001`` (cheap, vision-capable,
  generous rate limits, identical chat completions API).
* OpenAI    \u2192 ``gpt-4o-mini`` (vision-capable, cheap).

Override via ``project_options.vision_model``.
"""

from __future__ import annotations

from typing import Any

from app.llm_client import LLMClient
from app.vision_client import VisionLLMClient


# Keep these in one place so changing the cheap default later is a one-line edit.
DEFAULT_OPENROUTER_VISION_MODEL = "google/gemini-2.0-flash-001"
DEFAULT_OPENAI_VISION_MODEL = "gpt-4o-mini"


def build_default_vision_client(
    *,
    api_key: str,
    project_options: dict[str, Any] | None = None,
) -> VisionLLMClient:
    """Construct a ``VisionLLMClient`` ready for sprite-quality / panel-critic use.

    Parameters
    ----------
    api_key
        The text-LLM API key for the project. We reuse it for vision
        because the OpenRouter / OpenAI keys cover both surfaces.
    project_options
        Optional overrides; ``vision_model`` and ``llm_provider`` are
        the only fields read.
    """
    opts = project_options or {}
    provider = str(opts.get("llm_provider", "openrouter"))
    explicit_model = opts.get("vision_model")
    model = (
        str(explicit_model)
        if explicit_model
        else (
            DEFAULT_OPENROUTER_VISION_MODEL
            if provider == "openrouter"
            else DEFAULT_OPENAI_VISION_MODEL
        )
    )
    underlying = LLMClient(api_key=api_key, provider=provider, model=model)
    return VisionLLMClient(underlying)
