"""Rendering-lane artifact contracts promoted with the reader-v2 consumer.

Session 5 shipped ``page_art`` / ``composed_page`` / ``provider_receipt``
as ArtifactDoc rows with schema-version STRINGS only, deferring registry
promotion to the first consumer (ADR-012 S5 addendum, decision c). The
Session 6 reader-v2 seam is that consumer; ``qa_report`` (Session 6,
issue #7) rides along. Shapes mirror the persisting code in
``manga_page_art_stage.py`` exactly; fields added after Session 5
(``composition_version``, ``image_content_hash``) are OPTIONAL because
accepted Session 5 rows are immutable evidence and must keep validating.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, JsonValue

from .base import ContentHash, ContractModel, Identifier, ShortText


class PageArtConditioning(ContractModel):
    skeleton: ShortText
    compiler_hash: ContentHash
    character_references: list[ShortText] = Field(default_factory=list, max_length=16)


class PageArtSlicingEntry(ContractModel):
    bbox: dict[str, float]
    clip_path: ShortText
    read_rank: Annotated[int, Field(ge=0)]
    mask_hash: ContentHash


class PageArt(ContractModel):
    """Accepted text-free lane-C art for one page (page-art.v1)."""

    schema_version: Literal["page-art.v1"]
    page_art_version: ShortText
    page_plan_id: Identifier
    page_index: Annotated[int, Field(ge=0, le=999)]
    rendering_mode: Literal["A", "B", "C"]
    image_model: ShortText
    attempt: Annotated[int, Field(ge=1)]
    cost_usd: Annotated[float, Field(ge=0)]
    conditioning: PageArtConditioning
    gates: dict[str, JsonValue]
    slicing_map: dict[str, PageArtSlicingEntry]
    receipt_artifact_id: Identifier


class ComposedPage(ContractModel):
    """Deterministically composed, code-lettered page (composed-page.v1)."""

    schema_version: Literal["composed-page.v1"]
    page_plan_id: Identifier
    page_index: Annotated[int, Field(ge=0, le=999)]
    has_art: bool
    lettering: ShortText
    text_element_count: Annotated[int, Field(ge=0)]
    page_art_artifact_id: Identifier | None = None
    #: Session 6 additions — optional so immutable Session 5 rows validate.
    composition_version: ShortText | None = None
    image_content_hash: ContentHash | None = None


class ProviderReceipt(ContractModel):
    """One provider call — image or vision, success or failure
    (provider-receipt.v1). Persisted for EVERY call including no-image
    refusals; ``response_text`` carries the refusal body."""

    schema_version: Literal["provider-receipt.v1"]
    purpose: ShortText
    provider: ShortText
    model: ShortText
    request: dict[str, JsonValue]
    usage: dict[str, JsonValue] | None = None
    cost_usd: Annotated[float, Field(ge=0)]
    latency_ms: Annotated[int, Field(ge=0)]
    error: Annotated[str, Field(min_length=1, max_length=8_000)] | None = None
    response_text: Annotated[str, Field(min_length=1, max_length=8_000)] | None = None
    n_images: Annotated[int, Field(ge=0)]
    at: ShortText


class QaReport(ContractModel):
    """Durable per-attempt gate verdict (qa-report.v1, Session 6 issue #7):
    accepted AND rejected attempts persist their full gate state."""

    schema_version: Literal["qa-report.v1"]
    page_plan_id: Identifier
    page_index: Annotated[int, Field(ge=0, le=999)]
    attempt: Annotated[int, Field(ge=1)]
    gate_policy_version: ShortText
    accepted: bool
    gates: dict[str, JsonValue]
    at: ShortText
