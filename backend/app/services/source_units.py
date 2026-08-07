"""Normalize parsed chapters into immutable, provenance-rich source units."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.contracts.source import SourceUnit
from app.persistence.documents import SourceUnitDoc, construct_document
from app.persistence.protocols import SourceUnitRepository

from .hashing import content_hash, estimate_tokens


class ParsedChapter(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    chapter_index: int = Field(ge=0)
    heading_path: list[str] = Field(min_length=1, max_length=16)
    page_start: int = Field(ge=1)
    page_end: int = Field(ge=1)
    text: str = Field(min_length=1, max_length=100_000)
    image_refs: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def page_order(self) -> "ParsedChapter":
        if self.page_end < self.page_start:
            raise ValueError("page_end must not precede page_start")
        return self


class ParsedPage(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    page_number: int = Field(ge=1)
    text: str = Field(min_length=1, max_length=100_000)
    heading_path: list[str] = Field(default_factory=list, max_length=16)
    image_refs: list[str] = Field(default_factory=list)


def normalize_chapters(
    book_id: str,
    chapters: list[ParsedChapter],
    *,
    parse_version: str,
) -> list[SourceUnitDoc]:
    units: list[SourceUnitDoc] = []
    for chapter in sorted(chapters, key=lambda item: (item.chapter_index, item.page_start)):
        digest = content_hash(chapter.text)
        source_unit_id = f"chapter_{chapter.chapter_index:04d}_{digest[:12]}"
        units.append(
            construct_document(
                SourceUnitDoc,
                book_id=book_id,
                source_unit_id=source_unit_id,
                kind="chapter",
                chapter_index=chapter.chapter_index,
                heading_path=chapter.heading_path,
                page_start=chapter.page_start,
                page_end=chapter.page_end,
                text=chapter.text,
                text_hash=digest,
                token_count=estimate_tokens(chapter.text),
                image_refs=chapter.image_refs,
                parse_version=parse_version,
            )
        )
    return units


async def persist_normalized_chapters(
    repository: SourceUnitRepository,
    book_id: str,
    chapters: list[ParsedChapter],
    *,
    parse_version: str,
) -> list[SourceUnitDoc]:
    units = normalize_chapters(book_id, chapters, parse_version=parse_version)
    await repository.save_source_units(units)
    return units


def normalize_pages(
    book_id: str,
    pages: list[ParsedPage],
    *,
    parse_version: str,
) -> list[SourceUnitDoc]:
    units: list[SourceUnitDoc] = []
    for page in sorted(pages, key=lambda item: item.page_number):
        digest = content_hash(page.text)
        units.append(
            construct_document(
                SourceUnitDoc,
                book_id=book_id,
                source_unit_id=f"page_{page.page_number:05d}_{digest[:12]}",
                kind="page_window",
                chapter_index=None,
                heading_path=page.heading_path,
                page_start=page.page_number,
                page_end=page.page_number,
                text=page.text,
                text_hash=digest,
                token_count=estimate_tokens(page.text),
                image_refs=page.image_refs,
                parse_version=parse_version,
            )
        )
    return units


def source_unit_contract(doc: SourceUnitDoc) -> SourceUnit:
    return SourceUnit.model_validate(
        {
            "schema_version": "source-unit.v1",
            "book_id": doc.book_id,
            "source_unit_id": doc.source_unit_id,
            "kind": doc.kind,
            "chapter_index": doc.chapter_index,
            "heading_path": doc.heading_path,
            "page_start": doc.page_start,
            "page_end": doc.page_end,
            "text": doc.text,
            "text_storage_ref": doc.text_storage_ref,
            "text_hash": doc.text_hash,
            "token_count": doc.token_count,
            "image_refs": doc.image_refs,
            "parse_version": doc.parse_version,
        }
    )
