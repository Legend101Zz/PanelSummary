"""
pdf_parser.py — PDF → Canonical Book JSON
==========================================
This is the heart of the parsing pipeline.

WHAT IT DOES:
1. Takes a PDF file path
2. Uses Docling to extract structured content (chapters, sections, text)
3. Uses PyMuPDF (fitz) to extract high-quality images
4. Stores images in MongoDB GridFS
5. Returns a canonical Book object

WHY TWO LIBRARIES:
- Docling is great at STRUCTURE (what's a heading vs body vs caption)
- PyMuPDF is great at IMAGES (high DPI, handles complex layouts)
"""

import hashlib
import io
import logging
import re
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF
from PIL import Image

logger = logging.getLogger(__name__)


# ============================================================
# SHA-256 HASH — for deduplication
# If the same PDF is uploaded twice, we skip re-parsing
# ============================================================

def compute_pdf_hash(file_path: str) -> str:
    """
    Compute SHA-256 hash of a PDF file.
    WHY SHA-256: It's collision-resistant — two different files
    will never have the same hash. Perfect for deduplication.
    """
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        # Read in 8MB chunks so large PDFs don't eat all RAM
        for chunk in iter(lambda: f.read(8 * 1024 * 1024), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


# ============================================================
# IMAGE EXTRACTION — PyMuPDF
# ============================================================

def extract_images_from_pdf(
    pdf_path: str,
    min_width: int = 100,
    min_height: int = 100,
    dpi: int = 150,
) -> list[dict]:
    """
    Extract all significant images from a PDF.

    Returns list of:
    {
        "page": int,
        "image_bytes": bytes,
        "width": int,
        "height": int,
        "format": str,  # "png" or "jpeg"
    }

    WHY filter small images: PDFs are full of tiny decorative elements,
    bullets, icons. We only want real content images.
    """
    images = []
    doc = fitz.open(pdf_path)

    for page_num in range(len(doc)):
        page = doc[page_num]
        image_list = page.get_images(full=True)

        for img_index, img_ref in enumerate(image_list):
            xref = img_ref[0]
            base_image = doc.extract_image(xref)

            width = base_image["width"]
            height = base_image["height"]

            # Skip tiny images (icons, bullets, decorations)
            if width < min_width or height < min_height:
                continue

            image_bytes = base_image["image"]
            image_ext = base_image["ext"]

            # Convert to PNG for consistency (handles CMYK, weird formats)
            try:
                pil_img = Image.open(io.BytesIO(image_bytes))
                if pil_img.mode not in ("RGB", "RGBA", "L"):
                    pil_img = pil_img.convert("RGB")

                output = io.BytesIO()
                pil_img.save(output, format="PNG", optimize=True)
                final_bytes = output.getvalue()
                final_ext = "png"
            except Exception as e:
                logger.warning(f"Could not process image on page {page_num}: {e}")
                final_bytes = image_bytes
                final_ext = image_ext

            images.append({
                "page": page_num + 1,  # 1-indexed page numbers
                "image_bytes": final_bytes,
                "width": width,
                "height": height,
                "format": final_ext,
            })

    doc.close()
    return images


def render_page_thumbnail(pdf_path: str, page_num: int = 0, dpi: int = 150) -> bytes:
    """
    Render a PDF page as an image (for book covers).
    WHY: We need a cover image for the book card UI.
    """
    doc = fitz.open(pdf_path)
    page = doc[page_num]

    # Scale factor (1.0 = 72 DPI, 2.0 = 144 DPI)
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    clip = page.rect  # full page

    pix = page.get_pixmap(matrix=mat, clip=clip)
    img_bytes = pix.tobytes("png")
    doc.close()
    return img_bytes


# ============================================================
# TEXT + STRUCTURE EXTRACTION
# We use Docling when available, fall back to PyMuPDF text
# ============================================================

def extract_structure_with_docling(pdf_path: str) -> Optional[dict]:
    """
    Use Docling to extract structured content.
    Returns None if Docling is not available or fails.

    Docling returns a document with:
    - texts: list of text elements with labels (title, section_header, text, caption, etc.)
    - pictures: list of image references
    - tables: list of table elements
    """
    try:
        from docling.document_converter import DocumentConverter
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import PdfPipelineOptions

        # VIBE: Docling config for best chapter detection
        pipeline_options = PdfPipelineOptions()
        pipeline_options.do_ocr = False  # Skip OCR for speed (enable for scanned books)
        pipeline_options.do_table_structure = False  # Skip tables for speed

        converter = DocumentConverter()
        result = converter.convert(pdf_path)
        doc = result.document

        # Convert Docling document to our intermediate format
        elements = []
        for item, level in doc.iterate_items():
            label = item.label if hasattr(item, 'label') else 'text'
            text = item.text if hasattr(item, 'text') else str(item)

            if text and text.strip():
                elements.append({
                    "label": str(label),
                    "text": text.strip(),
                    "level": level,
                    "prov": getattr(item, 'prov', []),
                })

        return {"elements": elements, "source": "docling"}

    except ImportError:
        logger.warning("Docling not available, falling back to PyMuPDF text extraction")
        return None
    except Exception as e:
        logger.error(f"Docling failed: {e}, falling back to PyMuPDF")
        return None


def extract_structure_with_pymupdf(pdf_path: str) -> dict:
    """
    Fallback: Extract structure using PyMuPDF's text extraction.
    Less accurate than Docling but always works.

    Heuristic for chapter detection:
    - Large font + bold = likely a chapter title
    - ALL CAPS + standalone line = likely a heading
    """
    doc = fitz.open(pdf_path)
    elements = []

    for page_num in range(len(doc)):
        page = doc[page_num]
        blocks = page.get_text("dict")["blocks"]

        for block in blocks:
            if block["type"] != 0:  # 0 = text block
                continue

            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    text = span.get("text", "").strip()
                    if not text:
                        continue

                    font_size = span.get("size", 12)
                    font_flags = span.get("flags", 0)
                    is_bold = bool(font_flags & 2**4)

                    # Heuristic label detection
                    if font_size >= 18 and is_bold:
                        label = "section_header"
                    elif font_size >= 14:
                        label = "section_header"
                    elif text.isupper() and len(text) > 5 and len(text) < 80:
                        label = "section_header"
                    else:
                        label = "text"

                    elements.append({
                        "label": label,
                        "text": text,
                        "font_size": font_size,
                        "is_bold": is_bold,
                        "page": page_num + 1,
                    })

    doc.close()
    return {"elements": elements, "source": "pymupdf"}


# ============================================================
# CHAPTER DETECTION — the tricky part
# ============================================================

CHAPTER_PATTERNS = [
    r"^chapter\s+(\d+|[ivxlcdm]+)\b",          # "Chapter 1", "Chapter IV"
    r"^part\s+(\d+|[ivxlcdm]+)\b",             # "Part 1", "Part II"
    r"^\d+\.\s+[A-Z]",                          # "1. Introduction"
    r"^[ivxlcdm]+\.\s+[A-Z]",                  # "i. Overview" (roman numerals)
    r"^section\s+\d+",                          # "Section 3"
]


def detect_chapters(elements: list[dict]) -> list[dict]:
    """
    Given a list of text elements, detect chapter boundaries.

    Returns a list of chapters:
    [
        {
            "index": 0,
            "title": "Introduction",
            "elements": [...],  # all elements in this chapter
            "page_start": 1,
            "page_end": 15,
        }
    ]

    STRATEGY:
    1. Find all "section_header" elements
    2. Score them: is it chapter-like? (pattern matching + positioning)
    3. Group subsequent elements into chapters
    """
    chapters = []
    current_chapter = None
    chapter_index = 0

    for elem in elements:
        label = elem.get("label", "text")
        text = elem.get("text", "")

        # Check if this element looks like a chapter heading
        is_chapter_heading = False

        if label in ("section_header", "title", "chapter_header"):
            text_lower = text.lower().strip()
            for pattern in CHAPTER_PATTERNS:
                if re.match(pattern, text_lower):
                    is_chapter_heading = True
                    break

            # Also treat section headers that are short (< 80 chars) as chapters
            # unless we've already found pattern-based chapters
            if not is_chapter_heading and label == "section_header" and len(text) < 80:
                if not chapters:  # First heading becomes first chapter
                    is_chapter_heading = True
                elif len(chapters) < 50:  # Cap at 50 chapters
                    is_chapter_heading = True

        if is_chapter_heading:
            if current_chapter:
                chapters.append(current_chapter)
            current_chapter = {
                "index": chapter_index,
                "title": text,
                "elements": [],
                "page_start": elem.get("page", 1),
                "page_end": elem.get("page", 1),
            }
            chapter_index += 1
        elif current_chapter:
            current_chapter["elements"].append(elem)
            # Update end page
            elem_page = elem.get("page", 0)
            if elem_page:
                current_chapter["page_end"] = max(
                    current_chapter["page_end"], elem_page
                )

    # Don't forget the last chapter
    if current_chapter:
        chapters.append(current_chapter)

    # If no chapters detected, treat the whole book as one chapter
    if not chapters:
        logger.warning("No chapters detected, treating entire book as one chapter")
        chapters = [{
            "index": 0,
            "title": "Full Text",
            "elements": elements,
            "page_start": 1,
            "page_end": elements[-1].get("page", 1) if elements else 1,
        }]

    return chapters


def build_chapter_text(chapter: dict) -> str:
    """
    Combine all text elements in a chapter into a single string.
    WHY: LLM needs a single string to summarize.
    """
    texts = []
    for elem in chapter.get("elements", []):
        text = elem.get("text", "").strip()
        if text:
            texts.append(text)
    return "\n\n".join(texts)


# ============================================================
# MAIN ENTRY POINT
# ============================================================

def parse_pdf(pdf_path: str, progress_callback=None) -> dict:
    """
    Full PDF parsing pipeline.

    Returns canonical_book dict:
    {
        "title": str,
        "author": str | None,
        "pdf_hash": str,
        "total_pages": int,
        "chapters": [
            {
                "index": int,
                "title": str,
                "content": str,  # full text
                "page_start": int,
                "page_end": int,
                "word_count": int,
            }
        ],
        "images": [
            {
                "chapter_index": int,
                "page": int,
                "image_bytes": bytes,
                "width": int,
                "height": int,
            }
        ],
        "cover_image_bytes": bytes | None,
    }
    """
    path = Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    logger.info(f"Starting PDF parse: {path.name}")

    # Step 1: Compute hash for deduplication
    if progress_callback:
        progress_callback(5, "Computing PDF fingerprint...")
    pdf_hash = compute_pdf_hash(pdf_path)
    logger.info(f"PDF hash: {pdf_hash}")

    # Step 2: Extract structure
    if progress_callback:
        progress_callback(15, "Analyzing document structure...")

    structure = extract_structure_with_docling(pdf_path)
    if structure is None:
        structure = extract_structure_with_pymupdf(pdf_path)

    logger.info(f"Structure extracted via {structure['source']}: {len(structure['elements'])} elements")

    # Step 3: Detect chapters
    if progress_callback:
        progress_callback(35, "Detecting chapters...")

    chapters_raw = detect_chapters(structure["elements"])
    logger.info(f"Detected {len(chapters_raw)} chapters")

    # Step 4: Build chapter content
    if progress_callback:
        progress_callback(50, "Building chapter content...")

    chapters = []
    for ch in chapters_raw:
        content = build_chapter_text(ch)
        word_count = len(content.split())
        chapters.append({
            "index": ch["index"],
            "title": ch["title"],
            "content": content,
            "page_start": ch.get("page_start", 0),
            "page_end": ch.get("page_end", 0),
            "word_count": word_count,
        })

    # Step 5: Extract images
    if progress_callback:
        progress_callback(65, "Extracting images...")

    raw_images = extract_images_from_pdf(pdf_path)
    logger.info(f"Extracted {len(raw_images)} images")

    # Assign images to chapters based on page number
    images_with_chapters = []
    for img in raw_images:
        img_page = img["page"]
        # Find which chapter this page belongs to
        assigned_chapter = 0
        for ch in chapters:
            if ch["page_start"] <= img_page <= ch["page_end"]:
                assigned_chapter = ch["index"]
                break
        images_with_chapters.append({**img, "chapter_index": assigned_chapter})

    # Step 6: Cover image (first page thumbnail)
    if progress_callback:
        progress_callback(85, "Generating cover image...")

    try:
        cover_bytes = render_page_thumbnail(pdf_path, page_num=0)
    except Exception as e:
        logger.warning(f"Could not generate cover: {e}")
        cover_bytes = None

    # Step 7: Extract title and author (best-effort)
    doc_meta = fitz.open(pdf_path)
    metadata = doc_meta.metadata
    doc_meta.close()

    title = metadata.get("title", "") or path.stem
    author = metadata.get("author", "") or None
    total_pages = fitz.open(pdf_path).page_count

    if progress_callback:
        progress_callback(100, "Parsing complete!")

    return {
        "title": title,
        "author": author,
        "pdf_hash": pdf_hash,
        "total_pages": total_pages,
        "total_chapters": len(chapters),
        "total_words": sum(ch["word_count"] for ch in chapters),
        "chapters": chapters,
        "images": images_with_chapters,
        "cover_image_bytes": cover_bytes,
    }
