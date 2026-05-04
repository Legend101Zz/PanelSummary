"""Render-time composite of a manga page (Phase 4 \u2014 Panel-Craft DSL).

Why this module exists
----------------------
Before Phase 4 the renderer consumed a ``V4Page`` dict that was a *lossy*
translation of the LLM-authored ``StoryboardPanel``. The translation
threw away ``shot_type``, ``purpose``, ``composition`` prose, and
``source_fact_ids`` \u2014 exactly the editorial intent the renderer needs to
honour. Phase 4 collapses the surface: ``StoryboardPanel`` IS the panel
DSL; the renderer reads it directly.

This module supplies the **post-render composite** the rendering stage
produces. It deliberately does NOT extend ``StoryboardPanel`` with
render-time fields. Why:

* ``StoryboardPanel`` is the LLM's creative artifact. Once the
  storyboard stage writes it, the storyboard is *finished*. Adding
  mutable render fields onto it would couple two lifecycles (creative
  authoring, image generation) that should fail and be retried
  independently.
* Render artifacts are structural, not creative. They have no place in
  the storyboard contract the LLM is asked to satisfy.

Layering
--------
``RenderedPage`` composes three things:

1. ``storyboard_page`` (``StoryboardPage``) \u2014 the LLM-authored panels.
2. ``composition`` (``PageComposition`` | None) \u2014 the LLM-authored
   gutter grid + page-turn anchor. None when the composition stage gave
   up (the renderer falls back to a default vertical stack).
3. ``panel_artifacts`` (``dict[panel_id, PanelRenderArtifact]``) \u2014 the
   per-panel image-generation outputs. Pre-rendering, every panel id is
   present with an empty artifact, so callers never have to check for
   ``None`` slots; post-rendering, the same dict carries paths and
   reference-asset metadata.

Domain rules
------------
* No I/O. Pure Pydantic, importable in any layer.
* Every ``StoryboardPanel.panel_id`` MUST appear as a key in
  ``panel_artifacts``. The validator enforces this so the renderer and
  QA gate cannot disagree about the panel set.
* When ``composition`` is present, its ``panel_order`` MUST be a
  permutation of the storyboard panel ids \u2014 we already validate this
  inside ``page_composition_stage`` for the slice composition; we
  re-check it here because ``RenderedPage`` is a contract surface in
  its own right and contracts validate their inputs at the boundary.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator

from app.domain.manga.artifacts import StoryboardPage
from app.domain.manga.page_composition import PageComposition


class PanelRenderArtifact(BaseModel):
    """Per-panel output of the multimodal panel renderer.

    Default-constructible (every field has a default) so the assembly
    stage can pre-populate one entry per storyboard panel before image
    generation runs. The rendering stage then mutates the fields in
    place. Mutating-in-place is the right choice because the
    ``RenderedPage`` is the single source of truth for the slice's
    rendered state \u2014 returning a new artifact dict per panel would force
    every caller to thread the dict through manually and the merge would
    be one more chance to drop a panel.
    """

    image_path: str = ""
    image_aspect_ratio: str = ""
    used_reference_assets: list[str] = Field(default_factory=list)
    # ``requested_character_count`` is the deduplicated number of
    # character ids the panel asked for. Together with
    # ``len(used_reference_assets)`` it powers the slice-wide
    # sprite-bank hit-rate metric without re-deriving the panel's
    # character set from the storyboard.
    requested_character_count: int = 0
    # Empty string means "rendered cleanly". A non-empty error string
    # means the renderer attempted the panel but failed; the panel
    # quality gate surfaces this as a structured QualityIssue.
    error: str = ""

    @property
    def is_rendered(self) -> bool:
        """True when image generation succeeded for this panel.

        Used by the QA gate and the persistence layer to decide whether
        a panel has art to ship. ``image_path`` empty + ``error`` empty
        means the panel has not been attempted yet; both layers treat
        that as "skip", not "broken".
        """
        return bool(self.image_path) and not self.error


class RenderedPage(BaseModel):
    """One manga page \u2014 storyboard, composition, and render artifacts.

    This is the wire format. The persistence layer writes
    ``model_dump()``; the API serves it; the frontend consumes the same
    shape via mirrored TypeScript types. There is no projection,
    translation, or "viewer DTO" between the storyboard the LLM authored
    and the bytes the renderer ships. One model end-to-end.
    """

    storyboard_page: StoryboardPage
    composition: PageComposition | None = None
    panel_artifacts: dict[str, PanelRenderArtifact] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _artifact_keys_match_panels(self) -> "RenderedPage":
        panel_ids = {panel.panel_id for panel in self.storyboard_page.panels}
        artifact_ids = set(self.panel_artifacts.keys())
        missing = panel_ids - artifact_ids
        if missing:
            raise ValueError(
                "RenderedPage.panel_artifacts must include an entry for "
                f"every storyboard panel id; missing: {sorted(missing)}"
            )
        extra = artifact_ids - panel_ids
        if extra:
            raise ValueError(
                "RenderedPage.panel_artifacts has entries for unknown "
                f"panel ids (not in storyboard): {sorted(extra)}"
            )
        return self

    @model_validator(mode="after")
    def _composition_matches_storyboard(self) -> "RenderedPage":
        # ``page_composition_stage`` already coerces compositions whose
        # panel_order doesn't match the storyboard, but we re-check at
        # this contract surface because RenderedPage is also constructed
        # from persisted documents (legacy data, migrations, tests) and
        # the boundary should not trust upstream coercion.
        if self.composition is None or self.composition.is_default:
            return self
        if self.composition.page_index != self.storyboard_page.page_index:
            raise ValueError(
                "RenderedPage.composition.page_index "
                f"({self.composition.page_index}) does not match "
                f"storyboard_page.page_index ({self.storyboard_page.page_index})"
            )
        panel_ids = {panel.panel_id for panel in self.storyboard_page.panels}
        order_ids = set(self.composition.panel_order)
        if order_ids != panel_ids:
            raise ValueError(
                "RenderedPage.composition.panel_order must be a permutation "
                "of the storyboard panel ids; "
                f"missing={sorted(panel_ids - order_ids)}, "
                f"extra={sorted(order_ids - panel_ids)}"
            )
        return self

    def panels_in_reading_order(self) -> list:
        """Return the storyboard panels in the order the reader sees them.

        Manga is read top-right to bottom-left. When a composition is
        present, ``panel_order`` is the authoritative reading sequence
        (already RTL within each row). When absent, the storyboard
        author's panel order is the fallback \u2014 it is the writer's
        intended sequence and is the right default for legacy pages
        that pre-date the composition stage.
        """
        if self.composition is None or self.composition.is_default:
            return list(self.storyboard_page.panels)
        by_id = {panel.panel_id: panel for panel in self.storyboard_page.panels}
        return [by_id[panel_id] for panel_id in self.composition.panel_order if panel_id in by_id]


def empty_rendered_page(
    *, storyboard_page: StoryboardPage, composition: PageComposition | None
) -> RenderedPage:
    """Build a ``RenderedPage`` with empty artifacts for every panel.

    The rendered_page_assembly_stage uses this to construct the
    pre-render state of every page in a slice. Centralising the
    empty-artifact construction here means the assembly stage stays a
    one-liner per page and the "every panel id has an artifact slot"
    invariant has exactly one author.
    """
    artifacts = {
        panel.panel_id: PanelRenderArtifact(
            requested_character_count=len({c for c in panel.character_ids if c}),
        )
        for panel in storyboard_page.panels
    }
    return RenderedPage(
        storyboard_page=storyboard_page,
        composition=composition,
        panel_artifacts=artifacts,
    )
