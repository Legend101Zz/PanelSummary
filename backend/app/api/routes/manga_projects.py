"""Manga project control-plane routes.

These endpoints create and inspect persistent manga projects. Actual generation
will be wired behind the revamp pipeline later; this route exists so the UI can
start thinking in projects/slices instead of one-off summaries.
"""

from __future__ import annotations

from typing import Any

from beanie.operators import In
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, ValidationError

import logging
from datetime import UTC, datetime

from app.domain.manga import CharacterArtDirectionBundle, CharacterWorldBible, SourceSlice
from app.manga_models import MangaAssetDoc, MangaPageDoc, MangaProjectDoc, MangaSliceDoc
from app.models import Book, JobStatus, ProcessingStatus
from app.services.manga import (
    choose_next_page_slice,
    get_or_create_project,
    load_project_ledger,
    project_understanding_is_ready,
    serialize_project,
)
from app.services.manga.character_library_service import (
    ensure_book_character_sheets,
    list_project_assets,
    regenerate_asset_doc,
)
from app.services.manga.character_sheet_planner import plan_book_character_sheets
from app.services.manga.expression_coverage import compute_missing_expressions

logger = logging.getLogger(__name__)

router = APIRouter(tags=["manga-projects"])


def _now_utc() -> datetime:
    """Single source of truth for UTC timestamps in this module.

    Defined here rather than imported from manga_models because the
    pin endpoint is the only consumer in this file and we want zero
    coupling to the model module's private helpers.
    """
    return datetime.now(UTC)


class CreateMangaProjectRequest(BaseModel):
    style: str = "manga"
    engine: str = "v4"
    title: str = ""
    project_options: dict[str, Any] = Field(default_factory=dict)


class NextSourceSliceRequest(BaseModel):
    page_window: int = Field(default=10, ge=1, le=100)


class GenerateMangaSliceRequest(BaseModel):
    api_key: str = Field(min_length=1)
    provider: str = "openai"
    model: str | None = None
    page_window: int = Field(default=10, ge=1, le=100)
    generate_images: bool = False
    image_model: str | None = None
    options: dict[str, Any] = Field(default_factory=dict)


class GenerateBookUnderstandingRequest(BaseModel):
    api_key: str = Field(min_length=1)
    provider: str = "openai"
    model: str | None = None
    options: dict[str, Any] = Field(default_factory=dict)
    force: bool = False


class StartBookUnderstandingResponse(BaseModel):
    project: dict[str, Any]
    task_id: str | None
    message: str
    already_ready: bool


class MangaProjectResponse(BaseModel):
    project: dict[str, Any]


class MangaProjectsResponse(BaseModel):
    projects: list[dict[str, Any]]


class NextSourceSliceResponse(BaseModel):
    source_slice: dict[str, Any] | None
    fully_covered: bool


class StartMangaSliceGenerationResponse(BaseModel):
    project: dict[str, Any]
    task_id: str
    message: str


class MangaProjectSlicesResponse(BaseModel):
    slices: list[dict[str, Any]]


class MangaProjectPagesResponse(BaseModel):
    pages: list[dict[str, Any]]


class MangaProjectAssetsResponse(BaseModel):
    assets: list[dict[str, Any]]
    # Phase 3.1: spec→asset coverage gaps. Populated by re-running the
    # planner against the persisted docs so the Library UI can render
    # "Kai is missing: panicked, contemplative" without needing a second
    # round-trip. Empty list when the bible has no characters yet OR every
    # planned spec has a doc — the UI treats both the same way.
    missing_expressions: list[dict[str, Any]] = Field(default_factory=list)


class GenerateCharacterSheetsRequest(BaseModel):
    """Request body for the explicit character-sheet generation endpoint.

    The image_api_key is only required when ``generate_images`` is True on the
    project's options. Without it we still persist prompt-only docs so the
    library is COMPLETE for the renderer; the user can re-trigger with images
    later.
    """

    image_api_key: str | None = None


class CharacterSheetsResponse(BaseModel):
    """Library snapshot returned after a (potentially no-op) materialization."""

    assets: list[dict[str, Any]]
    generated_count: int = Field(
        description="Number of new assets created in this call (0 when fully idempotent).",
    )


class RegenerateAssetRequest(BaseModel):
    """Body for the per-asset regenerate endpoint (Phase B4).

    The image_api_key is required because regen ALWAYS goes back to the
    image model — there is no point in regenerating a prompt-only doc.
    The endpoint 409s if the project does not have ``generate_images``
    enabled rather than silently producing a no-op.
    """

    image_api_key: str


class AssetMutationResponse(BaseModel):
    """Single-asset response shared by regenerate + pin endpoints.

    Returns the post-mutation asset doc (or null when regen ran but
    the project's image-gen entitlement was off and the service
    declined to act). The single shape keeps the frontend's typing
    one branch wide.
    """

    asset: dict[str, Any] | None


class PinAssetRequest(BaseModel):
    """Body for the pin/unpin toggle endpoint.

    Boolean rather than enum because pinning has exactly two states; an
    enum here would be ceremony for ceremony's sake.
    """

    pinned: bool


def _serialize_source_slice(source_slice: SourceSlice | None) -> dict[str, Any] | None:
    if source_slice is None:
        return None
    return source_slice.model_dump(mode="json")


def _serialize_slice_doc(slice_doc: MangaSliceDoc) -> dict[str, Any]:
    return {
        "id": str(slice_doc.id),
        "project_id": slice_doc.project_id,
        "book_id": slice_doc.book_id,
        "source_slice": slice_doc.source_slice,
        "slice_index": slice_doc.slice_index,
        "slice_role": slice_doc.slice_role,
        "status": slice_doc.status,
        "new_fact_ids": slice_doc.new_fact_ids,
        "quality_report": slice_doc.quality_report,
        "llm_traces": slice_doc.llm_traces,
        "created_at": slice_doc.created_at.isoformat(),
        "updated_at": slice_doc.updated_at.isoformat(),
    }


def _serialize_page_doc(page: MangaPageDoc) -> dict[str, Any]:
    return {
        "id": str(page.id),
        "project_id": page.project_id,
        "slice_id": page.slice_id,
        "page_index": page.page_index,
        "source_range": page.source_range,
        # Phase 4.5c: ``rendered_page`` is the only page payload. The
        # legacy ``v4_page`` shadow was dropped from MangaPageDoc and
        # the API response in the same commit; the V4 reader was
        # deleted in 4.5c too, so no consumer is left to miss it.
        # Pre-4.5a docs whose ``rendered_page`` is the default empty
        # dict will be surfaced as such; the reader's narrow function
        # treats them as 'no page yet'.
        "rendered_page": page.rendered_page,
        "created_at": page.created_at.isoformat(),
    }


def _serialize_asset_doc(asset: MangaAssetDoc) -> dict[str, Any]:
    # Phase B4: the Character Library UI consumes the QA fields the gate
    # writes back (status / pinned / regen_count / silhouette_match_score /
    # last_quality_checks). Including them in the serializer is the cheapest
    # way to power the UI's status badges and tooltip explanations
    # without a second round-trip per asset.
    return {
        "id": str(asset.id),
        "project_id": asset.project_id,
        "character_id": asset.character_id,
        "asset_type": asset.asset_type,
        "expression": asset.expression,
        "image_path": asset.image_path,
        "prompt": asset.prompt,
        "model": asset.model,
        "metadata": asset.metadata,
        "status": asset.status,
        "pinned": asset.pinned,
        "regen_count": asset.regen_count,
        "silhouette_match_score": asset.silhouette_match_score,
        # Phase 3.2: surfaces costume adherence as a separate signal so the
        # Library UI can show "silhouette OK, outfit drift" without joining
        # back to last_quality_checks.
        "outfit_match_score": asset.outfit_match_score,
        "last_quality_checks": asset.last_quality_checks,
        "created_at": asset.created_at.isoformat(),
        "updated_at": asset.updated_at.isoformat(),
    }


@router.post("/books/{book_id}/manga-projects", response_model=MangaProjectResponse)
async def create_manga_project(book_id: str, request: CreateMangaProjectRequest):
    book = await Book.get(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    if book.status not in (ProcessingStatus.PARSED, ProcessingStatus.COMPLETE):
        raise HTTPException(status_code=400, detail=f"Book is not parsed yet: {book.status}")

    project = await get_or_create_project(
        book=book,
        style=request.style,
        engine=request.engine,
        title=request.title,
        project_options=request.project_options,
    )
    return MangaProjectResponse(project=serialize_project(project))


@router.get("/books/{book_id}/manga-projects", response_model=MangaProjectsResponse)
async def list_book_manga_projects(book_id: str):
    book = await Book.get(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    projects = await MangaProjectDoc.find(MangaProjectDoc.book_id == book_id).sort("-updated_at").to_list()
    return MangaProjectsResponse(projects=[serialize_project(project) for project in projects])


@router.get("/manga-projects/{project_id}", response_model=MangaProjectResponse)
async def get_manga_project(project_id: str):
    project = await MangaProjectDoc.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Manga project not found")
    return MangaProjectResponse(project=serialize_project(project))


@router.get("/manga-projects/{project_id}/slices", response_model=MangaProjectSlicesResponse)
async def list_manga_project_slices(project_id: str):
    project = await MangaProjectDoc.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Manga project not found")

    slices = await MangaSliceDoc.find(MangaSliceDoc.project_id == project_id).sort("slice_index").to_list()
    return MangaProjectSlicesResponse(slices=[_serialize_slice_doc(item) for item in slices])


@router.get("/manga-projects/{project_id}/pages", response_model=MangaProjectPagesResponse)
async def list_manga_project_pages(project_id: str):
    project = await MangaProjectDoc.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Manga project not found")

    pages = await MangaPageDoc.find(MangaPageDoc.project_id == project_id).sort("page_index").to_list()
    return MangaProjectPagesResponse(pages=[_serialize_page_doc(page) for page in pages])


@router.get("/manga-projects/{project_id}/assets", response_model=MangaProjectAssetsResponse)
async def list_manga_project_assets(project_id: str):
    project = await MangaProjectDoc.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Manga project not found")

    assets = await MangaAssetDoc.find(MangaAssetDoc.project_id == project_id).sort("character_id").to_list()

    # Phase 3.1: surface coverage gaps. The compute is pure (no LLM, no I/O)
    # so doing it on every list call is fine; replanning here also means a
    # bible edit is reflected in "what's missing" without needing the
    # sprite-quality gate to run first.
    missing: list[dict[str, Any]] = []
    bible_dict = project.character_world_bible if isinstance(project.character_world_bible, dict) else None
    if bible_dict and bible_dict.get("characters"):
        try:
            bible = CharacterWorldBible.model_validate(bible_dict)
            art_direction = (
                CharacterArtDirectionBundle.model_validate(project.character_art_direction)
                if isinstance(project.character_art_direction, dict)
                and project.character_art_direction.get("characters")
                else None
            )
            plan = plan_book_character_sheets(
                bible=bible,
                project_id=str(project.id),
                art_direction=art_direction,
            )
            gaps = compute_missing_expressions(plan=plan, persisted=assets)
            missing = [gap.model_dump() for gap in gaps]
        except (ValueError, ValidationError) as exc:
            # A malformed bible/art direction shouldn't break the Library
            # listing — the page is still useful without the gap section.
            logger.warning(
                "[ASSETS] coverage compute skipped for project %s: %s",
                project.id,
                exc,
            )

    return MangaProjectAssetsResponse(
        assets=[_serialize_asset_doc(asset) for asset in assets],
        missing_expressions=missing,
    )


@router.post("/manga-projects/{project_id}/character-sheets", response_model=CharacterSheetsResponse)
async def materialize_character_sheets(
    project_id: str,
    request: GenerateCharacterSheetsRequest,
) -> CharacterSheetsResponse:
    """Idempotently materialize the project's character sheet library.

    The book-understanding pipeline already calls this for new projects; this
    endpoint exists so the UI can:

    * Retry sheet generation after an image-model outage without rerunning the
      LLM-heavy book understanding.
    * Switch a project from ``generate_images=False`` to ``True`` and fill in
      the actual images without re-planning prompts.

    Returns the full library AND the number of newly created assets so the
    caller can tell whether real work happened.
    """
    project = await MangaProjectDoc.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Manga project not found")
    if not project.character_world_bible:
        raise HTTPException(
            status_code=409,
            detail="Project has no character world bible yet; run book-understanding first.",
        )

    bible = CharacterWorldBible(**project.character_world_bible)
    art_direction = (
        CharacterArtDirectionBundle(**project.character_art_direction)
        if project.character_art_direction
        else None
    )
    before = await list_project_assets(str(project.id))
    after = await ensure_book_character_sheets(
        project=project,
        bible=bible,
        art_direction=art_direction,
        image_api_key=request.image_api_key,
    )
    return CharacterSheetsResponse(
        assets=[_serialize_asset_doc(doc) for doc in after],
        generated_count=max(len(after) - len(before), 0),
    )


@router.post(
    "/manga-projects/{project_id}/assets/{asset_id}/regenerate",
    response_model=AssetMutationResponse,
)
async def regenerate_manga_asset(
    project_id: str,
    asset_id: str,
    request: RegenerateAssetRequest,
) -> AssetMutationResponse:
    """Regenerate a single character sheet via the image model (Phase B4).

    Why per-asset instead of "regenerate the library"?
    * Cost. The library can be 8-12 assets; the user usually only
      hates ONE of them.
    * Pin preservation. The library-wide ``character-sheets`` endpoint
      is idempotent on the planner's stable id so it can't replace an
      existing asset; this endpoint deliberately replaces the doc in
      place via ``regenerate_asset_doc`` and carries forward the pin.

    Returns the new asset (with ``regen_count`` bumped) so the UI can
    swap the card without a second round trip.
    """
    project = await MangaProjectDoc.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Manga project not found")
    if not project.character_world_bible:
        raise HTTPException(
            status_code=409,
            detail="Project has no character world bible yet; run book-understanding first.",
        )
    if not bool(project.project_options.get("generate_images")):
        raise HTTPException(
            status_code=409,
            detail=(
                "Project does not have generate_images enabled; "
                "call /character-sheets first with image_api_key."
            ),
        )

    asset = await MangaAssetDoc.get(asset_id)
    if not asset or asset.project_id != project_id:
        raise HTTPException(status_code=404, detail="Asset not found in this project")

    bible = CharacterWorldBible(**project.character_world_bible)
    art_direction = (
        CharacterArtDirectionBundle(**project.character_art_direction)
        if project.character_art_direction
        else None
    )
    new_doc = await regenerate_asset_doc(
        project=project,
        bible=bible,
        asset_doc=asset,
        image_api_key=request.image_api_key,
        art_direction=art_direction,
    )
    return AssetMutationResponse(
        asset=_serialize_asset_doc(new_doc) if new_doc else None,
    )


@router.post(
    "/manga-projects/{project_id}/assets/{asset_id}/pin",
    response_model=AssetMutationResponse,
)
async def set_manga_asset_pin(
    project_id: str,
    asset_id: str,
    request: PinAssetRequest,
) -> AssetMutationResponse:
    """Pin / unpin an asset (Phase B4).

    Pinning tells the panel renderer to prefer THIS asset for the
    character even when a fresher one would auto-win. The flag is a
    user-facing override; we deliberately keep it as a separate
    endpoint so that pin doesn't cost an image-model call (which
    ``regenerate`` does).
    """
    asset = await MangaAssetDoc.get(asset_id)
    if not asset or asset.project_id != project_id:
        raise HTTPException(status_code=404, detail="Asset not found in this project")
    asset.pinned = request.pinned
    asset.updated_at = _now_utc()
    await asset.save()
    return AssetMutationResponse(asset=_serialize_asset_doc(asset))


@router.post("/manga-projects/{project_id}/next-source-slice", response_model=NextSourceSliceResponse)
async def preview_next_source_slice(project_id: str, request: NextSourceSliceRequest):
    project = await MangaProjectDoc.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Manga project not found")

    book = await Book.get(project.book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found for manga project")

    ledger = load_project_ledger(project)
    source_slice = choose_next_page_slice(
        book_id=str(book.id),
        total_pages=book.total_pages,
        chapters=book.chapters,
        ledger=ledger,
        page_window=request.page_window,
    )

    return NextSourceSliceResponse(
        source_slice=_serialize_source_slice(source_slice),
        fully_covered=source_slice is None,
    )


@router.post("/manga-projects/{project_id}/book-understanding", response_model=StartBookUnderstandingResponse)
async def start_book_understanding(project_id: str, request: GenerateBookUnderstandingRequest):
    """Run (or re-run) the book-level understanding pipeline for a project.

    Idempotent: if the project already has a complete understanding bundle and
    ``force`` is False, this returns immediately without queueing a job. The
    same task is automatically queued by ``generate-slice`` if understanding
    is missing, so the UI rarely needs to call this endpoint directly except
    to force a rebuild after auditing the persisted artifacts.
    """
    project = await MangaProjectDoc.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Manga project not found")

    book = await Book.get(project.book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found for manga project")
    if book.status not in (ProcessingStatus.PARSED, ProcessingStatus.COMPLETE):
        raise HTTPException(status_code=400, detail=f"Book is not parsed yet: {book.status}")

    if project_understanding_is_ready(project) and not request.force:
        return StartBookUnderstandingResponse(
            project=serialize_project(project),
            task_id=None,
            message="Book understanding already complete.",
            already_ready=True,
        )

    active_job = await JobStatus.find_one(
        JobStatus.result_id == project_id,
        JobStatus.job_type == "generate_book_understanding",
        In(JobStatus.status, ["pending", "progress"]),  # type: ignore[arg-type]
    )
    if active_job:
        return StartBookUnderstandingResponse(
            project=serialize_project(project),
            task_id=active_job.celery_task_id,
            message="A book-understanding job is already running for this project.",
            already_ready=False,
        )

    from app.celery_manga_tasks import generate_book_understanding_task

    task = generate_book_understanding_task.delay(
        project_id=project_id,
        api_key=request.api_key,
        provider=request.provider,
        model=request.model,
        options=request.options,
        force=request.force,
    )
    job_status = JobStatus(
        celery_task_id=task.id,
        job_type="generate_book_understanding",
        status="pending",
        progress=0,
        message="Queued manga v2 book understanding…",
        result_id=project_id,
        phase="queued",
    )
    await job_status.insert()

    project.understanding_status = "running"
    await project.save()

    return StartBookUnderstandingResponse(
        project=serialize_project(project),
        task_id=task.id,
        message="Book understanding generation started.",
        already_ready=False,
    )


@router.post("/manga-projects/{project_id}/generate-slice", response_model=StartMangaSliceGenerationResponse)
async def generate_next_manga_slice(project_id: str, request: GenerateMangaSliceRequest):
    """Queue the next v2 manga slice for background generation."""
    project = await MangaProjectDoc.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Manga project not found")

    book = await Book.get(project.book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found for manga project")
    if book.status not in (ProcessingStatus.PARSED, ProcessingStatus.COMPLETE):
        raise HTTPException(status_code=400, detail=f"Book is not parsed yet: {book.status}")

    # Preflight: book-level understanding must be complete before a slice can
    # safely descend from it. We refuse to start a slice when understanding
    # is missing or failed; the caller should run /book-understanding first.
    if not project_understanding_is_ready(project):
        raise HTTPException(
            status_code=409,
            detail=(
                "Book understanding is not ready for this project (status="
                f"{project.understanding_status!r}). Call "
                "POST /manga-projects/{id}/book-understanding first."
            ),
        )

    active_job = await JobStatus.find_one(
        JobStatus.result_id == project_id,
        JobStatus.job_type == "generate_manga_slice",
        In(JobStatus.status, ["pending", "progress"]),  # type: ignore[arg-type]
    )
    if active_job:
        return StartMangaSliceGenerationResponse(
            project=serialize_project(project),
            task_id=active_job.celery_task_id,
            message="A manga slice is already being generated for this project.",
        )

    from app.celery_manga_tasks import generate_manga_slice_task

    task = generate_manga_slice_task.delay(
        project_id=project_id,
        api_key=request.api_key,
        provider=request.provider,
        model=request.model,
        page_window=request.page_window,
        generate_images=request.generate_images,
        image_model=request.image_model,
        options=request.options,
    )
    job_status = JobStatus(
        celery_task_id=task.id,
        job_type="generate_manga_slice",
        status="pending",
        progress=0,
        message="Queued manga v2 slice generation…",
        result_id=project_id,
        phase="queued",
    )
    await job_status.insert()

    project.status = "generating"
    await project.save()

    return StartMangaSliceGenerationResponse(
        project=serialize_project(project),
        task_id=task.id,
        message="Manga v2 slice generation started.",
    )
