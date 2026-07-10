"""Factory for building a default vision client from project options.

Centralised so every caller (book understanding, panel critic, future
mouth-centroid detector) builds the same shape of client. Without this,
each caller picks its own model name and the cost dashboard becomes a
mess.

All LLM calls, including visual review, use MiniMax under the project cost
policy. Image generation itself remains the only OpenRouter operation.
"""

from __future__ import annotations

from typing import Any

from app.llm_client import LLMClient
from app.vision_client import VisionLLMClient


# MiniMax's OpenAI-compatible API documents image/video content parts for M3,
# not the M2.x reasoning models. Keep visual review on the one supported model
# while text-only stages may explicitly choose another MiniMax model.
DEFAULT_MINIMAX_VISION_MODEL = "MiniMax-M3"


def build_default_vision_client(
    *,
    api_key: str,
    project_options: dict[str, Any] | None = None,
) -> VisionLLMClient:
    """Construct a ``VisionLLMClient`` ready for sprite-quality / panel-critic use.

    ``api_key`` is retained for call-site compatibility; ``LLMClient`` uses the
    server-owned ``MINIMAX_API_KEY``. M3 is intentionally fixed here because
    it is the documented MiniMax model with OpenAI-compatible image input.
    """
    underlying = LLMClient(
        api_key=api_key,
        provider="minimax",
        model=DEFAULT_MINIMAX_VISION_MODEL,
    )
    return VisionLLMClient(underlying)
