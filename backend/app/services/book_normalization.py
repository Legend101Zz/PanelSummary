"""Structure-aware normalization of parsed v1 books into source units.

Issue #4 ("Structure-aware source-unit segmentation + front-matter detection")
and blueprint §7.2 Layer A. The v1 ``Book`` document holds the Docling parse as
chapters -> sections; this module turns those into immutable, provenance-rich
``SourceUnitDoc`` rows and can deterministically rebuild the exact byte string
``build_source_text_for_slice`` produces — the Phase 1 "no output change"
guarantee rides on that equality (ADR-011).

Design constraints that shaped this module:

* Segmentation follows STRUCTURE (chapter/section headings), not pages. The
  benchmark WMC parse has degenerate page provenance (every chapter reports
  pages 1-1 of a 39-page PDF), so pages cannot be the spine; they are stored
  as parsed, without correction, because provenance must never be fabricated.
* ``SourceUnitExcerpt.excerpt`` (contract) caps at 20 000 characters while v1
  sections reach ~24.5k, so long sections are split into byte-exact parts:
  concatenating the parts in unit order recovers ``section.content`` exactly.
* Donor ``ParsedChapter``/``normalize_pages`` are NOT reused for sections:
  their ``str_strip_whitespace=True`` config would silently strip boundary
  whitespace and break byte equality. Units are built with
  ``construct_document`` so text bytes are stored untouched.
* Front matter is DERIVED, never stored: classification is a pure function of
  heading + content, so no donor schema change is needed and the flag can be
  recomputed as heuristics improve.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.models import Book, BookChapter
from app.persistence.documents import SourceUnitDoc, construct_document
from app.persistence.protocols import SourceUnitRepository
from app.services.hashing import binary_content_hash, estimate_tokens

PARSE_VERSION = "v1-book-sections.1"

#: Hard cap for one unit's text. Comfortably under the 20 000-character
#: excerpt contract limit so stripped excerpts always validate.
MAX_UNIT_CHARS = 19_000

#: Conservative front-matter heading patterns (apparatus, not story).
_FRONT_MATTER_HEADINGS = re.compile(
    r"(?:^|\b)("
    r"contents|copyright|title\s*page|dedication|acknowledg\w*|preface|"
    r"foreword|praise\s+for|about\s+the\s+author|also\s+by|colophon|epigraph"
    r")(?:\b|$)",
    re.IGNORECASE,
)


def classify_front_matter(*, heading: str, content: str) -> bool:
    """Return True when a chapter/section is book apparatus, not story.

    Deliberately conservative (issue #4: front matter must be *detectable and
    skippable*, and a false positive would hide real story content from the
    default selection):

    * empty content -> front matter (nothing adaptable; catches duplicated
      title pages and bare 'Contents' headings in the WMC parse);
    * apparatus headings per ``_FRONT_MATTER_HEADINGS``.

    Back-matter marketing pages (order forms, product ads) are NOT flagged
    yet; that heuristic is future work recorded in ADR-011.
    """

    if not content.strip():
        return True
    return bool(_FRONT_MATTER_HEADINGS.search(heading))


def split_section_text(text: str, max_chars: int = MAX_UNIT_CHARS) -> list[str]:
    """Split text into parts of at most ``max_chars`` that concatenate exactly.

    Cut points prefer paragraph breaks, then line breaks, then spaces, and
    fall back to a hard cut; every character (including all whitespace) stays
    in exactly one part, so ``"".join(parts) == text`` always holds.
    """

    if max_chars < 1:
        raise ValueError("max_chars must be >= 1")
    if len(text) <= max_chars:
        return [text]

    parts: list[str] = []
    rest = text
    while len(rest) > max_chars:
        window = rest[:max_chars]
        cut = -1
        for separator in ("\n\n", "\n", " "):
            found = window.rfind(separator)
            if found > 0:
                cut = found + len(separator)  # separator stays with the left part
                break
        if cut <= 0:
            cut = max_chars
        parts.append(rest[:cut])
        rest = rest[cut:]
    if rest:
        parts.append(rest)
    return parts


@dataclass
class NormalizedSection:
    """One section's units plus derived metadata (for API/coverage views)."""

    chapter_index: int
    section_index: int
    heading_path: list[str]
    front_matter: bool
    units: list[SourceUnitDoc] = field(default_factory=list)


def normalize_book_sections(book: Book) -> list[NormalizedSection]:
    """Build section-level source units for every non-empty section.

    Unit identity is ``section_{chapter:04d}_{section:03d}_{part:02d}_{hash12}``
    where the hash is of the part's exact bytes — deterministic and idempotent
    for an unchanged parse. Empty sections yield a ``NormalizedSection`` with
    no units (they contribute only chapter headers to slice text, and there is
    no evidence to store).
    """

    normalized: list[NormalizedSection] = []
    for chapter in sorted(book.chapters, key=lambda item: item.index):
        for section_index, section in enumerate(chapter.sections):
            front = classify_front_matter(
                heading=f"{chapter.title} {section.title}",
                content=section.content,
            )
            entry = NormalizedSection(
                chapter_index=chapter.index,
                section_index=section_index,
                heading_path=[chapter.title, section.title],
                front_matter=front,
            )
            if section.content.strip():
                for part_index, part in enumerate(split_section_text(section.content)):
                    digest = binary_content_hash(part.encode("utf-8"))
                    entry.units.append(
                        construct_document(
                            SourceUnitDoc,
                            book_id=str(book.id),
                            source_unit_id=(
                                f"section_{chapter.index:04d}_{section_index:03d}"
                                f"_{part_index:02d}_{digest[:12]}"
                            ),
                            kind="section",
                            chapter_index=chapter.index,
                            heading_path=[chapter.title, section.title],
                            page_start=section.page_start,
                            page_end=section.page_end,
                            text=part,
                            text_storage_ref=None,
                            text_hash=digest,
                            token_count=estimate_tokens(part),
                            image_refs=list(section.image_ids),
                            parse_version=PARSE_VERSION,
                        )
                    )
            normalized.append(entry)
    return normalized


def source_units_for_book(book: Book) -> list[SourceUnitDoc]:
    """Flatten ``normalize_book_sections`` into the unit list to persist."""

    return [unit for entry in normalize_book_sections(book) for unit in entry.units]


async def persist_book_source_units(
    repository: SourceUnitRepository, book: Book
) -> list[SourceUnitDoc]:
    """Normalize and persist a book's source units (idempotent upsert)."""

    units = source_units_for_book(book)
    await repository.save_source_units(units)
    return units


# ---------------------------------------------------------------------------
# v1 source-text reconstruction (the Phase 1 no-output-change guarantee)
# ---------------------------------------------------------------------------


class SourceUnitMismatchError(RuntimeError):
    """Raised when stored units cannot reproduce the v1 slice text exactly."""


def _chapter_overlaps(chapter: BookChapter, page_start: int, page_end: int) -> bool:
    return chapter.page_start <= page_end and chapter.page_end >= page_start


def source_text_from_units(
    *,
    book: Book,
    page_start: int,
    page_end: int,
    units: list[SourceUnitDoc],
) -> str:
    """Rebuild ``build_source_text_for_slice`` output from stored source units.

    Walks ``book.chapters`` with exactly the v1 overlap rules (chapter headers
    come from book structure; header-only chapters stay header-only), but every
    byte of section CONTENT comes from the durable source units. A section that
    v1 would include but whose units are missing or drifted raises
    ``SourceUnitMismatchError`` — the bridge fails loud rather than silently
    changing pipeline input.
    """

    parts_by_section: dict[tuple[int, int], list[SourceUnitDoc]] = {}
    for unit in units:
        marker = unit.source_unit_id.split("_")
        if unit.kind != "section" or len(marker) < 5:
            continue
        key = (int(marker[1]), int(marker[2]))
        parts_by_section.setdefault(key, []).append(unit)
    for parts in parts_by_section.values():
        parts.sort(key=lambda item: item.source_unit_id)

    chunks: list[str] = []
    for chapter in book.chapters:
        if not _chapter_overlaps(chapter, page_start, page_end):
            continue
        header = (
            f"CHAPTER {chapter.index}: {chapter.title} "
            f"(pages {chapter.page_start}-{chapter.page_end})"
        )
        section_chunks: list[str] = []
        for section_index, section in enumerate(chapter.sections):
            if not (
                section.page_start <= page_end and section.page_end >= page_start
            ):
                continue
            if not section.content.strip():
                continue
            parts = parts_by_section.get((chapter.index, section_index))
            if not parts:
                raise SourceUnitMismatchError(
                    f"no source units for chapter {chapter.index} section "
                    f"{section_index} ({section.title!r}); normalize the book "
                    "before enabling compiled context"
                )
            content = "".join(part.text or "" for part in parts)
            if content != section.content:
                raise SourceUnitMismatchError(
                    f"source units for chapter {chapter.index} section "
                    f"{section_index} ({section.title!r}) do not match the "
                    "parsed book text; re-normalize the book"
                )
            section_chunks.append(
                f"SECTION: {section.title} "
                f"(pages {section.page_start}-{section.page_end})\n{section.content}"
            )
        if section_chunks:
            chunks.append(header + "\n" + "\n\n".join(section_chunks))
        else:
            chunks.append(header)
    return "\n\n---\n\n".join(chunks).strip()
