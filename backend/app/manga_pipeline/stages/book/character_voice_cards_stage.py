"""Character voice cards stage — author per-character speech contracts.

Runs ONCE per project, AFTER the global character/world bible is locked
and BEFORE the arc outline. Depends on the bible because each card is
bound to a bible character_id; runs before the arc outline because the
outline does not need voice cards but the script stage does, and we want
the cards stamped into the project document at the same persistence
boundary as the rest of the book understanding.

Why a dedicated stage rather than asking the bible LLM to also produce
voice cards:
- Two creative tasks (visual identity vs dialogue identity) compete for
  the same response budget. Splitting them lets each prompt focus.
- A future bible-revision UI can re-run voice cards without touching the
  visual lock (or vice versa). Coupling them makes that surgery harder.
"""

from __future__ import annotations

import json

from app.domain.manga import CharacterVoiceCardBundle
from app.manga_pipeline.book_context import BookUnderstandingContext
from app.manga_pipeline.llm_contracts import (
    LLMStageName,
    StructuredLLMRequest,
    build_json_contract_prompt,
    run_structured_llm_stage,
)


SYSTEM_PROMPT = """You are the dialogue editor for a manga adaptation of a
nonfiction book. The visual character bible is already locked. Your job is to
give every character a distinct SPEAKING VOICE so the script writer cannot
default to a flat encyclopedia tone.

Discipline:
- One voice card per bible character. Use the EXACT character_id from the
  bible — do not invent new characters here.
- Each card must establish:
  * core_attitude — the character's emotional default in one sentence.
  * speech_rhythm — how their lines pace (clipped, looping, fragment-and-question, etc.).
  * vocabulary_do  — 4-8 words/idioms/registers they WILL use.
  * vocabulary_dont — 3-6 words/idioms/registers they will NEVER use.
  * example_lines — 2-4 short canonical lines that demonstrate the voice.
- Voices must CONTRAST. The protagonist must not sound like the skeptic.
  If two cards read the same, you have failed.
- Ground voices in the synopsis and adaptation plan: a character whose role
  is "the embodied counter-argument" should sound combative; a mentor figure
  should sound calm and parsimonious.
- Example lines are tone anchors, not lines that will appear verbatim in the
  manga. Keep them short (under ~15 words).

Return ONE JSON object that conforms to the schema. No prose, no markdown.
"""


def _build_user_message(context: BookUnderstandingContext) -> str:
    if context.synopsis is None:
        raise ValueError("character voice cards stage requires a synopsis")
    if context.adaptation_plan is None:
        raise ValueError("character voice cards stage requires an adaptation plan")
    if context.character_bible is None:
        raise ValueError("character voice cards stage requires the character bible")

    payload = {
        "book_id": context.book_id,
        "project_id": context.project_id,
        "book_title": context.book_title,
        "synopsis": context.synopsis.model_dump(mode="json"),
        "adaptation_plan": context.adaptation_plan.model_dump(mode="json"),
        # Only feed the character list — art direction is irrelevant to voice
        # and bloats the prompt. SRP applies to LLM context too.
        "characters": [
            {
                "character_id": character.character_id,
                "name": character.name,
                "role": character.role,
                "personality": character.personality,
                "speech_style": character.speech_style,
            }
            for character in context.character_bible.characters
        ],
    }
    return (
        "Author one voice card per character below. Make their voices contrast.\n\n"
        f"INPUT_JSON:\n{json.dumps(payload, ensure_ascii=False)}\n\n"
        f"{build_json_contract_prompt(CharacterVoiceCardBundle)}"
    )


async def run(context: BookUnderstandingContext) -> BookUnderstandingContext:
    """Generate the project-wide voice card bundle."""
    if context.llm_client is None:
        raise ValueError("character voice cards stage requires context.llm_client")
    if context.character_bible is None:
        raise ValueError(
            "character voice cards stage must run AFTER the bible is authored"
        )

    request = StructuredLLMRequest(
        stage_name=LLMStageName.CHARACTER_VOICE_CARDS,
        system_prompt=SYSTEM_PROMPT,
        user_message=_build_user_message(context),
        max_tokens=int(context.options.get("voice_cards_max_tokens", 4000)),
        temperature=float(context.options.get("voice_cards_temperature", 0.85)),
        max_validation_attempts=int(context.options.get("llm_validation_attempts", 3)),
    )
    result = await run_structured_llm_stage(
        client=context.llm_client,
        request=request,
        output_type=CharacterVoiceCardBundle,
    )

    # Defense in depth: drop any cards whose character_id is not in the bible.
    # The system prompt forbids this but a stray card would silently mis-lead
    # the script stage. Better to surface a clean intersection.
    bible_ids = {c.character_id for c in context.character_bible.characters}
    cleaned = [card for card in result.artifact.cards if card.character_id in bible_ids]
    context.voice_cards = CharacterVoiceCardBundle(cards=cleaned)
    context.record_llm_trace(result.trace)
    return context
