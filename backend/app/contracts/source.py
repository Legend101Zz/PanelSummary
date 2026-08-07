"""Immutable source evidence and frozen user-selection contracts."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, model_validator

from .base import ContentHash, ContractModel, Identifier, NonEmptyText, ShortText


class SourceRef(ContractModel):
    book_id: Identifier
    source_unit_id: Identifier
    page_start: Annotated[int, Field(ge=1)]
    page_end: Annotated[int, Field(ge=1)]
    start_offset: Annotated[int, Field(ge=0)] | None = None
    end_offset: Annotated[int, Field(ge=0)] | None = None
    quote: Annotated[str, Field(min_length=1, max_length=2_000)] | None = None
    text_hash: ContentHash

    @model_validator(mode="after")
    def validate_span(self) -> "SourceRef":
        if self.page_end < self.page_start:
            raise ValueError("page_end must be greater than or equal to page_start")
        if (self.start_offset is None) != (self.end_offset is None):
            raise ValueError("start_offset and end_offset must be supplied together")
        if (
            self.start_offset is not None
            and self.end_offset is not None
            and self.end_offset <= self.start_offset
        ):
            raise ValueError("end_offset must be greater than start_offset")
        return self


class SourceUnit(ContractModel):
    schema_version: Literal["source-unit.v1"]
    book_id: Identifier
    source_unit_id: Identifier
    kind: Literal["chapter", "section", "page_window"]
    chapter_index: Annotated[int, Field(ge=0)] | None = None
    heading_path: list[ShortText] = Field(default_factory=list, max_length=16)
    page_start: Annotated[int, Field(ge=1)]
    page_end: Annotated[int, Field(ge=1)]
    text: Annotated[str, Field(min_length=1, max_length=100_000)] | None = None
    text_storage_ref: Annotated[str, Field(min_length=1, max_length=500)] | None = None
    text_hash: ContentHash
    token_count: Annotated[int, Field(ge=0)]
    image_refs: list[Identifier] = Field(default_factory=list, max_length=256)
    parse_version: ShortText

    @model_validator(mode="after")
    def validate_source_unit(self) -> "SourceUnit":
        if self.page_end < self.page_start:
            raise ValueError("page_end must be greater than or equal to page_start")
        if (self.text is None) == (self.text_storage_ref is None):
            raise ValueError("exactly one of text or text_storage_ref is required")
        return self


class SourceUnitExcerpt(ContractModel):
    source_ref: SourceRef
    heading_path: list[ShortText] = Field(default_factory=list, max_length=16)
    excerpt: NonEmptyText
    token_count: Annotated[int, Field(ge=1)]


class PageRange(ContractModel):
    page_start: Annotated[int, Field(ge=1)]
    page_end: Annotated[int, Field(ge=1)]

    @model_validator(mode="after")
    def validate_range(self) -> "PageRange":
        if self.page_end < self.page_start:
            raise ValueError("page_end must be greater than or equal to page_start")
        return self


class ScopeManifest(ContractModel):
    schema_version: Literal["scope-manifest.v1"]
    project_id: Identifier
    book_id: Identifier
    scope_id: Identifier
    source_unit_ids: list[Identifier] = Field(min_length=1, max_length=1_000)
    page_ranges: list[PageRange] = Field(min_length=1, max_length=1_000)
    selection_label: ShortText
    scope_hash: ContentHash
    created_by: Identifier
    created_at: AwareDatetime

    @model_validator(mode="after")
    def source_units_are_unique(self) -> "ScopeManifest":
        if len(self.source_unit_ids) != len(set(self.source_unit_ids)):
            raise ValueError("source_unit_ids must be unique")
        return self
