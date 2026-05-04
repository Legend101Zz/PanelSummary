"""Book-level fact registry stage.

Authored ONCE per project. Produces the canonical list of source facts that
the manga adaptation must preserve across all slices. Per-slice fact stages
later filter this registry by overlap rather than re-extracting from raw text.

Why a single global pass:
- Importance scoring is meaningful only with the whole book in view. A
  per-slice extractor cannot tell whether "the bridge analogy" is a passing
  remark in chapter 2 or the central metaphor of the entire book.
- Fact identity stays stable across slice generations. Without a shared
  registry, the same idea would receive different fact IDs in different
  slices, and continuity logic (``known_fact_ids``) would silently lie.
"""

from __future__ import annotations

import json

from app.domain.manga import SourceFactExtraction
from app.manga_pipeline.book_context import BookUnderstandingContext
from app.manga_pipeline.llm_contracts import (
    LLMStageName,
    StructuredLLMRequest,
    build_json_contract_prompt,
    run_structured_llm_stage,
)

# Synthetic slice ID used to satisfy ``SourceFactExtraction``'s slice_id
# coupling. The artifact validator requires every fact to reference the
# extraction's slice_id; we use this constant for the global pass and the
# per-slice fact stage filters by ``source_refs`` page overlap, not by ID.
GLOBAL_SLICE_ID = "book_global"

# Caps mirror the synopsis stage so the registry sees the same prefix of the
# book the synopsis saw. Consistent inputs across the two stages prevents
# fact IDs from referring to evidence the synopsis never knew about.
MAX_CHAPTER_CHARACTERS = 4000
MAX_TOTAL_CHARACTERS = 120_000


SYSTEM_PROMPT = """You are a senior research editor extracting source-grounded
facts from an entire nonfiction document for later manga adaptation.

For each fact you extract, you MUST:
- write text that stands alone (no "as mentioned earlier" pronouns),
- assign a unique fact_id ("f001", "f002", …),
- set source_refs to the page range where it lives,
- mark importance honestly:
    THESIS    = the central claim of the document
    CORE      = directly supports the thesis
    IMPORTANT = needed for downstream beats
    USEFUL    = colorful but not essential
    SUPPORTING= flavor and texture only
- tag concepts (3 tags max) so later stages can group facts.

You return ONE JSON object that matches the provided schema. Every fact must
declare source_slice_id = "book_global" (this is the global registry pass).
Do not invent facts. Do not summarize chapters; extract atomic claims.
"""


def _format_chapter_for_prompt(chapter: dict[str, object]) -> str:
    title = str(chapter.get("title") or chapter.get("chapter_title") or "Untitled chapter")
    index = chapter.get("index", chapter.get("chapter_index", "?"))
    page_start = chapter.get("page_start", "?")
    page_end = chapter.get("page_end", "?")
    body = str(chapter.get("content") or chapter.get("text") or "").strip()
    if len(body) > MAX_CHAPTER_CHARACTERS:
        body = body[:MAX_CHAPTER_CHARACTERS] + "…"
    return f"CHAPTER {index}: {title} (pages {page_start}-{page_end})\n{body}".strip()


def _compose_book_text(canonical_chapters: list[dict[str, object]]) -> str:
    chunks: list[str] = []
    used = 0
    for chapter in canonical_chapters:
        chunk = _format_chapter_for_prompt(chapter)
        if not chunk:
            continue
        if used + len(chunk) > MAX_TOTAL_CHARACTERS:
            break
        chunks.append(chunk)
        used += len(chunk)
    return "\n\n---\n\n".join(chunks)


def _build_user_message(context: BookUnderstandingContext) -> str:
    book_text = _compose_book_text(context.canonical_chapters)
    if not book_text:
        raise ValueError(
            "book fact registry stage requires non-empty canonical_chapters"
        )
    target_count = max(8, min(60, len(context.canonical_chapters) * 4))
    payload = {
        "book_id": context.book_id,
        "book_title": context.book_title,
        "total_pages": context.total_pages,
        "chapter_count": len(context.canonical_chapters),
        "synopsis": context.synopsis.model_dump(mode="json") if context.synopsis else None,
        "target_fact_count": target_count,
        "global_slice_id": GLOBAL_SLICE_ID,
    }
    return (
        "Extract the canonical fact registry for this book. Aim for roughly "
        f"{target_count} facts, weighted toward THESIS/CORE/IMPORTANT.\n\n"
        f"INPUT_METADATA:\n{json.dumps(payload, ensure_ascii=False)}\n\n"
        f"SOURCE_TEXT:\n{book_text}\n\n"
        f"{build_json_contract_prompt(SourceFactExtraction)}"
    )


async def run(context: BookUnderstandingContext) -> BookUnderstandingContext:
    """Generate the canonical book-wide fact registry.

    The synopsis is included as context so importance ranking aligns with the
    book's central thesis. We require it to be present so a misordered
    pipeline (registry-before-synopsis) fails loudly instead of producing a
    thesis-blind registry.
    """
    if context.llm_client is None:
        raise ValueError("book fact registry stage requires context.llm_client")
    if not context.canonical_chapters:
        raise ValueError(
            "book fact registry stage requires canonical_chapters; "
            "did you parse the PDF?"
        )
    if context.synopsis is None:
        raise ValueError(
            "book fact registry stage requires a populated synopsis; "
            "run whole_book_synopsis_stage first"
        )

    request = StructuredLLMRequest(
        stage_name=LLMStageName.BOOK_FACT_REGISTRY,
        system_prompt=SYSTEM_PROMPT,
        user_message=_build_user_message(context),
        max_tokens=int(context.options.get("fact_registry_max_tokens", 8000)),
        temperature=float(context.options.get("fact_registry_temperature", 0.4)),
        max_validation_attempts=int(context.options.get("llm_validation_attempts", 3)),
    )
    result = await run_structured_llm_stage(
        client=context.llm_client,
        request=request,
        output_type=SourceFactExtraction,
    )
    if result.artifact.slice_id != GLOBAL_SLICE_ID:
        # Defensive: the schema lets the model invent a slice_id but the
        # downstream filter assumes the global tag. We surface this loudly.
        raise ValueError(
            f"book fact registry slice_id must be {GLOBAL_SLICE_ID!r}; "
            f"got {result.artifact.slice_id!r}"
        )
    context.fact_registry = list(result.artifact.facts)
    context.record_llm_trace(result.trace)
    return context
