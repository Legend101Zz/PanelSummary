"""Bible silhouette / costume uniqueness check (Phase B3).

Manga readers identify characters by silhouette long before they read
faces or hair. If the bible says two characters are "tall, scarred,
with a long coat", the renderer cannot make them visually distinct no
matter how good the image model is.

This module is a pure function. It analyses the bible's character
designs, computes a token-overlap signature per character, and returns
``QualityIssue`` rows when any pair shares too much identifying language.

Used by ``bible_silhouette_uniqueness_stage`` (book-level) so the gate
fires once, before any sprite is generated.

Heuristic only \u2014 no LLM. The cost of a false positive is "the bible
author has to add one distinguishing trait". The cost of a false
negative (two look-alike characters making it to the panel) is the
reader losing the plot.
"""

from __future__ import annotations

import re

from app.domain.manga import CharacterDesign, CharacterWorldBible, QualityIssue


# Words too generic to count as identifying. Kept short on purpose: this
# list grows over time, but every entry needs to be a word so common it
# would otherwise generate false positives across most projects.
GENERIC_TOKENS: frozenset[str] = frozenset(
    {
        "the",
        "a",
        "an",
        "and",
        "or",
        "with",
        "of",
        "to",
        "in",
        "on",
        "for",
        "is",
        "as",
        "at",
        "by",
        "from",
        "into",
        "this",
        "that",
        "their",
        "his",
        "her",
        "its",
        "long",
        "short",
        "tall",
        "wears",
        "wearing",
        "always",
        "often",
        "very",
        "small",
        "large",
        "young",
        "old",
        "average",
        "plain",
        "neutral",
        "simple",
        "look",
        "looks",
        "appearance",
        "appears",
        "character",
        "manga",
    }
)

# Two characters whose identifying tokens overlap by at least this many
# words are flagged. We chose 4 because that's the smallest overlap that
# tends to actually look like the same silhouette (e.g. both share
# "scarred", "coat", "scar", "left").
DEFAULT_MIN_SHARED_TOKENS = 4


def _tokenize_identity(character: CharacterDesign) -> set[str]:
    """Extract the set of identifying tokens for one character.

    We pull from ``visual_lock``, ``silhouette_notes``, ``outfit_notes``,
    and ``hair_or_face_notes``. Personality and role are excluded \u2014 a
    "mentor" character can be visually anything.
    """
    sources = " ".join(
        [
            character.visual_lock,
            character.silhouette_notes,
            character.outfit_notes,
            character.hair_or_face_notes,
        ]
    )
    # Lower-case alphanumeric word tokens. We strip punctuation so
    # "long-coat" becomes {"long", "coat"} \u2014 better signal for overlap.
    tokens = {
        word.lower()
        for word in re.findall(r"[A-Za-z]+", sources)
        if len(word) >= 3
    }
    return tokens - GENERIC_TOKENS


def find_silhouette_clashes(
    bible: CharacterWorldBible,
    *,
    min_shared_tokens: int = DEFAULT_MIN_SHARED_TOKENS,
) -> list[QualityIssue]:
    """Return one QualityIssue per pair of characters that look too alike.

    Issue code is ``BIBLE_SILHOUETTE_CLASH``. Severity is ``warning`` \u2014
    the bible author can either add a distinguishing trait or accept the
    risk. We deliberately do NOT make this an error; some projects
    (twins, body-double reveals) NEED similar silhouettes by design.
    """
    issues: list[QualityIssue] = []
    characters = list(bible.characters)
    for i, char_a in enumerate(characters):
        tokens_a = _tokenize_identity(char_a)
        for char_b in characters[i + 1 :]:
            tokens_b = _tokenize_identity(char_b)
            shared = tokens_a & tokens_b
            if len(shared) >= min_shared_tokens:
                issues.append(
                    QualityIssue(
                        severity="warning",
                        code="BIBLE_SILHOUETTE_CLASH",
                        message=(
                            f"Characters '{char_a.character_id}' and "
                            f"'{char_b.character_id}' share "
                            f"{len(shared)} identifying tokens "
                            f"({sorted(shared)}); they may read as the same "
                            "silhouette to the reader."
                        ),
                        artifact_id=f"{char_a.character_id}|{char_b.character_id}",
                    )
                )
    return issues
