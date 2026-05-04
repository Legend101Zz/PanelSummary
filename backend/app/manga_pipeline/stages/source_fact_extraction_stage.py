"""LLM-backed source fact extraction stage for manga v2."""

from __future__ import annotations

import json
from typing import Any

from app.domain.manga import SourceFact, SourceFactExtraction, merge_fact_registry
from app.manga_pipeline.context import PipelineContext
from app.manga_pipeline.llm_contracts import (
    LLMStageName,
    StructuredLLMRequest,
    build_json_contract_prompt,
    run_structured_llm_stage,
)

def _fact_overlaps_slice(fact: SourceFact, page_start: int | None, page_end: int | None) -> bool:
    """Return True when any of the fact's source ranges intersect the slice.

    Used by the registry-aware short-circuit. A fact with no page metadata is
    treated as book-wide and therefore eligible for every slice; otherwise we
    require a non-empty intersection between the fact's pages and the slice's
    pages.
    """
    if page_start is None or page_end is None:
        return True  # cannot constrain by pages — default to including the fact
    if not fact.source_refs:
        return True
    for ref in fact.source_refs:
        if ref.page_start is None or ref.page_end is None:
            return True
        if ref.page_end >= page_start and ref.page_start <= page_end:
            return True
    return False


def _short_circuit_with_registry(context: PipelineContext) -> bool:
    """Decide whether to skip the LLM call because the registry is already populated.

    The book-understanding phase produces a global fact registry. After it has
    run, per-slice fact extraction has nothing useful to add: it would either
    duplicate facts (wasting tokens) or invent slice-local facts that conflict
    with the global registry. Instead, we record which existing facts are
    relevant to this slice as ``new_fact_ids`` for continuity tracking.
    """
    if not context.fact_registry:
        return False
    page_start = context.source_slice.source_range.page_start
    page_end = context.source_slice.source_range.page_end
    seen_known = set(context.prior_continuity.known_fact_ids)
    new_for_slice: list[str] = []
    for fact in context.fact_registry:
        if not _fact_overlaps_slice(fact, page_start, page_end):
            continue
        if fact.fact_id in seen_known:
            continue
        new_for_slice.append(fact.fact_id)
    context.new_fact_ids = new_for_slice
    return True


SYSTEM_PROMPT = """You are a meticulous source-fact editor for a manga adaptation team.

Extract the facts that a reader must understand from the provided PDF slice.
Facts must be source-grounded, specific, and useful for adaptation. Do not write
manga scenes yet. Do not invent claims. Prefer concrete thesis claims, causal
relationships, definitions, data points, contradictions, and memorable examples.

Each fact must include:
- a stable fact_id like f001, f002, f003 within this extraction response
- the exact source_slice_id provided in the input
- concise fact text
- importance from 1 to 5
- source references when page/chapter data is available
- tags that help later story planning
"""


def _build_source_payload(context: PipelineContext) -> dict[str, Any]:
    source_text = context.options.get("source_text")
    payload = {
        "book_id": context.book_id,
        "project_id": context.project_id,
        "source_slice": context.source_slice.model_dump(mode="json"),
        "source_text": source_text,
        "canonical_chapters": context.canonical_chapters,
        "knowledge_doc": context.knowledge_doc,
        "existing_fact_ids": [fact.fact_id for fact in context.fact_registry],
    }
    if not source_text and not context.canonical_chapters and not context.knowledge_doc:
        raise ValueError("source fact extraction requires source_text, canonical_chapters, or knowledge_doc")
    return payload


def _build_user_message(context: PipelineContext) -> str:
    payload = _build_source_payload(context)
    return (
        "Extract source-grounded facts for this manga source slice. The output "
        "must use the exact source_slice.slice_id value for every fact.\n\n"
        f"INPUT_JSON:\n{json.dumps(payload, ensure_ascii=False)}\n\n"
        f"{build_json_contract_prompt(SourceFactExtraction)}"
    )


async def run(context: PipelineContext) -> PipelineContext:
    """Extract source facts with the configured LLM and merge them into context.

    Read-through: when the book-understanding phase already produced a global
    fact registry, we skip the per-slice LLM call and instead record which
    registry facts are first surfaced in this slice. This eliminates a per-
    slice LLM call that previously duplicated work and produced inconsistent
    fact IDs across slices.
    """
    if _short_circuit_with_registry(context):
        return context

    if context.llm_client is None:
        raise ValueError("source fact extraction requires context.llm_client")

    request = StructuredLLMRequest(
        stage_name=LLMStageName.SOURCE_FACT_EXTRACTION,
        system_prompt=SYSTEM_PROMPT,
        user_message=_build_user_message(context),
        max_tokens=int(context.options.get("source_fact_max_tokens", 7000)),
        temperature=float(context.options.get("source_fact_temperature", 0.25)),
        max_validation_attempts=int(context.options.get("llm_validation_attempts", 3)),
    )
    result = await run_structured_llm_stage(
        client=context.llm_client,
        request=request,
        output_type=SourceFactExtraction,
    )
    context.fact_registry, context.new_fact_ids = merge_fact_registry(
        context.fact_registry,
        result.artifact.facts,
        context.source_slice,
    )
    context.record_llm_trace(result.trace)
    return context
