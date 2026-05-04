"""Character voice cards — per-character speech-style contracts.

Why this is its own module:
- The character bible owns IDENTITY (visual_lock, silhouette, role).
  The art direction owns RENDERING INTENT (lens, lighting, palette).
  Voice cards own DIALOGUE INTENT (vocabulary, rhythm, do/don't).
  Three concerns, three modules. SRP > one giant character object.

- Without voice cards, the script-writing LLM can name characters but
  defaults every line to a flat encyclopedia voice. The cards give it
  concrete vocabulary, rhythm, and example lines per character so the
  protagonist actually sounds different from the skeptic.

This artifact is FROZEN at book understanding time and is read-only for
every per-slice script stage.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


class CharacterVoiceCard(BaseModel):
    """A speech-style contract for one bible character.

    Fields are deliberately small. Each one feeds one specific need in
    the script prompt; if a field doesn't change how the LLM writes a
    line, it doesn't belong here.
    """

    character_id: str = Field(
        min_length=1,
        description="Bible character id this voice card is bound to.",
    )
    name: str = Field(
        min_length=1,
        description="Display name (matches the bible). Duplicated here so the\n        script prompt does not need to cross-reference the bible to render\n        the card on its own.",
    )
    core_attitude: str = Field(
        min_length=4,
        description="One-sentence summary of the character's emotional default\n        (e.g. 'Skeptical, dry, distrusts hand-wavy claims').",
    )
    speech_rhythm: str = Field(
        min_length=4,
        description="How they pace dialogue: short clipped lines, long musing\n        sentences, fragments-and-questions, etc.",
    )
    vocabulary_do: list[str] = Field(
        default_factory=list,
        description="Words, idioms, or registers this character WILL use.",
    )
    vocabulary_dont: list[str] = Field(
        default_factory=list,
        description="Words, idioms, or registers this character will NEVER use.",
    )
    example_lines: list[str] = Field(
        default_factory=list,
        description="Two to four canonical lines that demonstrate the voice.\n        These are NOT to be quoted verbatim by the script — they are tone\n        anchors so the LLM can pattern-match the cadence.",
    )

    @model_validator(mode="after")
    def _enforce_minimum_examples(self) -> "CharacterVoiceCard":
        # A voice card with zero example lines is effectively prose:
        # the LLM has nothing to imitate. Two is the floor; more is fine.
        if len(self.example_lines) < 2:
            raise ValueError(
                f"voice card for {self.character_id} requires at least 2 example_lines"
            )
        if len(self.example_lines) > 6:
            raise ValueError(
                f"voice card for {self.character_id} caps example_lines at 6 — "
                "more becomes noise in the script prompt"
            )
        return self


class CharacterVoiceCardBundle(BaseModel):
    """All voice cards for a project, keyed by character id at lookup time."""

    cards: list[CharacterVoiceCard] = Field(
        default_factory=list,
        description="One card per bible character. Order mirrors the bible's\n        character list so prompt blocks render in a stable sequence.",
    )

    @model_validator(mode="after")
    def _enforce_unique_character_ids(self) -> "CharacterVoiceCardBundle":
        seen: set[str] = set()
        for card in self.cards:
            if card.character_id in seen:
                raise ValueError(
                    f"duplicate voice card for character {card.character_id!r}"
                )
            seen.add(card.character_id)
        return self

    def card_for(self, character_id: str) -> CharacterVoiceCard | None:
        """Return the card for a character id, or None when unknown.

        We do not raise on miss because the script stage may legitimately
        reference a NAMED facade (the narrator, a one-line crowd voice)
        that has no bible entry. The caller decides whether to fall back.
        """
        for card in self.cards:
            if card.character_id == character_id:
                return card
        return None
