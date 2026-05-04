"""LLM-backed source fact extraction stage for manga v2."""

from __future__ import annotations

import json
from typing import Any

from app.domain.manga import SourceFactExtraction, merge_fact_registry
from app.manga_pipeline.context import PipelineContext
from app.manga_pipeline.llm_contracts import (
    LLMStageName,
    StructuredLLMRequest,
    build_json_contract_prompt,
    run_structured_llm_stage,
)

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
    """Extract source facts with the configured LLM and merge them into context."""
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
