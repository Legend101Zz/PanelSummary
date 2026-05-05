"""Generation orchestration helpers for manga v2 projects.

This module is the boundary between persistence/API concerns and the typed manga
pipeline. Creative stages stay model-backed and pure-ish; this service assembles
source text, runs the ordered stages, and persists the resulting artifacts.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from inspect import isawaitable
from typing import Any, Protocol

from app.domain.manga import (
    AdaptationPlan,
    ArcOutline,
    BookSynopsis,
    CharacterArtDirectionBundle,
    CharacterVoiceCardBundle,
    CharacterWorldBible,
    MangaAssetSpec,
    SliceRole,
    SourceFact,
    SourceSlice,
    build_recap_seed,
    update_ledger_after_slice,
)
from app.manga_models import MangaAssetDoc, MangaPageDoc, MangaProjectDoc, MangaSliceDoc
from app.manga_pipeline import PipelineContext, run_pipeline_context
from app.manga_pipeline.llm_contracts import LLMInvocationTrace, LLMModelClient
from app.manga_pipeline.stages import (
    adaptation_plan_stage,
    beat_sheet_stage,
    character_asset_plan_stage,
    character_world_bible_stage,
    continuity_gate_stage,
    dsl_validation_stage,
    manga_script_stage,
    page_composition_stage,
    panel_quality_gate_stage,
    panel_rendering_stage,
    quality_gate_stage,
    quality_repair_stage,
    rendered_page_assembly_stage,
    rtl_composition_validation_stage,
    script_repair_stage,
    script_review_stage,
    source_fact_extraction_stage,
    storyboard_stage,
    storyboard_to_v4_stage,
)
from app.models import Book, BookChapter, BookSection
from app.services.manga.arc_slice_planning_service import (
    ArcSlicePlan,
    choose_next_arc_slice,
)
from app.services.manga.asset_image_service import build_generated_asset_doc, build_prompt_asset_doc
from app.services.manga.project_service import load_project_ledger
from app.services.manga.source_slice_service import choose_next_page_slice


GenerationProgressCallback = Callable[[int, str, str], Awaitable[None] | None]


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


def _hydrate_book_artifacts_into_context(
    *,
    project: MangaProjectDoc,
    context: PipelineContext,
) -> None:
    """Copy persisted book-level artifacts into the per-slice pipeline context.

    Per-slice stages read these as immutable. The context is mutable only as a
    Python object; the *contract* is that the slice pipeline must not write to
    these fields. Read-through stages (adaptation_plan, character_world_bible,
    source_fact_extraction) check for these fields and short-circuit.
    """
    if project.book_synopsis:
        context.book_synopsis = BookSynopsis(**project.book_synopsis)
    if project.adaptation_plan:
        context.adaptation_plan = AdaptationPlan(**project.adaptation_plan)
    if project.character_world_bible:
        context.character_bible = CharacterWorldBible(**project.character_world_bible)
    if project.character_art_direction:
        context.art_direction = CharacterArtDirectionBundle(**project.character_art_direction)
    if project.character_voice_cards:
        context.voice_cards = CharacterVoiceCardBundle(**project.character_voice_cards)
    if project.arc_outline:
        context.arc_outline = ArcOutline(**project.arc_outline)
    context.bible_locked = bool(project.bible_locked)


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


def build_v2_generation_stages(*, with_panel_rendering: bool = False):
    """Return the ordered production v2 manga generation stages.

    The DSL validation stage sits BETWEEN storyboard and the first quality
    gate so that DSL violations (panel count, dialogue budget, anchor facts,
    shot variety) are merged into the same ``QualityReport`` the existing
    repair stage already consumes. We do not invent a parallel issue type.

    Phase 4: when ``with_panel_rendering`` is True, the multimodal panel
    rendering stage is appended. The orchestrator (not the stage) decides
    whether image generation is in scope, so the stage list itself reflects
    that choice — there is no in-stage "is image gen on?" branch.
    """
    stages = [
        source_fact_extraction_stage.run,
        adaptation_plan_stage.run,
        character_world_bible_stage.run,
        beat_sheet_stage.run,
        manga_script_stage.run,
        # Phase A: editor pass + repair on the SCRIPT, before storyboard
        # spends LLM tokens turning bad dialogue into bad panels.
        script_review_stage.run,
        script_repair_stage.run,
        storyboard_stage.run,
        dsl_validation_stage.run,
        # Phase A: continuity checks (arc must-cover, prior hook, protagonist
        # presence) merge into the same QualityReport the existing repair loop
        # consumes. Same one-tool, one-issue-stream principle as DSL.
        continuity_gate_stage.run,
        quality_gate_stage.run,
        quality_repair_stage.run,
        dsl_validation_stage.run,
        continuity_gate_stage.run,
        quality_gate_stage.run,
        # Phase C1: page composition runs AFTER the second quality gate
        # has settled (so we are composing the *final* storyboard, not a
        # draft) and BEFORE storyboard_to_v4 (which reads the composition
        # to fill V4Page.layout / .gutter_grid).
        page_composition_stage.run,
        # Phase C2: RTL flow validator over the composition. Issues land
        # on the same QualityReport so the existing repair tooling and
        # QA dashboard see them without a parallel report shape.
        rtl_composition_validation_stage.run,
        character_asset_plan_stage.run,
        storyboard_to_v4_stage.run,
        # Phase 4.2: assemble the typed RenderedPage surface the new
        # rendering stage and quality gate consume. Sits AFTER
        # storyboard_to_v4 (which still produces the legacy v4_pages
        # shadow read by persistence + the V4 frontend until the wire
        # flip in Phase 4.5) and BEFORE panel rendering. Pure
        # projection: storyboard_pages + slice_composition →
        # context.rendered_pages.
        rendered_page_assembly_stage.run,
    ]
    if with_panel_rendering:
        stages.append(panel_rendering_stage.run)
        # Phase 10: structural panel-level gate runs ONLY when panel rendering
        # was scheduled — it has nothing to evaluate otherwise. Putting it in
        # the same conditional makes the dependency explicit; the stage's own
        # body is also defensive (it short-circuits when there's no renderer
        # summary), but enforcing the order here is the cleaner contract.
        stages.append(panel_quality_gate_stage.run)
    return stages


async def _emit_progress(
    callback: GenerationProgressCallback | None,
    progress: int,
    message: str,
    phase: str,
) -> None:
    if callback is None:
        return
    result = callback(progress, message, phase)
    if isawaitable(result):
        await result


def _stage_message(stage_label: str) -> str:
    readable = stage_label.replace("_", " ").title()
    return f"Completed {readable}"


async def _build_asset_docs(
    *,
    project: MangaProjectDoc,
    asset_specs: list[MangaAssetSpec],
    options: dict[str, Any],
    image_api_key: str | None,
    progress_callback: GenerationProgressCallback | None,
    character_bible: CharacterWorldBible | None = None,
) -> list[MangaAssetDoc]:
    """Materialize ONLY the asset specs missing from the project library.

    Phase 3 invariant: the book-understanding service already populated the
    canonical library when the bible was locked. Per-slice generation must
    NOT duplicate those rows — doing so would burn image-model spend AND
    produce slightly different images, breaking visual continuity.

    Spec lookup is by the planner-stable ``asset_id`` stored in metadata.
    """
    from app.services.manga.character_library_service import (
        existing_asset_id_set,
        specs_missing_from_library,
    )

    should_generate_images = bool(options.get("generate_images"))
    if should_generate_images and not image_api_key:
        raise ValueError("character asset image generation requires an image_api_key")

    existing_ids = await existing_asset_id_set(str(project.id))
    missing_specs = specs_missing_from_library(
        planned_specs=list(asset_specs),
        existing_asset_ids=existing_ids,
    )
    # Mechanically attach the bible's visual lock to every generated prompt.
    # Without this, the asset prompt only carries whatever the planner wrote,
    # which the image model is free to ignore. Looking up by character_id is
    # safe even when the bible is None (we just skip the enrichment).
    character_lookup = {
        character.character_id: character
        for character in (character_bible.characters if character_bible else [])
    }

    asset_docs: list[MangaAssetDoc] = []
    total_assets = len(missing_specs)
    for index, asset in enumerate(missing_specs, start=1):
        await _emit_progress(
            progress_callback,
            84 + int((index / max(total_assets, 1)) * 8),
            f"Preparing character asset {index}/{total_assets}: {asset.character_id}",
            "assets",
        )
        if should_generate_images:
            asset_docs.append(await build_generated_asset_doc(
                project_id=str(project.id),
                asset=asset,
                api_key=image_api_key or "",
                style=str(options.get("style", project.style)),
                image_model=str(options.get("image_model")) if options.get("image_model") else None,
                character_design=character_lookup.get(asset.character_id),
            ))
        else:
            asset_docs.append(await build_prompt_asset_doc(
                project_id=str(project.id),
                asset=asset,
                style=str(options.get("style", project.style)),
                image_model=str(options.get("image_model")) if options.get("image_model") else None,
                character_design=character_lookup.get(asset.character_id),
            ))
    return asset_docs


def _pick_next_slice(
    *,
    project: MangaProjectDoc,
    book: Book,
    ledger,
    page_window: int,
) -> tuple[SourceSlice, ArcSlicePlan | None]:
    """Choose the next slice using the arc outline when available.

    Phase 2 promotes the arc outline to the source of truth. The legacy
    page-window slicer is preserved for projects predating book understanding
    so existing rows keep generating; new projects always go arc-first because
    ``project_understanding_is_ready`` is enforced by the API endpoint.

    Returns the chosen ``SourceSlice`` and (when available) the ``ArcSlicePlan``
    that produced it. Returning the plan lets the caller hydrate
    ``context.arc_entry`` so per-slice prompts honour the arc role.
    """
    if project.arc_outline:
        arc_outline = ArcOutline(**project.arc_outline)
        plan = choose_next_arc_slice(
            book_id=str(book.id),
            chapters=book.chapters,
            ledger=ledger,
            arc_outline=arc_outline,
        )
        if plan is None:
            raise ValueError("manga project arc outline is already fully covered")
        return plan.source_slice, plan

    legacy_slice = choose_next_page_slice(
        book_id=str(book.id),
        total_pages=book.total_pages,
        chapters=book.chapters,
        ledger=ledger,
        page_window=page_window,
    )
    if legacy_slice is None:
        raise ValueError("manga project source is already fully covered")
    return legacy_slice, None


async def generate_project_slice(
    *,
    project: MangaProjectDoc,
    book: Book,
    llm_client: LLMModelClient,
    page_window: int = 10,
    image_api_key: str | None = None,
    extra_options: dict[str, Any] | None = None,
    progress_callback: GenerationProgressCallback | None = None,
) -> tuple[MangaSliceDoc, list[MangaPageDoc]]:
    """Generate, validate, render, and persist the next manga source slice."""
    await _emit_progress(progress_callback, 3, "Selecting next source pages…", "source")
    ledger = load_project_ledger(project)
    source_slice, arc_plan = _pick_next_slice(
        project=project,
        book=book,
        ledger=ledger,
        page_window=page_window,
    )

    await _emit_progress(progress_callback, 6, "Extracting source text for slice…", "source")
    source_text = build_source_text_for_slice(book.chapters, source_slice)
    if not source_text:
        raise ValueError("selected source slice has no extractable text")

    source_has_more = source_slice.source_range.page_end is not None and source_slice.source_range.page_end < book.total_pages
    options = build_generation_options(
        project=project,
        source_has_more=source_has_more,
        extra_options={**(extra_options or {}), "source_text": source_text},
    )
    # Phase 4: surface the image API key into the context so the panel
    # rendering stage can pick it up. The stage stays pure (no globals); the
    # orchestrator decides whether to schedule it AND whether to share the
    # key, in one place.
    should_render_panel_art = bool(options.get("generate_images")) and bool(image_api_key)
    if should_render_panel_art:
        options["image_api_key"] = image_api_key
    context = PipelineContext(
        book_id=str(book.id),
        project_id=str(project.id),
        source_slice=source_slice,
        prior_continuity=ledger,
        options=options,
        llm_client=llm_client,
        fact_registry=load_fact_registry(project),
    )
    _hydrate_book_artifacts_into_context(project=project, context=context)
    if arc_plan is not None:
        # Stamp the arc entry onto the context so per-slice stages can read
        # the headline beat, must-cover facts, and closing hook directly.
        context.arc_entry = arc_plan.arc_entry

    stages = build_v2_generation_stages(with_panel_rendering=should_render_panel_art)

    async def report_stage(completed: int, total: int, label: str) -> None:
        progress = 10 + int((completed / max(total, 1)) * 70)
        await _emit_progress(progress_callback, progress, _stage_message(label), label)

    final_context = await run_pipeline_context(context, stages, progress_callback=report_stage)
    if final_context.quality_report and not final_context.quality_report.passed:
        raise ValueError("manga quality gate failed; LLM repair stage is required before persistence")

    await _emit_progress(progress_callback, 82, "Preparing generated artifacts for persistence…", "persist")
    asset_docs = await _build_asset_docs(
        project=project,
        asset_specs=final_context.asset_specs,
        options=options,
        image_api_key=image_api_key,
        progress_callback=progress_callback,
        character_bible=final_context.character_bible,
    )

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
    # Phase 4.5a: serialise the typed RenderedPage surface alongside the
    # legacy v4_page dict. Both flow into MangaPageDoc so the V4 frontend
    # keeps reading what it always has while 4.5b cuts the new reader
    # over to ``rendered_page``. ``mode="json"`` so ShotType / aspect
    # enums hit Mongo as strings (Beanie does not coerce enum values).
    # If ``rendered_pages`` is shorter than ``v4_pages`` (legacy code
    # paths that skip rendered_page_assembly_stage), the extra slots get
    # an empty dict — same default as a brand-new MangaPageDoc.
    rendered_page_dumps = [
        rendered_page.model_dump(mode="json")
        for rendered_page in final_context.rendered_pages
    ]
    for offset, v4_page in enumerate(final_context.v4_pages):
        rendered_page_dump = (
            rendered_page_dumps[offset]
            if offset < len(rendered_page_dumps)
            else {}
        )
        page_doc = MangaPageDoc(
            project_id=str(project.id),
            slice_id=str(slice_doc.id),
            page_index=starting_page_index + offset,
            source_range=source_slice.source_range.model_dump(mode="json"),
            v4_page=v4_page,
            rendered_page=rendered_page_dump,
        )
        await page_doc.insert()
        page_docs.append(page_doc)

    for asset_doc in asset_docs:
        await asset_doc.insert()

    # Phase 2.1 + 2.2 — the previous call passed the ledger positionally
    # AND used the old `recap=` keyword that does not exist on the
    # function signature. The first slice never reached this branch (no
    # prior ledger to update meaningfully); slice 2 onwards crashed with
    # TypeError. We now (a) keyword-pass everything and (b) compute the
    # recap seed from the *resolved scene goal + closing hook* via the
    # pure helper, instead of pasting the last scene's stage direction.
    updated_ledger = update_ledger_after_slice(
        ledger=ledger,
        source_slice=source_slice,
        new_fact_ids=final_context.new_fact_ids,
        recap_for_next_slice=build_recap_seed(
            manga_script=final_context.manga_script,
            storyboard_pages=final_context.storyboard_pages,
        ),
        last_page_hook=(
            final_context.storyboard_pages[-1].page_turn_hook
            if final_context.storyboard_pages
            else ""
        ),
    )
    project.fact_registry = [fact.model_dump(mode="json") for fact in final_context.fact_registry]
    # Book-level artifacts are read-only after the understanding phase. We
    # only write them here when they were missing (legacy projects upgraded
    # in-place); never overwrite a locked bible.
    if final_context.adaptation_plan and not project.adaptation_plan:
        project.adaptation_plan = final_context.adaptation_plan.model_dump(mode="json")
    if final_context.character_bible and not project.bible_locked:
        project.character_world_bible = final_context.character_bible.model_dump(mode="json")
    project.continuity_ledger = updated_ledger.model_dump(mode="json")
    project.coverage = {
        "covered_source_ranges": [item.model_dump(mode="json") for item in updated_ledger.covered_source_ranges],
        "page_count": starting_page_index + len(page_docs),
        "latest_slice_id": str(slice_doc.id),
    }
    project.status = "complete"
    await project.save()
    await _emit_progress(progress_callback, 98, "Manga slice persisted successfully…", "complete")

    return slice_doc, page_docs
