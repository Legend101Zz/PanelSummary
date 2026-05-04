"""Creative artifact contracts for the manga adaptation pipeline.

These are the canonical handoff documents between stages:
PDF understanding → adaptation plan → bible → beats → script → storyboard → V4.
The renderer should never have to invent the story. That job belongs here.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field, field_validator, model_validator

from app.domain.manga.types import MangaAssetSpec, SourceFact


class EmotionalTone(str, Enum):
    CURIOUS = "curious"
    TENSE = "tense"
    REVELATORY = "revelatory"
    REFLECTIVE = "reflective"
    TRIUMPHANT = "triumphant"
    MELANCHOLIC = "melancholic"
    PLAYFUL = "playful"


class ShotType(str, Enum):
    EXTREME_WIDE = "extreme_wide"
    WIDE = "wide"
    MEDIUM = "medium"
    CLOSE_UP = "close_up"
    EXTREME_CLOSE_UP = "extreme_close_up"
    INSERT = "insert"
    SYMBOLIC = "symbolic"


class PanelPurpose(str, Enum):
    SETUP = "setup"
    EXPLANATION = "explanation"
    EMOTIONAL_TURN = "emotional_turn"
    REVEAL = "reveal"
    TRANSITION = "transition"
    RECAP = "recap"
    TO_BE_CONTINUED = "to_be_continued"


class ProtagonistContract(BaseModel):
    """Answers the core manga-writing questions."""

    who: str
    wants: str
    why_cannot_have_it: str
    what_they_do: str

    @field_validator("who", "wants", "why_cannot_have_it", "what_they_do")
    @classmethod
    def required_story_answer(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("protagonist contract answers cannot be blank")
        return value.strip()


class AdaptationPlan(BaseModel):
    """Global story plan for adapting a PDF into manga."""

    title: str
    logline: str
    central_thesis: str
    protagonist_contract: ProtagonistContract
    important_fact_ids: list[str] = Field(default_factory=list)
    emotional_journey: list[str] = Field(default_factory=list)
    intellectual_journey: list[str] = Field(default_factory=list)
    memorable_metaphors: list[str] = Field(default_factory=list)
    structure: str = "ki-sho-ten-ketsu"
    slice_strategy: str = "opening -> expandable middle -> finale"

    @model_validator(mode="after")
    def plan_has_gist_backbone(self) -> "AdaptationPlan":
        if not self.title.strip():
            raise ValueError("adaptation plan needs a title")
        if not self.logline.strip():
            raise ValueError("adaptation plan needs a logline")
        if not self.central_thesis.strip():
            raise ValueError("adaptation plan needs a central thesis")
        if not self.important_fact_ids:
            raise ValueError("adaptation plan needs important source facts")
        return self


class SourceFactExtraction(BaseModel):
    """LLM-extracted source facts for one manga generation slice."""

    slice_id: str
    facts: list[SourceFact] = Field(default_factory=list)
    extraction_notes: str = ""

    @model_validator(mode="after")
    def extraction_needs_grounded_facts(self) -> "SourceFactExtraction":
        if not self.slice_id.strip():
            raise ValueError("source fact extraction needs a slice_id")
        if not self.facts:
            raise ValueError("source fact extraction needs at least one fact")
        mismatched = [fact.fact_id for fact in self.facts if fact.source_slice_id != self.slice_id]
        if mismatched:
            raise ValueError("all extracted facts must reference the extraction slice_id")
        return self


class CharacterDesign(BaseModel):
    character_id: str
    name: str
    role: str
    represents: str = ""
    personality: str = ""
    strengths: list[str] = Field(default_factory=list)
    flaws: list[str] = Field(default_factory=list)
    visual_lock: str
    silhouette_notes: str = ""
    outfit_notes: str = ""
    hair_or_face_notes: str = ""
    speech_style: str = ""

    @field_validator("character_id", "name", "role", "visual_lock")
    @classmethod
    def character_identity_required(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("character identity fields cannot be blank")
        return value.strip()


class CharacterWorldBible(BaseModel):
    """Reusable visual/story bible for all slices in one project."""

    world_summary: str
    visual_style: str
    recurring_motifs: list[str] = Field(default_factory=list)
    characters: list[CharacterDesign] = Field(default_factory=list)
    palette_notes: str = ""
    lettering_notes: str = "Readable manga lettering, sparse bubbles, strong hierarchy."

    @model_validator(mode="after")
    def bible_needs_reusable_designs(self) -> "CharacterWorldBible":
        if not self.world_summary.strip():
            raise ValueError("world bible needs a world summary")
        if not self.visual_style.strip():
            raise ValueError("world bible needs a visual style")
        if not self.characters:
            raise ValueError("world bible needs at least one character")
        return self


class CharacterAssetPlan(BaseModel):
    """LLM-authored plan for reusable character/image-model assets."""

    project_id: str
    assets: list[MangaAssetSpec] = Field(default_factory=list)
    consistency_notes: str = ""

    @model_validator(mode="after")
    def asset_plan_needs_prompts(self) -> "CharacterAssetPlan":
        if not self.project_id.strip():
            raise ValueError("character asset plan needs a project_id")
        if not self.assets:
            raise ValueError("character asset plan needs at least one asset")
        missing_prompts = [asset.asset_id for asset in self.assets if not asset.prompt.strip()]
        if missing_prompts:
            raise ValueError("every character asset needs an image-model prompt")
        return self


class Beat(BaseModel):
    beat_id: str
    source_fact_ids: list[str] = Field(default_factory=list)
    story_function: str
    emotional_turn: str = ""
    intellectual_turn: str = ""
    open_thread_id: str | None = None
    resolves_thread_id: str | None = None

    @model_validator(mode="after")
    def beat_must_do_something(self) -> "Beat":
        if not self.beat_id.strip():
            raise ValueError("beat_id cannot be blank")
        if not self.story_function.strip():
            raise ValueError("beat needs a story function")
        if not self.source_fact_ids and not self.open_thread_id and not self.resolves_thread_id:
            raise ValueError("beat must reference facts or story threads")
        return self


class BeatSheet(BaseModel):
    slice_id: str
    slice_role: str
    beats: list[Beat] = Field(default_factory=list)
    local_opening_hook: str = ""
    local_closing_hook: str = ""

    @field_validator("beats")
    @classmethod
    def beat_sheet_needs_beats(cls, value: list[Beat]) -> list[Beat]:
        if not value:
            raise ValueError("beat sheet needs at least one beat")
        return value


class ScriptLine(BaseModel):
    speaker_id: str
    text: str
    intent: str = ""
    source_fact_ids: list[str] = Field(default_factory=list)

    @field_validator("text")
    @classmethod
    def dialogue_should_be_brief(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("script line text cannot be blank")
        if len(text) > 180:
            raise ValueError("script line is too long for a manga bubble")
        return text


class MangaScriptScene(BaseModel):
    scene_id: str
    beat_ids: list[str]
    location: str
    scene_goal: str
    action: str
    dialogue: list[ScriptLine] = Field(default_factory=list)
    narration: list[str] = Field(default_factory=list)
    emotional_tone: EmotionalTone = EmotionalTone.CURIOUS

    @model_validator(mode="after")
    def scene_needs_content(self) -> "MangaScriptScene":
        if not self.scene_id.strip():
            raise ValueError("scene_id cannot be blank")
        if not self.beat_ids:
            raise ValueError("scene must map to at least one beat")
        if not self.action.strip():
            raise ValueError("scene needs action")
        if not self.dialogue and not self.narration:
            raise ValueError("scene needs dialogue or narration")
        return self


class MangaScript(BaseModel):
    slice_id: str
    scenes: list[MangaScriptScene] = Field(default_factory=list)
    recap_scene_id: str | None = None
    to_be_continued: bool = False

    @field_validator("scenes")
    @classmethod
    def script_needs_scenes(cls, value: list[MangaScriptScene]) -> list[MangaScriptScene]:
        if not value:
            raise ValueError("manga script needs scenes")
        return value


class StoryboardPanel(BaseModel):
    panel_id: str
    scene_id: str
    purpose: PanelPurpose
    shot_type: ShotType
    composition: str
    action: str = ""
    dialogue: list[ScriptLine] = Field(default_factory=list)
    narration: str = ""
    source_fact_ids: list[str] = Field(default_factory=list)
    character_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def panel_needs_readable_content(self) -> "StoryboardPanel":
        if not self.panel_id.strip():
            raise ValueError("panel_id cannot be blank")
        if not self.scene_id.strip():
            raise ValueError("scene_id cannot be blank")
        if not self.composition.strip():
            raise ValueError("panel needs composition guidance")
        if not (self.action.strip() or self.dialogue or self.narration.strip()):
            raise ValueError("panel needs action, dialogue, or narration")
        return self


class StoryboardPage(BaseModel):
    page_id: str
    page_index: int
    panels: list[StoryboardPanel] = Field(default_factory=list)
    page_turn_hook: str = ""
    reading_flow: str = "top-right to bottom-left"

    @model_validator(mode="after")
    def page_needs_manga_flow(self) -> "StoryboardPage":
        if self.page_index < 0:
            raise ValueError("page_index cannot be negative")
        if not self.panels:
            raise ValueError("storyboard page needs panels")
        if len(self.panels) > 7:
            raise ValueError("too many panels for a readable manga page")
        return self


class StoryboardArtifact(BaseModel):
    """LLM-authored page thumbnails/storyboard for one manga source slice."""

    slice_id: str
    pages: list[StoryboardPage] = Field(default_factory=list)
    thumbnail_notes: str = ""

    @model_validator(mode="after")
    def storyboard_needs_pages_and_stable_indices(self) -> "StoryboardArtifact":
        if not self.slice_id.strip():
            raise ValueError("storyboard artifact needs a slice_id")
        if not self.pages:
            raise ValueError("storyboard artifact needs at least one page")
        expected = list(range(len(self.pages)))
        actual = [page.page_index for page in self.pages]
        if actual != expected:
            raise ValueError("storyboard page_index values must be contiguous from 0")
        return self


class QualityIssue(BaseModel):
    severity: str
    code: str
    message: str
    artifact_id: str = ""


class QualityReport(BaseModel):
    passed: bool
    issues: list[QualityIssue] = Field(default_factory=list)
    grounded_fact_ids: list[str] = Field(default_factory=list)
    missing_fact_ids: list[str] = Field(default_factory=list)
    notes: str = ""
