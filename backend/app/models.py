"""
models.py — MongoDB Document Schemas
=====================================
These are the "shapes" of documents stored in MongoDB.
Think of each class as a table definition in a regular database.

We use Beanie ODM (Object Document Mapper) which lets us write
Python classes that automatically map to MongoDB collections.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Optional
from beanie import Document, Indexed
from pydantic import BaseModel, Field
from bson import ObjectId


# ============================================================
# ENUMS — fixed sets of allowed values
# ============================================================

class ProcessingStatus(str, Enum):
    PENDING = "pending"         # Job created, not started
    PARSING = "parsing"         # PDF being parsed by Docling
    PARSED = "parsed"           # Parsing done, ready for summarization
    SUMMARIZING = "summarizing" # LLM generating canonical summary
    GENERATING = "generating"   # Creating manga panels + reel scripts
    COMPLETE = "complete"       # Everything done!
    FAILED = "failed"           # Something went wrong


class SummaryStyle(str, Enum):
    MANGA = "manga"             # Shonen energy, speech bubbles, action panels
    NOIR = "noir"               # Dark, atmospheric, film noir aesthetic
    MINIMALIST = "minimalist"   # Clean, whitespace, scholarly
    COMEDY = "comedy"           # Fun, emoji-heavy, meme energy
    ACADEMIC = "academic"       # Formal, structured, citation-style


# ============================================================
# SUB-MODELS — nested objects inside documents
# ============================================================

class BookSection(BaseModel):
    """A single section/subsection within a chapter"""
    title: str
    content: str
    page_start: int
    page_end: int
    image_ids: list[str] = []   # GridFS image IDs extracted from this section


class BookChapter(BaseModel):
    """A chapter extracted from the PDF"""
    index: int                  # Chapter number (0-based)
    title: str
    sections: list[BookSection] = []
    page_start: int
    page_end: int
    word_count: int = 0


class MangaPanel(BaseModel):
    """A single panel in the manga reader (LEGACY — kept for backward compat)"""
    panel_index: int
    layout: str = "single"
    caption: Optional[str] = None
    dialogue: list[dict] = []
    visual_description: str
    image_id: Optional[str] = None
    panel_type: str = "scene"


# ── NEW PAGE-BASED LAYOUT SYSTEM ─────────────────────────────
# Each manga "page" is a CSS grid. The LLM chooses the grid layout
# and fills each cell with content (narration, dialogue, splash, data).
# Images are RARE (max 1 splash per chapter) — most panels are typography.

class PagePanel(BaseModel):
    """A single cell within a manga page grid"""
    position: str               # grid area: "main" | "top" | "bottom" | "left" | "right" | "tl" | "tr" | "bl" | "br" | "side-top" | "side-bottom" | "middle" | "top-left" | "top-right" | "bottom-left" | "bottom-right"
    content_type: str           # "narration" | "dialogue" | "splash" | "data" | "transition"
    text: Optional[str] = None  # main text (for narration, data, transition)
    dialogue: list[dict] = []   # [{"character": "name", "text": "..."}] for dialogue panels
    visual_mood: str = ""       # CSS bg mood: "dramatic-dark" | "warm-amber" | "cool-mystery" | "intense-red" | "calm-green" | "ethereal-purple"
    character: Optional[str] = None    # character name for sprite rendering
    expression: str = "neutral"        # sprite expression: neutral | curious | shocked | determined | wise | thoughtful | excited
    image_prompt: Optional[str] = None # ONLY for splash panels — AI image gen prompt
    image_id: Optional[str] = None     # filled after image generation


class MangaPage(BaseModel):
    """A full manga page — a CSS grid filled with panels"""
    page_index: int
    layout: str = "full"  # "full" | "2-row" | "3-row" | "2-col" | "L-shape" | "T-shape" | "grid-4"
    panels: list[PagePanel] = []


class MangaChapterSummary(BaseModel):
    """Manga-format summary for one chapter — page-based layout"""
    chapter_index: int
    chapter_title: str
    pages: list[MangaPage] = []             # NEW: page grid layouts
    panels: list[MangaPanel] = []           # LEGACY: old single-panel format
    style: SummaryStyle
    generated_at: datetime = Field(default_factory=datetime.utcnow)


class ReelLesson(BaseModel):
    """A single reel (TikTok-style lesson card)"""
    reel_index: int
    chapter_index: int
    lesson_title: str           # "The 3 Core Principles of X"
    hook: str                   # Opening line (first 3 seconds)
    key_points: list[str]       # Bullet points shown as animated text
    visual_theme: str           # Background + color scheme description
    duration_seconds: int = 45  # Target length
    style: SummaryStyle


class CanonicalChapterSummary(BaseModel):
    """The ONE source of truth for a chapter's summary — everything derives from this"""
    chapter_index: int
    chapter_title: str
    one_liner: str              # 1 sentence summary
    key_concepts: list[str]     # 3-7 main ideas
    narrative_summary: str      # 2-3 paragraph summary
    memorable_quotes: list[str] = []
    action_items: list[str] = []


class CharacterProfile(BaseModel):
    """A recurring character in the manga adaptation"""
    name: str
    role: str                   # protagonist | mentor | narrator | antagonist | inner_voice
    visual_description: str     # How to draw them — used in image gen prompts
    speech_style: str           # How they talk
    represents: str = ""        # What concept/perspective they embody


class ChapterPlan(BaseModel):
    """Per-chapter visual and narrative plan from the manga bible"""
    chapter_index: int
    mood: str = ""              # mysterious | triumphant | tense | reflective | revelatory
    dramatic_beat: str = ""     # The key moment for manga purposes
    image_theme: str = ""       # What AI images should depict in this chapter
    panel_emphasis: str = ""    # dialogue-heavy | action sequences | quiet reflection


class MangaBible(BaseModel):
    """
    The visual and narrative 'bible' for the entire manga adaptation.
    Created once per book — all chapter panels derive consistency from this.
    """
    world_description: str = ""     # The visual world/setting
    color_palette: str = ""         # Colors, mood, lighting style
    characters: list[CharacterProfile] = []
    recurring_motifs: list[str] = []  # Visual symbols that repeat across chapters
    chapter_plans: list[ChapterPlan] = []


# ============================================================
# MAIN DOCUMENTS — stored in MongoDB collections
# ============================================================

class Book(Document):
    """
    A parsed book. Created when PDF upload completes.

    MongoDB collection: 'books'
    """
    # Identification
    title: str
    original_filename: Optional[str] = None   # e.g. "atomic-habits.pdf"
    author: Optional[str] = None
    pdf_hash: Indexed(str, unique=True)  # type: ignore  # SHA-256 hash for dedup
    pdf_gridfs_id: Optional[str] = None  # kept for schema compat, unused

    # Metadata
    total_pages: int = 0
    total_chapters: int = 0
    total_words: int = 0
    cover_image_id: Optional[str] = None  # First page as cover

    # Content
    chapters: list[BookChapter] = []

    # Status tracking
    status: ProcessingStatus = ProcessingStatus.PENDING
    celery_task_id: Optional[str] = None  # So we can poll job progress
    error_message: Optional[str] = None
    parse_progress: int = 0              # 0-100 percentage

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "books"   # MongoDB collection name


class BookSummary(Document):
    """
    The AI-generated summary for a book.
    Derived from the canonical chapter summaries.

    MongoDB collection: 'book_summaries'
    """
    book_id: Indexed(str)  # type: ignore  # References Book._id
    style: SummaryStyle

    # The canonical summaries — ONE per chapter, everything else derives from these
    canonical_chapters: list[CanonicalChapterSummary] = []

    # Agent pipeline outputs
    manga_bible: Optional[MangaBible] = None  # Whole-book visual/narrative bible

    # Generated outputs (derived from canonical + bible)
    manga_chapters: list[MangaChapterSummary] = []
    reels: list[ReelLesson] = []

    # Generation options
    model: Optional[str] = None             # LLM model used
    chapter_range: Optional[list[int]] = None  # [start, end] chapter indices; None = all
    generate_images: bool = False           # Whether to run AI image generation per panel

    # Status
    status: ProcessingStatus = ProcessingStatus.PENDING
    celery_task_id: Optional[str] = None
    error_message: Optional[str] = None

    # Cost tracking
    total_tokens_used: int = 0
    estimated_cost_usd: float = 0.0

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "book_summaries"


class JobStatus(Document):
    """
    Tracks the status of background jobs.
    Frontend polls /status/{job_id} to show progress bar.

    MongoDB collection: 'job_statuses'
    """
    celery_task_id: Indexed(str, unique=True)  # type: ignore
    job_type: str          # "parse_pdf" | "summarize" | "generate_manga" | "generate_reels"
    status: str            # "pending" | "progress" | "success" | "failure"
    progress: int = 0      # 0-100
    message: str = ""      # Human-readable status message
    result_id: Optional[str] = None  # ID of the created Book or BookSummary
    error: Optional[str] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "job_statuses"
