"""Vision LLM contract for image-aware quality gates.

This module is deliberately separate from ``llm_contracts.py`` because
vision calls have different cost dynamics, different provider support
(only Gemini/Claude/GPT-4o accept images), and different rate-limit
characteristics. Mixing them into the text protocol would force every
text-only fake to deal with image inputs.

The ``VisionModelClient`` protocol is the contract every vision call
in the codebase MUST go through. Concrete clients adapt the underlying
SDK call (OpenAI / OpenRouter `image_url` parts). Test fakes implement
the protocol directly so a unit test never has to touch a real model.

Why a single ``analyze_image`` method instead of one per use-case?
Because every vision use-case in the manga pipeline boils down to
"look at this image, answer this question as JSON". Sprite-quality,
panel-critique, mouth-centroid detection, palette extraction \u2014 all
the same call shape, different prompts. If a future use-case truly
needs a different shape (e.g. multi-image batch comparison) we add
a sibling method, we do not overload this one.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol


@dataclass(frozen=True)
class VisionImage:
    """One image input for a vision call.

    ``path`` is the canonical on-disk location; the client base64-encodes it
    when sending to the model. We intentionally do NOT pre-encode here so
    the trace/log layer can record the path (small) instead of the bytes
    (huge). Long-term, image bytes belong in object storage, not the LLM
    trace store.
    """

    path: Path
    label: str = ""  # human-readable hint; e.g. "reference_sheet_front"


@dataclass(frozen=True)
class VisionCallAttempt:
    """Observability record for one vision-model call attempt.

    Mirrors ``LLMCallAttempt`` so book-understanding traces can carry both
    text and vision invocations under one type system without a sum-type
    explosion. The vision-specific bits (image count, image labels) live
    in ``image_summary``.
    """

    attempt_index: int
    input_tokens: int
    output_tokens: int
    estimated_cost_usd: float
    content_preview: str
    image_summary: str = ""
    error: str = ""


@dataclass
class VisionInvocationTrace:
    """Trace for a vision-model invocation, persisted alongside text traces.

    The trace lives long enough to surface in the QA dashboard ("how much
    did sprite QA cost this run?"). Production callers MUST drop trace
    objects into a centralized sink instead of printing them, so we can
    aggregate by project / day / character.
    """

    stage_name: str
    provider: str
    model: str
    attempts: list[VisionCallAttempt] = field(default_factory=list)

    @property
    def total_cost_usd(self) -> float:
        return round(sum(a.estimated_cost_usd for a in self.attempts), 6)

    @property
    def total_input_tokens(self) -> int:
        return sum(a.input_tokens for a in self.attempts)

    @property
    def total_output_tokens(self) -> int:
        return sum(a.output_tokens for a in self.attempts)


class VisionModelClient(Protocol):
    """Minimal protocol every vision call goes through.

    Concrete implementations live in ``app.vision_client``. Test fakes
    implement this directly. We deliberately keep the surface small \u2014 if
    we need a richer shape later we add a sibling method, we do not bloat
    the contract every consumer must satisfy.
    """

    model: str
    provider: str

    async def analyze_image(
        self,
        *,
        system_prompt: str,
        user_message: str,
        images: list[VisionImage],
        max_tokens: int = 1500,
        temperature: float = 0.2,
        json_mode: bool = True,
    ) -> dict[str, Any]:
        """Send the image(s) + question; return ``{"content","parsed",...}``.

        Returns the same shape as ``LLMModelClient.chat`` so structured
        validation / cost accounting code paths can stay shared.
        """
