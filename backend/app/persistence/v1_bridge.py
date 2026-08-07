"""Boundary between the ported ScrollStack persistence layer and live v1 docs.

ADR-011 wiring decision. The donor layer defines nine beanie Documents, two of
which collide with live v1 collections that carry DIFFERENT schemas:

* donor ``BookDoc``          -> collection ``books``          (v1: ``app.models.Book``)
* donor ``MangaProjectDoc``  -> collection ``manga_projects`` (v1: ``app.manga_models.MangaProjectDoc``)

Registering both classes against one collection would create the donor's
unique indexes (``book_id``, ``(owner_id, pdf_hash)``, ``project_id``) on
collections whose documents do not carry those fields, corrupting the very
guards they implement. Per ADR-010's name-mapping table the v1 documents stay
canonical for those two collections, so:

* ``WIRED_DOCUMENT_MODELS`` — the seven donor Docs that own NEW collections —
  is what the three v1 ``init_beanie`` sites register.
* ``V1BridgedRepositories`` subclasses the donor ``BeanieRepositories`` and
  reroutes the book/project methods to the live v1 documents, returning
  donor-shaped records via ``construct_document`` so the ported services
  (ScopeService, MemoryMergeService, GenerationRunService, ContextCompiler)
  run unchanged.

Identifier mapping: v1 uses the Mongo ``_id`` as the public book/project id,
so ``book_id``/``project_id`` on the bridge are ``str(ObjectId)``.
"""

from __future__ import annotations

from typing import cast

from beanie import Document
from bson import ObjectId
from bson.errors import InvalidId

from app.manga_models import MangaProjectDoc as V1MangaProjectDoc
from app.models import Book as V1Book

from .documents import (
    ArtifactDoc,
    BookDoc,
    GenerationRunDoc,
    MangaProjectDoc,
    ProjectMemorySnapshotDoc,
    ScopeManifestDoc,
    SeriesProgressDoc,
    SourceUnitDoc,
    StageRunDoc,
    construct_document,
    utc_now,
)
from .protocols import MemoryRepository
from .repositories import BeanieRepositories

#: The donor Docs registered with init_beanie in v1 processes. Donor BookDoc
#: and donor MangaProjectDoc are deliberately absent (collection collision —
#: see module docstring and ADR-011).
WIRED_DOCUMENT_MODELS: tuple[type[Document], ...] = (
    SourceUnitDoc,
    ScopeManifestDoc,
    ProjectMemorySnapshotDoc,
    ArtifactDoc,
    GenerationRunDoc,
    StageRunDoc,
    SeriesProgressDoc,
)


async def init_wired_documents(mongodb_url: str, database_name: str):
    """Motor adaptation of the donor ``initialize_mongo`` (ADR-011).

    The donor passes ``tz_aware=True`` to its client and the ported contracts
    require aware datetimes (`AwareDatetime`); the v1 motor client is naive
    and MUST stay naive (v1 API responses would otherwise change shape). So
    the seven wired collections get their own tz-aware client, initialized
    separately — beanie 1.27 supports per-model databases across init calls.
    Returns the client so callers can close it on shutdown.
    """

    from beanie import init_beanie
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(mongodb_url, tz_aware=True)
    await init_beanie(
        database=client[database_name],
        document_models=list(WIRED_DOCUMENT_MODELS),
    )
    return client


def _object_id(identifier: str) -> ObjectId | None:
    try:
        return ObjectId(identifier)
    except (InvalidId, TypeError):
        return None


def bridge_project(doc: V1MangaProjectDoc) -> MangaProjectDoc:
    """Project the live v1 manga project into the donor persistence shape."""

    return construct_document(
        MangaProjectDoc,
        project_id=str(doc.id),
        book_id=doc.book_id,
        owner_id="local",
        active_memory_version=int(doc.active_memory_version),
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


def bridge_book(doc: V1Book) -> BookDoc:
    """Project the live v1 book into the donor persistence shape."""

    status = doc.status.value if hasattr(doc.status, "value") else str(doc.status)
    return construct_document(
        BookDoc,
        book_id=str(doc.id),
        owner_id="local",
        title=doc.title,
        author=doc.author,
        original_filename=doc.original_filename or "",
        pdf_hash=doc.pdf_hash,
        pdf_storage_ref="",
        status=status,
        total_pages=doc.total_pages,
        parse_version=None,
        error_code=None,
        error_detail=doc.error_message,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


class V1BridgedRepositories(BeanieRepositories):
    """Donor repositories with book/project methods rerouted to v1 documents.

    Everything not overridden here (source units, scopes, snapshots,
    artifacts, runs, stages, series progress) uses the donor implementation
    against the seven wired collections verbatim.
    """

    # -- books: v1 Book is canonical; the v2 lane only ever reads it ---------

    async def get_book(self, book_id: str) -> BookDoc | None:
        oid = _object_id(book_id)
        if oid is None:
            return None
        doc = await V1Book.get(oid)
        return bridge_book(doc) if doc else None

    async def create_book_if_absent(self, book: BookDoc) -> tuple[BookDoc, bool]:
        raise NotImplementedError(
            "v1 owns book creation (upload/parse flow); the durable-context "
            "bridge must never write the books collection"
        )

    async def save_book(self, book: BookDoc) -> BookDoc:
        raise NotImplementedError(
            "v1 owns book persistence; the durable-context bridge must never "
            "write the books collection"
        )

    async def list_books(self, owner_id: str | None = None) -> list[BookDoc]:
        docs = await V1Book.find_all().sort(-V1Book.created_at).to_list()
        return [bridge_book(doc) for doc in docs]

    # -- projects: v1 MangaProjectDoc is canonical ---------------------------

    async def get_project(self, project_id: str) -> MangaProjectDoc | None:
        oid = _object_id(project_id)
        if oid is None:
            return None
        doc = await V1MangaProjectDoc.get(oid)
        return bridge_project(doc) if doc else None

    async def save_project(self, project: MangaProjectDoc) -> MangaProjectDoc:
        raise NotImplementedError(
            "v1 owns manga project persistence; memory-version advancement "
            "goes through advance_memory's optimistic update only"
        )

    async def advance_memory(
        self,
        project_id: str,
        expected_version: int,
        snapshot: ProjectMemorySnapshotDoc,
    ) -> bool:
        """Optimistic snapshot insert + pointer advance on the LIVE v1 doc.

        Same protocol as the donor implementation, but the compare-and-set
        targets ``manga_projects``'s v1 document. ``ensure_genesis_snapshot``
        must have materialized ``active_memory_version`` beforehand: a raw
        ``$eq`` match never sees documents missing the field.
        """

        oid = _object_id(project_id)
        if oid is None:
            return False
        try:
            await snapshot.insert()
        except Exception:  # DuplicateKeyError — same recovery as the donor
            existing = await self.get_memory_snapshot(project_id, snapshot.memory_version)
            if existing is None or existing.content_hash != snapshot.content_hash:
                return False
        result = await V1MangaProjectDoc.find_one(
            V1MangaProjectDoc.id == oid,
            V1MangaProjectDoc.active_memory_version == expected_version,
        ).update(
            {
                "$set": {
                    "active_memory_version": snapshot.memory_version,
                    "updated_at": utc_now(),
                }
            }
        )
        return bool(result.modified_count)


async def ensure_genesis_snapshot(
    repositories: MemoryRepository, project_id: str
) -> ProjectMemorySnapshotDoc:
    """Create memory snapshot v0 for a project and materialize the pointer.

    Idempotent. Returns the existing snapshot when the project already has an
    accepted memory version. On first call it also ``$set``s
    ``active_memory_version: 0`` on the v1 document so later optimistic
    advances (which match on the raw field) can see it.
    """

    from app.services.hashing import content_hash

    project = await repositories.get_project(project_id)
    if project is None:
        raise ValueError(f"manga project {project_id} does not exist")

    existing = await repositories.get_memory_snapshot(
        project_id, project.active_memory_version
    )
    if existing is not None:
        return existing
    if project.active_memory_version != 0:
        raise ValueError(
            f"project {project_id} points at memory version "
            f"{project.active_memory_version} but the snapshot is missing"
        )

    genesis_payload = {
        "project_id": project_id,
        "memory_version": 0,
        "parent_version": None,
        "book_spine": {},
        "facts": [],
        "character_state": [],
        "world_state": {},
        "continuity": {},
        "coverage": {},
        "asset_index": [],
        "source_artifact_ids": [],
    }
    snapshot = construct_document(
        ProjectMemorySnapshotDoc,
        **genesis_payload,
        content_hash=content_hash(genesis_payload),
    )
    stored = await repositories.save_memory_snapshot(snapshot)

    oid = _object_id(project_id)
    if oid is not None and isinstance(repositories, V1BridgedRepositories):
        # Materialize the pointer field on the live document (missing-field
        # documents never match the optimistic $eq in advance_memory).
        await V1MangaProjectDoc.find_one(V1MangaProjectDoc.id == oid).update(
            {"$set": {"active_memory_version": 0}}
        )
    return cast(ProjectMemorySnapshotDoc, stored)
