"""M3 vision QA adapter for the page-art stage (Session 5; issues #7/#12).

Vision is M3 ALWAYS (issue #3 / ModelPolicy locked purpose — M3 is the only
MiniMax vision model). This module adapts the v1 ``VisionLLMClient`` to the
page-art stage's ``vision_qa`` seam and fails loud if the composed client
would run any other model. The stage persists a ``provider_receipt`` for
every call this adapter makes, including failures.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.services.errors import ArtifactValidationError
from app.services.model_policy import resolve_model_policy


def build_vision_qa(llm_client: Any | None = None):
    """Compose the vision_qa callable the page-art stage consumes.

    Imports the v1 LLM stack lazily so pure-mechanics tests never touch it.
    """
    from app.llm_client import LLMClient
    from app.manga_pipeline.vision_contracts import VisionImage
    from app.vision_client import VisionLLMClient

    policy = resolve_model_policy("manga_vision_qa")
    client = VisionLLMClient(llm_client or LLMClient(api_key="", model=policy.model))
    if client.model != policy.model:
        raise ArtifactValidationError(
            f"Vision QA is locked to {policy.model} (mode {policy.mode}); "
            f"composed client runs {client.model}"
        )

    async def vision_qa(
        *,
        image_path: Path,
        briefs: str,
        expected_panel_count: int,
        system_prompt: str,
    ) -> dict[str, Any]:
        result = await client.analyze_image(
            system_prompt=system_prompt,
            user_message=(
                f"The page was authored with exactly {expected_panel_count} "
                "panels in this reading order:\n"
                f"{briefs}\n\n"
                "Inspect the attached generated page and answer with the JSON "
                "object only."
            ),
            images=[VisionImage(path=Path(image_path))],
            json_mode=True,
        )
        return {
            "parsed": result.get("parsed"),
            "usage": {
                "prompt_tokens": result.get("input_tokens"),
                "completion_tokens": result.get("output_tokens"),
            },
            "cost_usd": result.get("estimated_cost_usd"),
        }

    return vision_qa
