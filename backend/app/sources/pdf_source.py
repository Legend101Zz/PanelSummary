"""Parse a born-digital PDF into sections and page-true source units.

This replaces the Docling/PyMuPDF-heuristic parser for the manga path.
Design rules:
- Page numbers are real 1-based PDF page numbers, never inferred.
- Sections come from the PDF outline when it has one, otherwise from
  headings detected by font size (a line clearly larger than body text).
- Units are bounded (about 250-700 words), split on paragraph boundaries,
  and each records the pages it spans. Units are what the harness cites.
- A PDF with no extractable text raises ``NoTextError`` — it is never
  silently turned into an empty book.
"""

from __future__ import annotations

import hashlib
import re
from collections import Counter
from dataclasses import asdict, dataclass, field
from pathlib import Path

import fitz  # PyMuPDF

PARSER_NAME = "pymupdf-sections.v1"
UNIT_TARGET_WORDS = 450
UNIT_MAX_WORDS = 700
UNIT_MIN_WORDS = 120


class NoTextError(ValueError):
    """The PDF has no extractable text (for example a scanned book)."""


@dataclass
class Paragraph:
    text: str
    page: int


@dataclass
class SourceUnit:
    id: str
    section_id: str
    page_start: int
    page_end: int
    word_count: int
    text: str


@dataclass
class Section:
    id: str
    title: str
    page_start: int
    page_end: int
    word_count: int
    unit_ids: list[str] = field(default_factory=list)


@dataclass
class ParsedSource:
    parser: str
    page_count: int
    title: str
    author: str
    sections: list[Section]
    units: list[SourceUnit]
    word_count: int
    content_hash: str

    def to_dict(self) -> dict:
        return asdict(self)


_WS = re.compile(r"\s+")
_HYPHEN_BREAK = re.compile(r"(\w)-\n(\w)")


def _clean(text: str) -> str:
    text = _HYPHEN_BREAK.sub(r"\1\2", text)
    text = text.replace("ﬁ", "fi").replace("ﬂ", "fl")
    return _WS.sub(" ", text).strip()


def _words(text: str) -> int:
    return len(text.split())


def _page_lines(page: fitz.Page) -> list[tuple[str, float, bool]]:
    """Return (text, max_font_size, starts_block) for each line on a page."""
    out: list[tuple[str, float, bool]] = []
    data = page.get_text("dict")
    for block in data.get("blocks", []):
        if block.get("type") != 0:
            continue
        first = True
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            text = "".join(span.get("text", "") for span in spans)
            if not text.strip():
                continue
            size = max((span.get("size", 0.0) for span in spans), default=0.0)
            out.append((text, size, first))
            first = False
        if out:
            # Mark the block boundary with an empty sentinel line.
            out.append(("", 0.0, True))
    return out


def _body_size(doc: fitz.Document) -> float:
    counter: Counter[float] = Counter()
    for page in doc:
        for text, size, _ in _page_lines(page):
            if text:
                counter[round(size, 1)] += len(text)
    if not counter:
        raise NoTextError("The PDF has no extractable text.")
    return counter.most_common(1)[0][0]


def parse_pdf(path: str | Path) -> ParsedSource:
    path = Path(path)
    raw = path.read_bytes()
    doc = fitz.open(stream=raw, filetype="pdf")
    try:
        body = _body_size(doc)
        heading_min = body * 1.3
        toc = [(level, title.strip(), page) for level, title, page in doc.get_toc(simple=True) if level == 1]

        # Collect paragraphs and heading markers in reading order.
        items: list[tuple[str, str, int]] = []  # (kind, text, page)
        for page_index, page in enumerate(doc):
            page_no = page_index + 1
            buffer: list[str] = []
            for text, size, starts_block in _page_lines(page):
                if text == "" and starts_block:
                    if buffer:
                        items.append(("para", _clean("\n".join(buffer)), page_no))
                        buffer = []
                    continue
                if not toc and size >= heading_min and len(text.strip()) <= 90 and not buffer:
                    items.append(("heading", _clean(text), page_no))
                    continue
                buffer.append(text)
            if buffer:
                items.append(("para", _clean("\n".join(buffer)), page_no))

        if toc:
            items = _apply_toc(items, toc)

        # Merge paragraphs that continue across a page break (next starts lowercase).
        merged: list[tuple[str, str, int]] = []
        for kind, text, page_no in items:
            if kind == "heading" and merged and merged[-1][0] == "heading" and merged[-1][2] == page_no:
                # A heading that wraps onto a second line.
                merged[-1] = ("heading", f"{merged[-1][1]} {text}", page_no)
                continue
            if (
                kind == "para"
                and merged
                and merged[-1][0] == "para"
                and text[:1].islower()
                and merged[-1][2] == page_no - 1
            ):
                prev_kind, prev_text, prev_page = merged[-1]
                merged[-1] = (prev_kind, f"{prev_text} {text}", prev_page)
                continue
            merged.append((kind, text, page_no))

        sections: list[Section] = []
        units: list[SourceUnit] = []
        current_title = "Opening"
        current_paras: list[Paragraph] = []

        def flush() -> None:
            nonlocal current_paras
            words = sum(_words(p.text) for p in current_paras)
            if not current_paras or (not sections and words < UNIT_MIN_WORDS):
                # Title pages and tiny front matter are not a section.
                current_paras = []
                return
            sec_id = f"s{len(sections) + 1}"
            section = Section(
                id=sec_id,
                title=current_title,
                page_start=current_paras[0].page,
                page_end=current_paras[-1].page,
                word_count=words,
            )
            for unit in _split_units(sec_id, current_paras):
                units.append(unit)
                section.unit_ids.append(unit.id)
            sections.append(section)
            current_paras = []

        title = ""
        author = ""
        for kind, text, page_no in merged:
            if kind == "heading":
                if page_no == 1 and not title and not sections:
                    title = text
                flush()
                current_title = text
                continue
            if page_no == 1 and not sections and _words(text) <= 8:
                if not title:
                    title = text
                elif not author:
                    author = re.sub(r"\s*\(\d{3,4}\)\s*$", "", text)
            current_paras.append(Paragraph(text=text, page=page_no))
        flush()

        if not units:
            raise NoTextError("The PDF has no extractable body text.")

        meta = doc.metadata or {}
        return ParsedSource(
            parser=PARSER_NAME,
            page_count=doc.page_count,
            title=(meta.get("title") or title or path.stem).strip(),
            author=(meta.get("author") or author).strip(),
            sections=sections,
            units=units,
            word_count=sum(u.word_count for u in units),
            content_hash=hashlib.sha256(raw).hexdigest(),
        )
    finally:
        doc.close()


def _apply_toc(items: list[tuple[str, str, int]], toc: list[tuple[int, str, int]]) -> list[tuple[str, str, int]]:
    """Insert outline headings before the first paragraph on each outline page."""
    by_page: dict[int, list[str]] = {}
    for _, title, page in toc:
        by_page.setdefault(page, []).append(title)
    out: list[tuple[str, str, int]] = []
    placed: set[int] = set()
    for kind, text, page_no in items:
        if page_no in by_page and page_no not in placed:
            for title in by_page[page_no]:
                out.append(("heading", title, page_no))
            placed.add(page_no)
            # Drop the paragraph that merely repeats the heading text.
            if _clean(text).lower() in {t.lower() for t in by_page[page_no]}:
                continue
        out.append((kind, text, page_no))
    return out


def _split_units(section_id: str, paras: list[Paragraph]) -> list[SourceUnit]:
    units: list[SourceUnit] = []
    buf: list[Paragraph] = []
    words = 0

    def emit() -> None:
        nonlocal buf, words
        if not buf:
            return
        text = "\n\n".join(p.text for p in buf)
        units.append(
            SourceUnit(
                id=f"{section_id}u{len(units) + 1}",
                section_id=section_id,
                page_start=buf[0].page,
                page_end=buf[-1].page,
                word_count=_words(text),
                text=text,
            )
        )
        buf, words = [], 0

    for para in paras:
        pw = _words(para.text)
        if buf and words + pw > UNIT_MAX_WORDS:
            emit()
        buf.append(para)
        words += pw
        if words >= UNIT_TARGET_WORDS:
            emit()
    if buf and units and words < UNIT_MIN_WORDS:
        # Fold a short tail into the previous unit instead of a tiny unit.
        last = units.pop()
        tail = "\n\n".join(p.text for p in buf)
        units.append(
            SourceUnit(
                id=last.id,
                section_id=section_id,
                page_start=last.page_start,
                page_end=buf[-1].page,
                word_count=last.word_count + _words(tail),
                text=f"{last.text}\n\n{tail}",
            )
        )
        buf = []
    emit()
    return units


if __name__ == "__main__":  # pragma: no cover - manual inspection helper
    import json
    import sys

    parsed = parse_pdf(sys.argv[1])
    if len(sys.argv) > 2:
        Path(sys.argv[2]).write_text(json.dumps(parsed.to_dict(), indent=2), encoding="utf-8")
    print(parsed.title, parsed.page_count, "pages", parsed.word_count, "words")
    for s in parsed.sections:
        print(f"  {s.id} {s.title!r} p{s.page_start}-{s.page_end} {s.word_count}w units={len(s.unit_ids)}")
