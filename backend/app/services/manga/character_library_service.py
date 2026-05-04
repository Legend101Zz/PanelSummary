"""Character asset library service.

Owns the project-scoped collection of ``MangaAssetDoc`` rows and provides the
idempotent surface that book-understanding (and the per-slice short-circuit)
relies on. The single invariant: **never regenerate an asset that already
exists**, because doing so wastes image-model spend AND produces a slightly
different image, breaking visual continuity.

The library is keyed by the deterministic ``asset_id`` produced by
``character_sheet_planner._stable_asset_id`` so dedupe is exact, not fuzzy.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from app.domain.manga import (
    CharacterArtDirectionBundle,
    CharacterDesign,
    CharacterWorldBible,
    MangaAssetSpec,
)
from app.manga_models import MangaAssetDoc, MangaProjectDoc
from app.services.manga.asset_image_service import (
    build_generated_asset_doc,
    build_prompt_asset_doc,
)
from app.services.manga.character_sheet_planner import (
    CharacterSheetPlanOptions,
    plan_book_character_sheets,
)


# Progress callback contract: (current, total, message) -> awaitable | None.
# Kept narrow on purpose; the wider per-slice progress contract carries an
# extra phase argument that this service does not need.
SheetProgressCallback = Callable[[int, int, str], Awaitable[None] | None]


def _asset_doc_id(doc: MangaAssetDoc) -> str:
    """Return the planner-stable asset id stored in the doc's metadata.

    We persist the planner id in ``MangaAssetDoc.metadata['asset_id']`` so the
    library can dedupe across runs without re-deriving the id from name +
    expression (which would be brittle if either was edited).
    """
    return str(doc.metadata.get("asset_id", "")) if isinstance(doc.metadata, dict) else ""


async def list_project_assets(project_id: str) -> list[MangaAssetDoc]:
    """Return every asset doc belonging to a project, oldest first.

    Stable ordering keeps UI rendering and tests deterministic.
    """
    docs = await MangaAssetDoc.find(MangaAssetDoc.project_id == project_id).to_list()
    docs.sort(key=lambda doc: doc.created_at)
    return docs


async def existing_asset_id_set(project_id: str) -> set[str]:
    """Return the set of planner-stable asset ids already persisted.

    This is what the idempotency check uses; one query, then membership tests
    in Python.
    """
    docs = await list_project_assets(project_id)
    return {asset_id for asset_id in (_asset_doc_id(doc) for doc in docs) if asset_id}


def specs_missing_from_library(
    *,
    planned_specs: list[MangaAssetSpec],
    existing_asset_ids: set[str],
) -> list[MangaAssetSpec]:
    """Return the planned specs whose asset_id is not yet in the library.

    Pure function so the per-slice short-circuit can call it without any I/O.
    """
    return [spec for spec in planned_specs if spec.asset_id not in existing_asset_ids]


def _bible_character_lookup(bible: CharacterWorldBible) -> dict[str, CharacterDesign]:
    """Return a ``character_id -> CharacterDesign`` lookup for prompt enrichment.

    The lookup lets the library service mechanically inject the bible's visual
    lock fields into every generated asset prompt, which is the whole point of
    Phase 3.
    """
    return {character.character_id: character for character in bible.characters}


async def _materialize_spec(
    *,
    project_id: str,
    spec: MangaAssetSpec,
    style: str,
    image_model: str | None,
    image_api_key: str | None,
    character_design: CharacterDesign | None,
    generate_images: bool,
) -> MangaAssetDoc:
    """Render ONE spec into a persisted ``MangaAssetDoc``.

    Image generation is opt-in: when ``generate_images`` is False (or no API
    key) we still persist a prompt-only doc so the library is COMPLETE. That
    way a user can render images later without re-planning.
    """
    if generate_images and image_api_key:
        doc = await build_generated_asset_doc(
            project_id=project_id,
            asset=spec,
            api_key=image_api_key,
            style=style,
            image_model=image_model,
            character_design=character_design,
        )
    else:
        doc = await build_prompt_asset_doc(
            project_id=project_id,
            asset=spec,
            style=style,
            image_model=image_model,
            character_design=character_design,
        )
    await doc.insert()
    return doc


async def ensure_book_character_sheets(
    *,
    project: MangaProjectDoc,
    bible: CharacterWorldBible,
    art_direction: CharacterArtDirectionBundle | None = None,
    image_api_key: str | None = None,
    progress_callback: SheetProgressCallback | None = None,
    options: CharacterSheetPlanOptions | None = None,
) -> list[MangaAssetDoc]:
    """Idempotently materialize the book-level character sheets.

    Calling twice with the same bible+art_direction is a no-op. When the bible
    introduces a new character, only that character's sheets are generated.

    The ``art_direction`` argument carries the LLM-authored rendering intent
    (lens, lighting, color story, expression repertoire). When omitted (legacy
    projects), the planner emits a degraded plan based on the bible alone.
    The bible's visual_lock is mechanically appended to every prompt either
    way.
    """
    plan = plan_book_character_sheets(
        bible=bible,
        project_id=str(project.id),
        art_direction=art_direction,
        options=options,
    )
    existing_ids = await existing_asset_id_set(str(project.id))
    todo = specs_missing_from_library(
        planned_specs=plan.assets,
        existing_asset_ids=existing_ids,
    )

    if not todo:
        # All planned sheets already exist; return the current library so the
        # caller has a uniform return shape regardless of whether work happened.
        return await list_project_assets(str(project.id))

    style = str(project.project_options.get("style", project.style))
    image_model = project.project_options.get("image_model")
    image_model_str = str(image_model) if image_model else None
    generate_images = bool(project.project_options.get("generate_images"))

    if generate_images and not image_api_key:
        raise ValueError(
            "generate_images is enabled on the project but no image_api_key was provided "
            "to ensure_book_character_sheets"
        )

    character_lookup = _bible_character_lookup(bible)
    total = len(todo)
    for index, spec in enumerate(todo, start=1):
        character_design = character_lookup.get(spec.character_id)
        await _materialize_spec(
            project_id=str(project.id),
            spec=spec,
            style=style,
            image_model=image_model_str,
            image_api_key=image_api_key,
            character_design=character_design,
            generate_images=generate_images,
        )
        if progress_callback is not None:
            result: Any = progress_callback(index, total, spec.asset_id)
            if hasattr(result, "__await__"):
                await result

    return await list_project_assets(str(project.id))


async def asset_specs_for_project(
    *,
    project: MangaProjectDoc,
    bible: CharacterWorldBible,
    art_direction: CharacterArtDirectionBundle | None = None,
) -> list[MangaAssetSpec]:
    """Return the typed spec list that matches the project's persisted library.

    The per-slice ``character_asset_plan_stage`` consumes this as its
    short-circuit input: when the plan equals what is already persisted, no
    LLM call is needed. We intentionally rebuild specs from the planner (not
    from the docs) so the spec list always carries the freshest visual_lock
    prose if the bible was unlocked + edited (which today only happens
    behind a force flag, but the design supports it).
    """
    plan = plan_book_character_sheets(
        bible=bible,
        project_id=str(project.id),
        art_direction=art_direction,
    )
    return list(plan.assets)


async def regenerate_asset_doc(
    *,
    project: MangaProjectDoc,
    bible: CharacterWorldBible,
    asset_doc: MangaAssetDoc,
    image_api_key: str | None,
    art_direction: CharacterArtDirectionBundle | None = None,
) -> MangaAssetDoc | None:
    """Re-render a single asset, replacing the persisted doc in place.

    Used by the sprite-quality gate (auto-retry on failure) and by the
    Character Library UI (user-triggered regenerate). Returns the new
    document, or ``None`` if regeneration cannot run because image
    generation is not enabled for this project.

    Implementation notes:
    * We rebuild the spec from the planner so the freshest visual_lock
      and art-direction prose flow into the prompt. Reusing the persisted
      prompt would freeze a regenerated asset to whatever wording the
      original generation used — the opposite of what "regenerate" means.
    * We delete the old document AFTER the new one is built so a failure
      mid-flight cannot orphan a project with no asset for the character.
    * ``regen_count`` and ``pinned`` are carried forward from the old
      doc; the user's pin must survive a regen, and the count is part of
      the cost story.
    """
    if not bool(project.project_options.get("generate_images")):
        # No image-generation entitlement; nothing to regenerate against.
        # The gate handles None by leaving the asset as-is.
        return None
    if not image_api_key:
        return None

    plan = plan_book_character_sheets(
        bible=bible,
        project_id=str(project.id),
        art_direction=art_direction,
    )
    target_spec: MangaAssetSpec | None = None
    for spec in plan.assets:
        # asset_id is the planner's stable identifier and is what the
        # quality gate keys off. Match on it (NOT on character_id +
        # expression alone) so multi-angle reference sheets do not collide.
        spec_id = spec.asset_id
        existing_id = asset_doc.metadata.get("asset_id") if isinstance(asset_doc.metadata, dict) else None
        if existing_id and spec_id == existing_id:
            target_spec = spec
            break
    if target_spec is None:
        # The planner no longer plans this asset (e.g. bible was edited
        # and the character was removed). Nothing to regenerate against.
        return None

    style = str(project.project_options.get("style", project.style))
    image_model = project.project_options.get("image_model")
    image_model_str = str(image_model) if image_model else None
    character_design = _bible_character_lookup(bible).get(target_spec.character_id)

    new_doc = await build_generated_asset_doc(
        project_id=str(project.id),
        asset=target_spec,
        api_key=image_api_key,
        style=style,
        image_model=image_model_str,
        character_design=character_design,
    )
    # Carry forward the user-managed fields. Status is intentionally NOT
    # carried over; the gate will rescore the new bytes.
    new_doc.pinned = asset_doc.pinned
    new_doc.regen_count = asset_doc.regen_count + 1

    # Persist new BEFORE deleting old so a crash mid-flight leaves the
    # project with two assets for the character (loud, fixable) instead
    # of zero (silent, breaks panel rendering).
    await new_doc.insert()
    try:
        await asset_doc.delete()
    except Exception:  # noqa: BLE001 — stale delete is acceptable
        # If the old doc was already deleted by a concurrent regenerate
        # call, that's fine. We logged via the audit trail.
        pass
    return new_doc
