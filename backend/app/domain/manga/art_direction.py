"""LLM-enriched art direction artifacts.

The bible (``CharacterWorldBible``) gives us the IDENTITY of a character
(name, role, visual lock, costume notes). It does not give us the
**art direction** — the cinematographer-grade language the image model needs
to render the character with intentional lighting, lens choice, color story,
and an expression repertoire that maps to the story's emotional beats.

That extra layer is what ``CharacterArtDirection`` carries. It is generated
by an LLM at book-understanding time (run-once-per-project) so every per-slice
prompt for the same character inherits identical art direction.

Phase 3 design rule: this artifact ENRICHES the bible, it does not replace it.
The bible's visual_lock fields are still spliced into prompts as a hard
constraint by ``character_sheet_planner``. Defense in depth.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator, model_validator


# Minimum substance thresholds. We keep them low enough that creative LLMs
# still pass and high enough that "vibes" responses fail loudly.
_MIN_PROSE_CHARS = 40
_MIN_EXPRESSIONS = 3


class ExpressionDirection(BaseModel):
    """One named expression with the cinematographer's intent.

    The label is a short pose key (``neutral``, ``determined``, ``distress``,
    or any other label the LLM proposes). The prose is what the image model
    reads to render that expression with intent.
    """

    label: str
    prose: str
    body_language: str = ""

    @field_validator("label")
    @classmethod
    def label_must_be_a_short_key(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if not cleaned:
            raise ValueError("expression label cannot be blank")
        if len(cleaned) > 40:
            raise ValueError("expression label must be a short key, not a sentence")
        return cleaned

    @field_validator("prose")
    @classmethod
    def prose_must_have_substance(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < _MIN_PROSE_CHARS:
            raise ValueError(
                f"expression prose must carry real art direction "
                f"(>= {_MIN_PROSE_CHARS} chars), got {len(cleaned)}"
            )
        return cleaned


class CharacterArtDirection(BaseModel):
    """LLM-authored art-direction enrichment for one bible character.

    Kept distinct from ``CharacterDesign`` (the bible) so the two layers can
    evolve independently and so a regression in art-direction prose can never
    silently mutate the bible.
    """

    character_id: str
    reference_sheet_prose: str
    color_story: str
    lighting_recipe: str
    lens_recipe: str
    expressions: list[ExpressionDirection] = Field(default_factory=list)

    @field_validator("character_id")
    @classmethod
    def character_id_required(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("character_id cannot be blank")
        return cleaned

    @field_validator("reference_sheet_prose", "color_story", "lighting_recipe", "lens_recipe")
    @classmethod
    def prose_fields_need_substance(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < _MIN_PROSE_CHARS:
            raise ValueError(
                f"art-direction prose fields must be substantive "
                f"(>= {_MIN_PROSE_CHARS} chars), got {len(cleaned)}"
            )
        return cleaned

    @model_validator(mode="after")
    def expressions_must_cover_emotional_range(self) -> "CharacterArtDirection":
        if len(self.expressions) < _MIN_EXPRESSIONS:
            raise ValueError(
                f"each character needs at least {_MIN_EXPRESSIONS} expression directions; "
                f"got {len(self.expressions)} for {self.character_id}"
            )
        labels = [exp.label for exp in self.expressions]
        if len(set(labels)) != len(labels):
            raise ValueError(
                f"duplicate expression labels for {self.character_id}: {labels}"
            )
        return self


class CharacterArtDirectionBundle(BaseModel):
    """The full per-project art-direction artifact.

    Contains one ``CharacterArtDirection`` per bible character. Validated as a
    set so a missing or stray character fails loudly (instead of producing a
    silent visual gap when the renderer can't find a character's art direction).
    """

    project_id: str
    style_anchor: str
    directions: list[CharacterArtDirection] = Field(default_factory=list)

    @field_validator("project_id")
    @classmethod
    def project_id_required(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("project_id cannot be blank")
        return cleaned

    @field_validator("style_anchor")
    @classmethod
    def style_anchor_must_have_substance(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < _MIN_PROSE_CHARS:
            raise ValueError(
                f"style_anchor must be substantive (>= {_MIN_PROSE_CHARS} chars), "
                f"got {len(cleaned)}"
            )
        return cleaned

    @model_validator(mode="after")
    def directions_must_be_unique_and_present(self) -> "CharacterArtDirectionBundle":
        if not self.directions:
            raise ValueError("art direction bundle needs at least one character")
        ids = [d.character_id for d in self.directions]
        if len(set(ids)) != len(ids):
            raise ValueError(f"duplicate character_id in art direction bundle: {ids}")
        return self

    def lookup(self, character_id: str) -> CharacterArtDirection | None:
        """Return the art direction for a given character_id, if present."""
        for direction in self.directions:
            if direction.character_id == character_id:
                return direction
        return None

    def lookup_expression(self, character_id: str, label: str) -> ExpressionDirection | None:
        """Return a named expression for a character, if present.

        Used by the per-panel renderer to attach the right body-language prose
        to the panel prompt without round-tripping through string matching.
        """
        direction = self.lookup(character_id)
        if direction is None:
            return None
        normalized = label.strip().lower()
        for expression in direction.expressions:
            if expression.label == normalized:
                return expression
        return None
