"""Manga application services."""

from app.services.manga.source_slice_service import (
    build_page_source_slice,
    choose_next_page_slice,
)

__all__ = ["build_page_source_slice", "choose_next_page_slice"]
