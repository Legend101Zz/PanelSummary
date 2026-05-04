"""Book-level character art direction stage.

Runs ONCE per project, immediately after the bible is locked. The LLM acts as
art director: given the bible, the synopsis, and the adaptation plan, it
authors a ``CharacterArtDirectionBundle`` that elaborates each character into
cinematographer-grade prompts (lens choice, lighting recipe, color story,
expression repertoire with body language).

This is the "creative" half of Phase 3. The deterministic bible visual_lock
stays as a hard constraint LAYERED ON TOP at prompt-build time — defense in
depth, not replacement. If the LLM hallucinates a costume change, the
mechanical injector still asserts the bible's visual_lock at the end of the
prompt, so the image model sees BOTH layers.

Why this is a separate stage:

* Run-once: cost is paid at book-understanding time, not per slice.
* The bible alone is too thin for the image model — "lean tall, satchel" does
  not tell the model what KIND of light, what lens, what color story.
* Keeping art direction in its own artifact means a regenerated bible (rare)
  invalidates art direction explicitly instead of subtly diverging from it.
"""

from __future__ import annotations

import json

from app.domain.manga import CharacterArtDirectionBundle
from app.manga_pipeline.book_context import BookUnderstandingContext
from app.manga_pipeline.llm_contracts import (
    LLMStageName,
    StructuredLLMRequest,
    build_json_contract_prompt,
    run_structured_llm_stage,
)


SYSTEM_PROMPT = """You are the art director for a manga adaptation studio.

You receive a FROZEN character/world bible plus the book synopsis and
adaptation plan. Your job is to elaborate every bible character into rich,
cinematographer-grade art direction that the image model can render with
intention.

Discipline:
- Author one CharacterArtDirection per bible character. Use the exact
  character_id from the bible.
- reference_sheet_prose: describe the master model sheet — pose, framing,
  background neutrality, line weight philosophy. Treat it as a brief to a
  manga artist drawing the canonical reference.
- color_story: name the limited palette and the symbolic role of each color
  for THIS character (manga is mostly black-and-white; describe ink density,
  screentone choices, and any spot-color motif).
- lighting_recipe: name the lighting setup (e.g. "high-contrast key light
  from upper-left, deep negative-space shadows on the right cheek").
- lens_recipe: focal length, depth-of-field, and framing rules
  (e.g. "85mm-equivalent, shallow DoF for emotional close-ups, medium-wide
  for action").
- expressions: at least 3 named expressions (neutral, plus 2+ that map to
  this character's specific arc beats). Each carries prose AND body_language.

Rules that fail the artifact:
- Do not invent characters not in the bible. Do not omit any bible character.
- Do not contradict the bible's visual_lock, silhouette_notes, outfit_notes,
  or hair_or_face_notes. Reference them and ELABORATE; never replace.
- Do not return placeholders, "TBD", or generic prose. Every field must be
  specific to THIS character in THIS book.

Return ONE JSON object that matches the schema exactly.
"""


def _build_user_message(context: BookUnderstandingContext) -> str:
    if context.character_bible is None:
        raise ValueError("character art direction requires a locked character_bible")
    if context.synopsis is None:
        raise ValueError("character art direction requires a synopsis")
    if context.adaptation_plan is None:
        raise ValueError("character art direction requires an adaptation plan")

    payload = {
        "project_id": context.project_id,
        "book_title": context.book_title,
        "synopsis": context.synopsis.model_dump(mode="json"),
        "adaptation_plan": context.adaptation_plan.model_dump(mode="json"),
        "character_world_bible": context.character_bible.model_dump(mode="json"),
        "options": context.options,
    }
    return (
        "Author the project's CharacterArtDirectionBundle. Honour the bible's "
        "visual_lock for every character; ELABORATE, do not replace.\n\n"
        f"INPUT_JSON:\n{json.dumps(payload, ensure_ascii=False)}\n\n"
        f"{build_json_contract_prompt(CharacterArtDirectionBundle)}"
    )


async def run(context: BookUnderstandingContext) -> BookUnderstandingContext:
    """Generate the project-wide LLM-authored character art direction."""
    if context.llm_client is None:
        raise ValueError("character art direction stage requires context.llm_client")

    request = StructuredLLMRequest(
        stage_name=LLMStageName.CHARACTER_ART_DIRECTION,
        system_prompt=SYSTEM_PROMPT,
        user_message=_build_user_message(context),
        max_tokens=int(context.options.get("art_direction_max_tokens", 6000)),
        temperature=float(context.options.get("art_direction_temperature", 0.85)),
        max_validation_attempts=int(context.options.get("llm_validation_attempts", 3)),
    )
    result = await run_structured_llm_stage(
        client=context.llm_client,
        request=request,
        output_type=CharacterArtDirectionBundle,
    )
    bundle = result.artifact

    # Cross-validate against the bible: every bible character MUST have a
    # direction, and no direction may reference an unknown character. This
    # is a contract the LLM cannot enforce on itself; we enforce it here so
    # downstream stages can trust ``art_direction.lookup`` to never return
    # None for a known character.
    bible_ids = {c.character_id for c in context.character_bible.characters}
    direction_ids = {d.character_id for d in bundle.directions}
    missing = bible_ids - direction_ids
    if missing:
        raise ValueError(
            f"art direction missing characters from the bible: {sorted(missing)}"
        )
    extra = direction_ids - bible_ids
    if extra:
        raise ValueError(
            f"art direction invented characters not in the bible: {sorted(extra)}"
        )

    context.art_direction = bundle
    context.record_llm_trace(result.trace)
    return context
