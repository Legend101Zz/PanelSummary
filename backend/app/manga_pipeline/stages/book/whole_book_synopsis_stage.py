"""Whole-book synopsis stage.

Authored ONCE per project, before any slice is generated. The synopsis is the
stable anchor every later stage reads from. Without it, per-slice stages would
have to re-discover what the book is about every 10 pages, and the LLM has no
chance to keep the manga's protagonist contract consistent across slices.
"""

from __future__ import annotations

import json

from app.domain.manga import BookSynopsis
from app.manga_pipeline.book_context import BookUnderstandingContext
from app.manga_pipeline.llm_contracts import (
    LLMStageName,
    StructuredLLMRequest,
    build_json_contract_prompt,
    run_structured_llm_stage,
)

# Hard cap on chapter input size; LLMs degrade quickly past ~120k tokens. We
# truncate per-chapter to keep the structural signal (titles + first chunks of
# each chapter) intact rather than dropping whole chapters.
MAX_CHAPTER_CHARACTERS = 4000
MAX_TOTAL_CHARACTERS = 120_000


SYSTEM_PROMPT = """You are a senior nonfiction editor and manga adaptation lead.

Your job is to read the entire compressed source PDF and produce a single
grounded understanding artifact. This artifact is reused by EVERY downstream
manga generation stage. If you guess, every page of the manga inherits your
guess. So do not guess.

Discipline:
- Identify the central thesis the document actually argues for.
- Write a logline that captures the reading payoff in one sentence.
- Map the emotional arc from "what the reader feels at chapter 1" to "what they
  feel after the final chapter".
- Surface concrete evidence (numbers, examples, anecdotes) that the manga must
  preserve.
- Stay faithful to the document's voice. If it is academic, do not pretend it
  is a thriller.

You return ONE JSON object that conforms to the provided schema.
"""


def _format_chapter_for_prompt(chapter: dict[str, object]) -> str:
    """Compress one chapter into a chapter header + truncated body.

    Keeping the title + page range gives the model structural awareness
    (e.g. that chapter 7 is a conclusion). Truncating the body keeps the
    total input from blowing past the model context window even on long
    books while still surfacing the chapter's voice.
    """
    title = str(chapter.get("title") or chapter.get("chapter_title") or "Untitled chapter")
    index = chapter.get("index", chapter.get("chapter_index", "?"))
    page_start = chapter.get("page_start", "?")
    page_end = chapter.get("page_end", "?")
    body = str(chapter.get("content") or chapter.get("text") or "").strip()
    if len(body) > MAX_CHAPTER_CHARACTERS:
        body = body[:MAX_CHAPTER_CHARACTERS] + "…"
    header = f"CHAPTER {index}: {title} (pages {page_start}-{page_end})"
    return f"{header}\n{body}".strip()


def _compose_book_text(canonical_chapters: list[dict[str, object]]) -> str:
    """Build the full book text payload, capped at ``MAX_TOTAL_CHARACTERS``.

    We compose chapter-by-chapter rather than truncating the concatenated text,
    so chapter 1 always survives. The tail of long books gets cut first; that
    is acceptable because the synopsis is more sensitive to the opening setup
    than to late expansions.
    """
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
            "whole-book synopsis stage requires non-empty canonical_chapters; "
            "the book parser must produce chapter content before generation"
        )
    payload = {
        "book_id": context.book_id,
        "project_id": context.project_id,
        "book_title": context.book_title,
        "total_pages": context.total_pages,
        "chapter_count": len(context.canonical_chapters),
        "options": context.options,
    }
    return (
        "Read the following compressed source PDF and produce its synopsis.\n\n"
        f"INPUT_METADATA:\n{json.dumps(payload, ensure_ascii=False)}\n\n"
        f"SOURCE_TEXT:\n{book_text}\n\n"
        f"{build_json_contract_prompt(BookSynopsis)}"
    )


async def run(context: BookUnderstandingContext) -> BookUnderstandingContext:
    """Generate the canonical book synopsis.

    Validates upstream context loudly so a misconfigured caller fails before we
    burn LLM tokens. The structured LLM helper handles retry-with-repair if the
    first generation does not validate.
    """
    if context.llm_client is None:
        raise ValueError("whole-book synopsis stage requires context.llm_client")
    if not context.canonical_chapters:
        raise ValueError(
            "whole-book synopsis stage requires canonical_chapters; "
            "the book is empty or has not been parsed"
        )

    request = StructuredLLMRequest(
        stage_name=LLMStageName.WHOLE_BOOK_SYNOPSIS,
        system_prompt=SYSTEM_PROMPT,
        user_message=_build_user_message(context),
        max_tokens=int(context.options.get("synopsis_max_tokens", 4000)),
        temperature=float(context.options.get("synopsis_temperature", 0.3)),
        max_validation_attempts=int(context.options.get("llm_validation_attempts", 3)),
    )
    result = await run_structured_llm_stage(
        client=context.llm_client,
        request=request,
        output_type=BookSynopsis,
    )
    context.synopsis = result.artifact
    context.record_llm_trace(result.trace)
    return context
