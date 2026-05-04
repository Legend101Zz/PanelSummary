"""Generation orchestration helpers for manga v2 projects.

This module is the boundary between persistence/API concerns and the typed manga
pipeline. Creative stages stay model-backed and pure-ish; this service assembles
source text, runs the ordered stages, and persists the resulting artifacts.
"""

from __future__ import annotations

from typing import Any, Protocol

from app.domain.manga import ContinuityLedger, SliceRole, SourceFact, SourceSlice, update_ledger_after_slice
from app.manga_models import MangaPageDoc, MangaProjectDoc, MangaSliceDoc
from app.manga_pipeline import PipelineContext, run_pipeline_context
from app.manga_pipeline.llm_contracts import LLMInvocationTrace, LLMModelClient
from app.manga_pipeline.stages import (
    adaptation_plan_stage,
    beat_sheet_stage,
    character_world_bible_stage,
    manga_script_stage,
    quality_gate_stage,
    source_fact_extraction_stage,
    storyboard_stage,
    storyboard_to_v4_stage,
)
from app.models import Book, BookChapter, BookSection
from app.services.manga.project_service import load_project_ledger
from app.services.manga.source_slice_service import choose_next_page_slice


class ChapterWithSections(Protocol):
    index: int
    title: str
    page_start: int
    page_end: int
    sections: list[BookSection]


def chapter_overlaps_slice(chapter: ChapterWithSections, source_slice: SourceSlice) -> bool:
    """Return true when a book chapter overlaps the source page slice."""
    page_start = source_slice.source_range.page_start
    page_end = source_slice.source_range.page_end
    if page_start is None or page_end is None:
        return False
    return chapter.page_start <= page_end and chapter.page_end >= page_start


def section_overlaps_slice(section: BookSection, source_slice: SourceSlice) -> bool:
    """Return true when a chapter section overlaps the source page slice."""
    page_start = source_slice.source_range.page_start
    page_end = source_slice.source_range.page_end
    if page_start is None or page_end is None:
        return False
    return section.page_start <= page_end and section.page_end >= page_start


def build_source_text_for_slice(chapters: list[BookChapter], source_slice: SourceSlice) -> str:
    """Build model input text for the selected source slice.

    We include only sections that overlap the requested pages. If a chapter has
    no sections, we still include its title so the model receives structural
    context instead of a mysterious empty input.
    """
    chunks: list[str] = []
    for chapter in chapters:
        if not chapter_overlaps_slice(chapter, source_slice):
            continue
        header = f"CHAPTER {chapter.index}: {chapter.title} (pages {chapter.page_start}-{chapter.page_end})"
        section_chunks = [
            f"SECTION: {section.title} (pages {section.page_start}-{section.page_end})\n{section.content}"
            for section in chapter.sections
            if section_overlaps_slice(section, source_slice) and section.content.strip()
        ]
        if section_chunks:
            chunks.append(header + "\n" + "\n\n".join(section_chunks))
        else:
            chunks.append(header)
    return "\n\n---\n\n".join(chunks).strip()


def serialize_llm_trace(trace: LLMInvocationTrace) -> dict[str, Any]:
    """Serialize compact LLM trace metadata for persistence."""
    return {
        "stage_name": trace.stage_name.value,
        "provider": trace.provider,
        "model": trace.model,
        "total_input_tokens": trace.total_input_tokens,
        "total_output_tokens": trace.total_output_tokens,
        "total_cost_usd": trace.total_cost_usd,
        "attempts": [
            {
                "attempt_index": attempt.attempt_index,
                "input_tokens": attempt.input_tokens,
                "output_tokens": attempt.output_tokens,
                "estimated_cost_usd": attempt.estimated_cost_usd,
                "content_preview": attempt.content_preview,
                "issues": [issue.__dict__ for issue in attempt.issues],
            }
            for attempt in trace.attempts
        ],
    }


def load_fact_registry(project: MangaProjectDoc) -> list[SourceFact]:
    """Load the persisted fact registry into domain models."""
    return [SourceFact(**fact) for fact in project.fact_registry]


def build_generation_options(
    *,
    project: MangaProjectDoc,
    source_has_more: bool,
    standalone: bool = False,
    extra_options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Merge persisted project options with per-run generation options."""
    options = dict(project.project_options)
    options.update(extra_options or {})
    options.setdefault("style", project.style)
    options.setdefault("engine", project.engine)
    options["source_has_more"] = source_has_more
    options["standalone"] = standalone
    if "slice_role" not in options:
        options["slice_role"] = SliceRole.STANDALONE.value if standalone else SliceRole.OPENING.value
    return options


def build_v2_generation_stages():
    """Return the ordered production v2 manga generation stages."""
    return [
        source_fact_extraction_stage.run,
        adaptation_plan_stage.run,
        character_world_bible_stage.run,
        beat_sheet_stage.run,
        manga_script_stage.run,
        storyboard_stage.run,
        quality_gate_stage.run,
        storyboard_to_v4_stage.run,
    ]


async def generate_project_slice(
    *,
    project: MangaProjectDoc,
    book: Book,
    llm_client: LLMModelClient,
    page_window: int = 10,
    extra_options: dict[str, Any] | None = None,
) -> tuple[MangaSliceDoc, list[MangaPageDoc]]:
    """Generate, validate, render, and persist the next manga source slice."""
    ledger = load_project_ledger(project)
    source_slice = choose_next_page_slice(
        book_id=str(book.id),
        total_pages=book.total_pages,
        chapters=book.chapters,
        ledger=ledger,
        page_window=page_window,
    )
    if source_slice is None:
        raise ValueError("manga project source is already fully covered")

    source_text = build_source_text_for_slice(book.chapters, source_slice)
    if not source_text:
        raise ValueError("selected source slice has no extractable text")

    source_has_more = source_slice.source_range.page_end is not None and source_slice.source_range.page_end < book.total_pages
    options = build_generation_options(
        project=project,
        source_has_more=source_has_more,
        extra_options={**(extra_options or {}), "source_text": source_text},
    )
    context = PipelineContext(
        book_id=str(book.id),
        project_id=str(project.id),
        source_slice=source_slice,
        prior_continuity=ledger,
        options=options,
        llm_client=llm_client,
        fact_registry=load_fact_registry(project),
    )

    final_context = await run_pipeline_context(context, build_v2_generation_stages())
    if final_context.quality_report and not final_context.quality_report.passed:
        raise ValueError("manga quality gate failed; LLM repair stage is required before persistence")

    slice_index = len(ledger.covered_source_ranges)
    slice_doc = MangaSliceDoc(
        project_id=str(project.id),
        book_id=str(book.id),
        source_slice=source_slice.model_dump(mode="json"),
        slice_index=slice_index,
        slice_role=str(options.get("slice_role", SliceRole.OPENING.value)),
        status="complete",
        input_continuity_version=ledger.version,
        output_continuity_version=ledger.version + 1,
        beat_sheet_fragment=final_context.beat_sheet.model_dump(mode="json") if final_context.beat_sheet else {},
        manga_script_fragment=final_context.manga_script.model_dump(mode="json") if final_context.manga_script else {},
        storyboard_pages=[page.model_dump(mode="json") for page in final_context.storyboard_pages],
        new_fact_ids=final_context.new_fact_ids,
        quality_report=final_context.quality_report.model_dump(mode="json") if final_context.quality_report else {},
        llm_traces=[serialize_llm_trace(trace) for trace in final_context.llm_traces],
    )
    await slice_doc.insert()

    page_docs: list[MangaPageDoc] = []
    starting_page_index = int(project.coverage.get("page_count", 0))
    for offset, v4_page in enumerate(final_context.v4_pages):
        page_doc = MangaPageDoc(
            project_id=str(project.id),
            slice_id=str(slice_doc.id),
            page_index=starting_page_index + offset,
            source_range=source_slice.source_range.model_dump(mode="json"),
            v4_page=v4_page,
        )
        await page_doc.insert()
        page_docs.append(page_doc)

    updated_ledger = update_ledger_after_slice(
        ledger,
        source_slice=source_slice,
        new_fact_ids=final_context.new_fact_ids,
        recap=final_context.manga_script.scenes[-1].action if final_context.manga_script else "",
        last_page_hook=final_context.storyboard_pages[-1].page_turn_hook if final_context.storyboard_pages else "",
    )
    project.fact_registry = [fact.model_dump(mode="json") for fact in final_context.fact_registry]
    if final_context.adaptation_plan:
        project.adaptation_plan = final_context.adaptation_plan.model_dump(mode="json")
    if final_context.character_bible:
        project.character_world_bible = final_context.character_bible.model_dump(mode="json")
    project.continuity_ledger = updated_ledger.model_dump(mode="json")
    project.coverage = {
        "covered_source_ranges": [item.model_dump(mode="json") for item in updated_ledger.covered_source_ranges],
        "page_count": starting_page_index + len(page_docs),
        "latest_slice_id": str(slice_doc.id),
    }
    project.status = "complete"
    await project.save()

    return slice_doc, page_docs
