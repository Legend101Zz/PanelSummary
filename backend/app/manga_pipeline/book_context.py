"""Pipeline context dedicated to book-level (run-once-per-project) stages.

We deliberately do not reuse ``PipelineContext`` here. Per-slice context carries
30+ fields that are meaningless during book understanding (storyboard pages,
quality reports, asset specs). Sharing one giant struct across both flows would
hide which fields are valid in which phase.

Keeping this struct small means every field is *required to be relevant* during
book understanding. The persistence service is the boundary that copies
artifacts from this context into ``MangaProjectDoc`` and into the per-slice
``PipelineContext`` for the next phase.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.domain.manga import (
    AdaptationPlan,
    ArcOutline,
    BookSynopsis,
    CharacterArtDirectionBundle,
    CharacterVoiceCardBundle,
    CharacterWorldBible,
    QualityIssue,
    SourceFact,
)
from app.manga_pipeline.llm_contracts import LLMInvocationTrace, LLMModelClient


@dataclass
class BookUnderstandingResult:
    """Public result returned to the persistence layer.

    This is the explicit contract between the book-understanding pipeline and
    ``MangaProjectDoc``. If you add a new book-level artifact, add it here and
    in the persistence service that hydrates the project document.
    """

    synopsis: BookSynopsis
    fact_registry: list[SourceFact]
    adaptation_plan: AdaptationPlan
    character_bible: CharacterWorldBible
    art_direction: CharacterArtDirectionBundle
    voice_cards: CharacterVoiceCardBundle
    arc_outline: ArcOutline
    llm_traces: list[LLMInvocationTrace] = field(default_factory=list)


@dataclass
class BookUnderstandingContext:
    """Mutable context carried across book-understanding stages.

    The book stages mutate fields incrementally:
    1. ``whole_book_synopsis_stage`` populates ``synopsis``.
    2. ``book_fact_registry_stage`` populates ``fact_registry``.
    3. ``adaptation_plan_stage`` (run in book mode) populates ``adaptation_plan``.
    4. ``character_world_bible_stage`` (run in book mode) populates
       ``character_bible``.
    5. ``arc_outline_stage`` populates ``arc_outline`` using everything above.

    Each stage reads from upstream fields and validates them up-front instead
    of failing deep inside a prompt builder. This keeps the failure surface
    small and obvious.
    """

    book_id: str
    project_id: str
    book_title: str
    total_pages: int
    canonical_chapters: list[dict[str, Any]]
    options: dict[str, Any] = field(default_factory=dict)
    llm_client: LLMModelClient | None = None

    synopsis: BookSynopsis | None = None
    fact_registry: list[SourceFact] = field(default_factory=list)
    adaptation_plan: AdaptationPlan | None = None
    character_bible: CharacterWorldBible | None = None
    art_direction: CharacterArtDirectionBundle | None = None
    voice_cards: CharacterVoiceCardBundle | None = None
    arc_outline: ArcOutline | None = None

    # Phase B3: warnings (silhouette/costume clashes) the uniqueness stage
    # surfaces. Kept on the context so the orchestrator can log them and a
    # future UI can render them; we deliberately do not block the pipeline
    # because some projects (twins, body-doubles) need similar silhouettes.
    bible_warnings: list[QualityIssue] = field(default_factory=list)

    llm_traces: list[LLMInvocationTrace] = field(default_factory=list)

    def record_llm_trace(self, trace: LLMInvocationTrace) -> None:
        """Attach a model invocation trace for observability and cost tracking."""
        self.llm_traces.append(trace)

    def result(self) -> BookUnderstandingResult:
        if self.synopsis is None:
            raise RuntimeError("book understanding result requires a synopsis")
        if self.adaptation_plan is None:
            raise RuntimeError("book understanding result requires an adaptation plan")
        if self.character_bible is None:
            raise RuntimeError("book understanding result requires a character bible")
        if self.art_direction is None:
            raise RuntimeError(
                "book understanding result requires LLM-authored art direction"
            )
        if self.voice_cards is None:
            raise RuntimeError(
                "book understanding result requires LLM-authored character voice cards"
            )
        if self.arc_outline is None:
            raise RuntimeError("book understanding result requires an arc outline")
        if not self.fact_registry:
            raise RuntimeError("book understanding result requires a fact registry")
        return BookUnderstandingResult(
            synopsis=self.synopsis,
            fact_registry=list(self.fact_registry),
            adaptation_plan=self.adaptation_plan,
            character_bible=self.character_bible,
            art_direction=self.art_direction,
            voice_cards=self.voice_cards,
            arc_outline=self.arc_outline,
            llm_traces=list(self.llm_traces),
        )
