"""Book-level understanding artifacts for the manga adaptation pipeline.

These models describe artifacts that are authored ONCE per project, before any
slice is generated. They are intentionally small, validated, and decoupled from
persistence concerns.

Why a separate module:
- The per-slice artifacts in ``artifacts.py`` change frequently as the pipeline
  evolves. Book-level artifacts must stay rock-stable because every slice and
  every persisted project depends on them. Keeping them in their own file
  documents that contract by location.
- Authors of new per-slice stages should not be tempted to mutate book-level
  shapes accidentally; importing from a different module raises a healthy
  speed bump.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field, field_validator, model_validator

from app.domain.manga.types import SliceRole, SourceRange


class ArcRole(str, Enum):
    """Ki-Sho-Ten-Ketsu role for one slice in the global arc.

    KI: Introduction. Ground the world, present the protagonist contract.
    SHO: Development. Build the argument, surface tension, raise stakes.
    TEN: Twist. Subvert the reader's expectation; deliver the central reveal.
    KETSU: Resolution. Land the thesis. Send the reader off with the gist.
    RECAP: Bridge slice that compresses prior beats for re-entry. Optional.
    """

    KI = "ki"
    SHO = "sho"
    TEN = "ten"
    KETSU = "ketsu"
    RECAP = "recap"


class BookSynopsis(BaseModel):
    """A grounded, single-shot understanding of the entire source PDF.

    Authored once per project. Used downstream as the stable context that every
    per-slice stage can refer to for tone, scope, and anchor concepts. It is
    deliberately NOT a marketing blurb — it must reflect what the book argues.
    """

    title: str
    author_voice: str = ""
    intended_reader: str = ""
    central_thesis: str
    logline: str
    structural_signal: str = ""
    themes: list[str] = Field(default_factory=list)
    key_concepts: list[str] = Field(default_factory=list)
    emotional_arc: list[str] = Field(default_factory=list)
    notable_evidence: list[str] = Field(default_factory=list)

    @field_validator("title", "central_thesis", "logline")
    @classmethod
    def required_fields_must_have_substance(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("title, central_thesis, and logline cannot be blank")
        return text

    @model_validator(mode="after")
    def synopsis_must_describe_a_real_argument(self) -> "BookSynopsis":
        # We require at least three signals so the synopsis is not a stub.
        # A single-line "central thesis" plus an empty themes list typically
        # means the LLM hallucinated a generic answer.
        signals = [
            self.author_voice,
            self.intended_reader,
            self.structural_signal,
            *self.themes,
            *self.key_concepts,
            *self.emotional_arc,
            *self.notable_evidence,
        ]
        non_empty = [signal for signal in signals if signal and signal.strip()]
        if len(non_empty) < 3:
            raise ValueError(
                "book synopsis is too thin: need at least three populated "
                "fields among author_voice/intended_reader/structural_signal/"
                "themes/key_concepts/emotional_arc/notable_evidence"
            )
        return self


class ArcSliceEntry(BaseModel):
    """One planned slice in the global Ki-Sho-Ten-Ketsu arc."""

    slice_number: int
    role: ArcRole
    suggested_slice_role: SliceRole
    source_range: SourceRange
    headline_beat: str
    emotional_turn: str = ""
    intellectual_turn: str = ""
    must_cover_fact_ids: list[str] = Field(default_factory=list)
    closing_hook: str = ""

    @field_validator("slice_number")
    @classmethod
    def slice_number_starts_at_one(cls, value: int) -> int:
        if value < 1:
            raise ValueError("slice_number is 1-based and must be >= 1")
        return value

    @field_validator("headline_beat")
    @classmethod
    def headline_required(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("each arc entry needs a headline beat")
        return text


class ArcOutline(BaseModel):
    """The global arc plan that drives slice ordering and roles.

    The downstream slice planner reads this and treats each entry as a
    contract: the per-slice generator must cover the listed fact IDs and end
    on the closing hook. The slicer becomes deterministic — no more drifting
    page windows that ignore the story shape.
    """

    book_id: str
    target_slice_count: int
    structure: str = "ki-sho-ten-ketsu"
    entries: list[ArcSliceEntry] = Field(default_factory=list)
    notes: str = ""

    @field_validator("book_id")
    @classmethod
    def book_id_required(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("arc outline needs a book_id")
        return value.strip()

    @field_validator("target_slice_count")
    @classmethod
    def target_slice_count_in_range(cls, value: int) -> int:
        if value < 1:
            raise ValueError("target_slice_count must be >= 1")
        if value > 24:
            # Hard ceiling: longer than this is almost always a malformed plan
            # rather than a deliberate creative choice. We surface that loudly.
            raise ValueError("target_slice_count must be <= 24")
        return value

    @model_validator(mode="after")
    def entries_must_match_target_and_be_ordered(self) -> "ArcOutline":
        if not self.entries:
            raise ValueError("arc outline needs at least one entry")
        if len(self.entries) != self.target_slice_count:
            raise ValueError(
                "arc outline entries length must equal target_slice_count "
                f"(got {len(self.entries)} != {self.target_slice_count})"
            )
        expected = list(range(1, self.target_slice_count + 1))
        actual = [entry.slice_number for entry in self.entries]
        if actual != expected:
            raise ValueError(
                "arc outline entries must be numbered 1..N in order "
                f"(got {actual})"
            )
        # Page ranges should not regress. Ranges may overlap in recap slices,
        # but page_start must move forward or stay equal.
        previous_start: int | None = None
        for entry in self.entries:
            page_start = entry.source_range.page_start
            if page_start is None:
                continue
            if previous_start is not None and page_start < previous_start:
                raise ValueError(
                    f"arc outline page ranges regress at slice {entry.slice_number} "
                    f"(page_start={page_start} < previous {previous_start})"
                )
            previous_start = page_start
        return self

    def entry_for_slice_number(self, slice_number: int) -> ArcSliceEntry | None:
        """Return the planned entry for a given 1-based slice number."""
        for entry in self.entries:
            if entry.slice_number == slice_number:
                return entry
        return None


class BookUnderstandingBundle(BaseModel):
    """Convenience aggregate for the persisted book-level artifacts.

    The pipeline does not pass this around — it lives only in the persistence
    boundary so the project document can be hydrated/serialized atomically.
    """

    synopsis: BookSynopsis
    arc_outline: ArcOutline
