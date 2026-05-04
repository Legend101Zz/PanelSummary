"""Arc outline stage.

Plans the global Ki-Sho-Ten-Ketsu structure across the whole book and assigns
each slice a role, a source page range, and the specific facts it must cover.

This replaces the naive "next 10 pages" slicer for downstream generation:
once an arc outline exists, the slice planner asks the outline for the next
unfinished entry rather than computing a window. That makes the manga
narrative shape deterministic and inspectable.
"""

from __future__ import annotations

import json

from app.domain.manga import ArcOutline
from app.manga_pipeline.book_context import BookUnderstandingContext
from app.manga_pipeline.llm_contracts import (
    LLMStageName,
    StructuredLLMRequest,
    build_json_contract_prompt,
    run_structured_llm_stage,
)


SYSTEM_PROMPT = """You are a senior manga arc planner. Given a complete book
synopsis, fact registry, character bible, and adaptation plan, you produce a
single ARC OUTLINE that splits the book into a small number of slices.

Each entry in the arc outline is a contract for a single manga generation
slice. The downstream pipeline reads this outline and generates one slice per
entry, in order.

Discipline:
- Choose a target_slice_count between 4 and 12. Use the document's natural
  shape: chapter count, density, and how many "moves" the argument makes.
- Use the four Ki-Sho-Ten-Ketsu roles for the spine. KI for the opening,
  SHO for development (often more than one), TEN for the central twist or
  reveal, KETSU for the resolution. Use RECAP sparingly (only for very long
  books that need bridging).
- Map each entry to a CONCRETE source page range. Page ranges may overlap
  for RECAP slices but page_start must move forward across non-recap entries.
- Assign must_cover_fact_ids from the global fact registry. Each entry should
  carry the facts that make sense for its role. Cover roughly all THESIS/CORE
  facts across the outline.
- Write a short headline_beat for each entry. This is the manga moment a
  reader should remember from that slice.
- Write a closing_hook for each entry except the last. This is the cliff that
  pulls the reader into the next slice.

Return ONE JSON object that conforms to the provided schema.
"""


def _suggest_default_slice_count(total_pages: int, chapter_count: int) -> int:
    """Heuristic baseline so the model has a sensible starting point.

    Rule of thumb: roughly one slice per major chapter, with a 4–12 ceiling.
    Pages are a tie-breaker when chapters are missing.
    """
    by_chapters = max(4, min(12, chapter_count or 0))
    by_pages = max(4, min(12, total_pages // 25))
    if chapter_count <= 0:
        return by_pages
    return min(12, max(4, (by_chapters + by_pages) // 2))


def _build_user_message(context: BookUnderstandingContext) -> str:
    if context.synopsis is None:
        raise ValueError("arc outline stage requires a synopsis")
    if context.adaptation_plan is None:
        raise ValueError("arc outline stage requires an adaptation plan")
    if context.character_bible is None:
        raise ValueError("arc outline stage requires a character bible")
    if not context.fact_registry:
        raise ValueError("arc outline stage requires a fact registry")

    suggested = _suggest_default_slice_count(
        context.total_pages,
        len(context.canonical_chapters),
    )
    payload = {
        "book_id": context.book_id,
        "book_title": context.book_title,
        "total_pages": context.total_pages,
        "chapter_count": len(context.canonical_chapters),
        "synopsis": context.synopsis.model_dump(mode="json"),
        "adaptation_plan": context.adaptation_plan.model_dump(mode="json"),
        "character_bible": context.character_bible.model_dump(mode="json"),
        "fact_registry": [fact.model_dump(mode="json") for fact in context.fact_registry],
        "suggested_target_slice_count": suggested,
    }
    return (
        "Plan the global manga arc for this book. The downstream pipeline "
        "will generate one slice per entry, in order.\n\n"
        f"INPUT_JSON:\n{json.dumps(payload, ensure_ascii=False)}\n\n"
        f"{build_json_contract_prompt(ArcOutline)}"
    )


async def run(context: BookUnderstandingContext) -> BookUnderstandingContext:
    """Generate and validate the arc outline."""
    if context.llm_client is None:
        raise ValueError("arc outline stage requires context.llm_client")

    request = StructuredLLMRequest(
        stage_name=LLMStageName.ARC_OUTLINE,
        system_prompt=SYSTEM_PROMPT,
        user_message=_build_user_message(context),
        max_tokens=int(context.options.get("arc_outline_max_tokens", 6000)),
        temperature=float(context.options.get("arc_outline_temperature", 0.6)),
        max_validation_attempts=int(context.options.get("llm_validation_attempts", 3)),
    )
    result = await run_structured_llm_stage(
        client=context.llm_client,
        request=request,
        output_type=ArcOutline,
    )
    if result.artifact.book_id != context.book_id:
        # Defensive: the model copies metadata but it must reference our book.
        # We surface this loudly so an upstream prompt drift does not poison
        # the persisted outline silently.
        raise ValueError(
            f"arc outline book_id must match context.book_id "
            f"(got {result.artifact.book_id!r}, expected {context.book_id!r})"
        )
    context.arc_outline = result.artifact
    context.record_llm_trace(result.trace)
    return context
