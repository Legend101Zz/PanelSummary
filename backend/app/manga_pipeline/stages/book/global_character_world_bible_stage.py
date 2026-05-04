"""Book-level character & world bible stage.

Runs ONCE per project. The resulting ``CharacterWorldBible`` is FROZEN — every
slice reads it as immutable input. Future bible augmentation (when a new
character appears in a later slice) will live in a separate stage that
APPENDS to this bible, never rewrites it.

Why this is a separate stage rather than a flag on the per-slice stage:
- The book bible has the entire fact registry and adaptation plan in scope,
  so it can design recurring characters that span the whole arc.
- Freezing the bible at this stage prevents per-slice drift: the persistence
  layer can refuse writes if ``bible_locked`` is true.
"""

from __future__ import annotations

import json

from app.domain.manga import CharacterWorldBible
from app.manga_pipeline.book_context import BookUnderstandingContext
from app.manga_pipeline.llm_contracts import (
    LLMStageName,
    StructuredLLMRequest,
    build_json_contract_prompt,
    run_structured_llm_stage,
)


SYSTEM_PROMPT = """You are the lead character designer and world bible editor
for a manga adaptation of an entire nonfiction book.

You receive the book synopsis, fact registry, and adaptation plan. You design
the reusable cast and world that will appear across every slice.

Discipline:
- Design 2 to 5 characters. Fewer is usually better.
- Each character must be visually unique by silhouette, hair/face, and outfit.
  An image model will later generate sprite sheets from your visual_lock,
  silhouette_notes, outfit_notes, and hair_or_face_notes — so be concrete.
- Each character should REPRESENT a concrete source-grounded role
  (e.g. "the protagonist who chases the central thesis", "the skeptic who
  voices the strongest counter-argument").
- Define speech_style succinctly so the script stage can write consistent
  dialogue.
- Pick recurring visual motifs that can show up across slices to build
  cohesion (a recurring object, a recurring color, a recurring setting type).

Return ONE JSON object that conforms to the schema. This bible will be
FROZEN: do not include placeholders or "TBD".
"""


def _build_user_message(context: BookUnderstandingContext) -> str:
    if context.synopsis is None:
        raise ValueError("global character/world bible requires a synopsis")
    if context.adaptation_plan is None:
        raise ValueError("global character/world bible requires an adaptation plan")
    if not context.fact_registry:
        raise ValueError("global character/world bible requires a fact registry")

    payload = {
        "book_id": context.book_id,
        "project_id": context.project_id,
        "book_title": context.book_title,
        "synopsis": context.synopsis.model_dump(mode="json"),
        "adaptation_plan": context.adaptation_plan.model_dump(mode="json"),
        "fact_registry": [fact.model_dump(mode="json") for fact in context.fact_registry],
        "options": context.options,
    }
    return (
        "Author the FROZEN character and world bible for this manga project.\n\n"
        f"INPUT_JSON:\n{json.dumps(payload, ensure_ascii=False)}\n\n"
        f"{build_json_contract_prompt(CharacterWorldBible)}"
    )


async def run(context: BookUnderstandingContext) -> BookUnderstandingContext:
    """Generate the project-wide, frozen character/world bible."""
    if context.llm_client is None:
        raise ValueError("global character/world bible stage requires context.llm_client")

    request = StructuredLLMRequest(
        stage_name=LLMStageName.CHARACTER_WORLD_BIBLE,
        system_prompt=SYSTEM_PROMPT,
        user_message=_build_user_message(context),
        max_tokens=int(context.options.get("global_bible_max_tokens", 8000)),
        temperature=float(context.options.get("global_bible_temperature", 0.8)),
        max_validation_attempts=int(context.options.get("llm_validation_attempts", 3)),
    )
    result = await run_structured_llm_stage(
        client=context.llm_client,
        request=request,
        output_type=CharacterWorldBible,
    )
    context.character_bible = result.artifact
    context.record_llm_trace(result.trace)
    return context
