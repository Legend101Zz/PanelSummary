"""Shared prompt fragments for manga creative stages.

Per Phase A4 of the quality plan, the protagonist contract has to be
re-stamped into every prompt downstream of the bible — otherwise the
script can quietly forget who the protagonist is and what they want.
We centralise the fragment here so all stages emit identical wording
and a future tweak (different framing, different rules) lives in one
place.

DRY > clever. Two stages copying-pasting the same Markdown block is
exactly how the codebase ended up scattered the first time.
"""

from __future__ import annotations

from app.domain.manga import AdaptationPlan, BookSynopsis, CharacterVoiceCardBundle


def render_protagonist_contract_block(
    *,
    plan: AdaptationPlan,
    synopsis: BookSynopsis | None = None,
) -> str:
    """Return a compact Markdown block reinforcing the protagonist contract.

    The downstream stage drops this directly above its INPUT_JSON. We keep
    it Markdown (not JSON) because a) the LLM treats it as instructions,
    not data, and b) we want it to be visually distinct from the JSON
    payload in the prompt body.
    """
    contract = plan.protagonist_contract
    lines = [
        "PROTAGONIST CONTRACT (do not break):",
        f"- WHO: {contract.who}",
        f"- WANTS: {contract.wants}",
        f"- WHY THEY CANNOT HAVE IT: {contract.why_cannot_have_it}",
        f"- WHAT THEY DO ABOUT IT: {contract.what_they_do}",
        f"- LOGLINE: {plan.logline}",
        f"- CENTRAL THESIS: {plan.central_thesis}",
    ]
    if synopsis is not None and synopsis.emotional_arc:
        lines.append("- EMOTIONAL ARC: " + " → ".join(synopsis.emotional_arc[:5]))
    lines.append(
        "Every scene must serve at least one of: WANTS, WHY THEY CANNOT, "
        "or WHAT THEY DO. Scenes that drift into unrelated exposition are "
        "defects, not creative liberty."
    )
    return "\n".join(lines)


def render_voice_cards_block(voice_cards: CharacterVoiceCardBundle | None) -> str:
    """Return a Markdown block that contracts each character's speech style.

    Returns an empty string when no cards are present so callers can
    unconditionally splice the result into a prompt without conditional
    plumbing on the call-site (DRY).

    The block format is deliberately compact: the script stage already
    carries scene descriptions and per-panel context; voice cards are an
    additional constraint, not a replacement for the script payload.
    """
    if voice_cards is None or not voice_cards.cards:
        return ""
    lines: list[str] = [
        "VOICE CARDS (one per character; do not let two voices collapse into one):",
    ]
    for card in voice_cards.cards:
        lines.append(f"- {card.name} [{card.character_id}]")
        lines.append(f"  attitude: {card.core_attitude}")
        lines.append(f"  rhythm: {card.speech_rhythm}")
        if card.vocabulary_do:
            lines.append("  uses: " + ", ".join(card.vocabulary_do[:8]))
        if card.vocabulary_dont:
            lines.append("  avoids: " + ", ".join(card.vocabulary_dont[:6]))
        if card.example_lines:
            lines.append("  cadence anchors:")
            for example in card.example_lines[:4]:
                lines.append(f"    • \"{example}\"")
    lines.append(
        "Anchors are tone references, not lines to quote. Write fresh dialogue "
        "that matches each character's rhythm and vocabulary."
    )
    return "\n".join(lines)
