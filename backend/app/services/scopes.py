"""Freeze page selections as deterministic scope manifests."""

from __future__ import annotations

from datetime import datetime

from app.contracts.source import PageRange, ScopeManifest
from app.persistence.documents import ScopeManifestDoc, construct_document, utc_now
from app.persistence.protocols import MemoryRepository, ScopeRepository, SourceUnitRepository

from .errors import InvalidScopeError
from .hashing import content_hash


class ScopeService:
    def __init__(
        self,
        source_units: SourceUnitRepository,
        scopes: ScopeRepository,
        memory: MemoryRepository | None = None,
    ) -> None:
        self._source_units = source_units
        self._scopes = scopes
        self._memory = memory

    async def create(
        self,
        *,
        project_id: str,
        book_id: str,
        page_ranges: list[PageRange],
        selection_label: str,
        created_by: str,
        created_at: datetime | None = None,
    ) -> ScopeManifest:
        if self._memory is not None:
            project = await self._memory.get_project(project_id)
            if project is None or project.book_id != book_id:
                raise InvalidScopeError(
                    f"Project {project_id} does not belong to book {book_id}"
                )
        units = await self._source_units.list_source_units(book_id)
        selected = [
            unit
            for unit in units
            if any(
                unit.page_start <= page_range.page_end and unit.page_end >= page_range.page_start
                for page_range in page_ranges
            )
        ]
        if not selected:
            raise InvalidScopeError("No parsed source units overlap the selected page ranges")

        source_unit_ids = [unit.source_unit_id for unit in selected]
        normalized_ranges = sorted(
            (item.model_dump(mode="json") for item in page_ranges),
            key=lambda item: (item["page_start"], item["page_end"]),
        )
        scope_payload = {
            "project_id": project_id,
            "book_id": book_id,
            "source_unit_ids": source_unit_ids,
            "page_ranges": normalized_ranges,
            "selection_label": selection_label,
            "created_by": created_by,
        }
        scope_hash = content_hash(scope_payload)
        doc = construct_document(
            ScopeManifestDoc,
            **scope_payload,
            scope_id=f"scope_{scope_hash[:24]}",
            scope_hash=scope_hash,
            created_at=created_at or utc_now(),
        )
        stored = await self._scopes.create_scope(doc)
        return scope_contract(stored)

    async def list(self, book_id: str) -> list[ScopeManifest]:
        return [scope_contract(item) for item in await self._scopes.list_scopes(book_id)]


def scope_contract(doc: ScopeManifestDoc) -> ScopeManifest:
    return ScopeManifest.model_validate(
        {
            "schema_version": "scope-manifest.v1",
            "project_id": doc.project_id,
            "book_id": doc.book_id,
            "scope_id": doc.scope_id,
            "source_unit_ids": doc.source_unit_ids,
            "page_ranges": doc.page_ranges,
            "selection_label": doc.selection_label,
            "scope_hash": doc.scope_hash,
            "created_by": doc.created_by,
            "created_at": doc.created_at,
        }
    )
