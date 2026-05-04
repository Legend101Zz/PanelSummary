"""Concrete vision client that adapts ``LLMClient`` for image inputs.

Wraps an existing ``AsyncOpenAI``-compatible client so we reuse the
auth, retry, and cost-accounting wiring of ``LLMClient`` instead of
re-implementing it. This is also why ``VisionLLMClient`` accepts an
already-built ``LLMClient`` rather than another set of api_key /
provider knobs \u2014 fewer ways to mis-configure the same backend.

Why a separate class instead of a method on ``LLMClient``?
* Vision-capable models are a *subset* of text models. A single class
  pretending both work for every model would be a lie that fails at
  request time, far from configuration time. Two classes keeps the
  promise honest.
* Different unit tests want to fake either surface independently.
* Vision pricing is per-image (not just per-token) and the cost model
  belongs HERE, not on the text client.

NOTE on cost: per-image pricing varies wildly by provider/model. The
estimate added per image (``IMAGE_TOKEN_COST_ESTIMATE``) is a defensive
upper bound for the dashboard, not a precise figure. Real cost reconciles
against provider invoices, not this estimate.
"""

from __future__ import annotations

import base64
import logging
import time
from pathlib import Path
from typing import Any

from app.llm_client import LLMClient
from app.manga_pipeline.vision_contracts import VisionImage


logger = logging.getLogger(__name__)


# Conservative upper bound: most vision providers charge the equivalent of
# 800\u20131500 input tokens for a small thumbnail. We over-estimate so the cost
# dashboard never *under-counts* actual spend; reconciliation against
# provider invoices is the source of truth.
IMAGE_TOKEN_COST_ESTIMATE = 1500


class VisionLLMClient:
    """A vision-capable adapter sharing the underlying chat completions client.

    Use this exactly the way you would use ``LLMClient.chat`` \u2014 same return
    shape \u2014 but with images attached. The protocol it implements lives in
    ``manga_pipeline/vision_contracts.py`` so test fakes do not need this
    module at all.
    """

    def __init__(self, llm_client: LLMClient) -> None:
        # We hold the LLM client by composition rather than inheritance so
        # the vision-specific cost estimate can NOT contaminate the text
        # client's accounting.
        self._llm = llm_client

    # ---- protocol surface ----------------------------------------------

    @property
    def model(self) -> str:
        return self._llm.model

    @property
    def provider(self) -> str:
        return self._llm.provider

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
        """Send ``images`` + question; return ``{"content","parsed",...}``.

        Mirrors ``LLMClient.chat`` so structured-validation code paths can
        treat both clients interchangeably (see ``run_structured_llm_stage``).
        """
        if not images:
            raise ValueError(
                "analyze_image requires at least one image; for text-only "
                "calls, use LLMClient.chat directly"
            )

        # Build the multimodal user content: prepend each image as a part.
        # Putting images BEFORE the text prompt is the convention every
        # provider documents \u2014 the model "looks" first, then reads the
        # question.
        content_parts: list[dict[str, Any]] = []
        for image in images:
            data_url = self._encode_image_as_data_url(image.path)
            content_parts.append(
                {
                    "type": "image_url",
                    "image_url": {"url": data_url},
                }
            )
        content_parts.append({"type": "text", "text": user_message})

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": content_parts},
        ]

        kwargs: dict[str, Any] = {
            "model": self._llm.model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if json_mode and self._llm.provider == "openai":
            kwargs["response_format"] = {"type": "json_object"}

        text_input_tokens = self._llm.count_tokens(system_prompt + user_message)
        # Defensive over-count for the dashboard \u2014 see module docstring.
        image_input_tokens = IMAGE_TOKEN_COST_ESTIMATE * len(images)
        estimated_input_tokens = text_input_tokens + image_input_tokens

        logger.info(
            "[VISION] \u2192 %s | %d image(s) | ~%d est input tokens",
            self._llm.model,
            len(images),
            estimated_input_tokens,
        )
        start = time.time()

        response = await self._llm.client.chat.completions.create(**kwargs)

        elapsed = time.time() - start
        content = response.choices[0].message.content or ""
        # Some providers do not populate ``usage`` on multimodal calls; fall
        # back to the conservative estimate so cost is never zero.
        usage = response.usage
        actual_input_tokens = usage.prompt_tokens if usage else estimated_input_tokens
        output_tokens = usage.completion_tokens if usage else self._llm.count_tokens(content)

        logger.info(
            "[VISION] \u2190 %s | %d out tokens | %.1fs",
            self._llm.model,
            output_tokens,
            elapsed,
        )

        result: dict[str, Any] = {
            "content": content,
            "parsed": None,
            "input_tokens": actual_input_tokens,
            "output_tokens": output_tokens,
            "estimated_cost_usd": self._llm.estimate_cost_usd(
                actual_input_tokens, output_tokens
            ),
        }

        if json_mode:
            result["parsed"] = self._llm._parse_json_response(content)

        return result

    # ---- helpers --------------------------------------------------------

    @staticmethod
    def _encode_image_as_data_url(path: Path) -> str:
        """Encode a PNG/JPEG image on disk as a data: URL.

        Provider compatibility:
        * OpenAI / OpenRouter Gemini / OpenRouter Claude all accept
          ``data:image/<mime>;base64,<payload>`` in the ``image_url.url``
          field. This is the lowest-common-denominator and avoids us
          managing a public-readable image host.
        * For very large images (multi-MB), the right answer is to push to
          object storage and pass a signed URL. Our reference sheets are
          ~1 MB so the data-URL path is fine for v1.
        """
        path = Path(path)
        if not path.is_file():
            raise FileNotFoundError(
                f"vision client cannot read image at {path}: file does not exist"
            )
        mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
        with path.open("rb") as fh:
            payload = base64.b64encode(fh.read()).decode("ascii")
        return f"data:{mime};base64,{payload}"
