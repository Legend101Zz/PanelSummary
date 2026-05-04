"""Domain types for per-page composition (Phase C1).

Why this layer exists
---------------------
The original V4 page chose a layout from a 4-entry lookup table keyed on
panel count (``full / vertical / asymmetric / grid-4``). That is the
right shape for a *minimum-viable* renderer but is not how real manga
pages are composed. A real page mixes splash + medium + tall panels,
varies cell widths, anchors the page-turn beat at the right edge, and
makes the most important panel of the page LARGER, not just emphasised
in metadata.

``PageComposition`` is the typed bridge between the storyboard
("what happens on this page") and the rendered V4 page
("how the page is laid out"). It is authored by an LLM in
``page_composition_stage`` (one call per slice covering all pages) and
validated against the storyboard before reaching the renderer.

Reading-direction note
----------------------
The ``gutter_grid`` is interpreted RTL by default: cell\u00a00 of each row
is the **right-most** cell. The frontend ``V4PageRenderer`` flips with
``direction: rtl`` on the page container. Storing as RTL natively
keeps the data model honest about its primary medium (manga); LTR
rendering is a presentation-layer flag, not a separate schema.
"""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, Field, model_validator


# Hard caps. The LLM is told these in the prompt; the validator enforces
# them. Two layers of defence so a hallucinated 9-cell row never escapes
# into the renderer.
MAX_CELLS_PER_ROW = 5
MAX_ROWS_PER_PAGE = 5
TOTAL_WIDTH_PERCENT = 100


class PageGridRow(BaseModel):
    """One row of the gutter grid \u2014 a list of integer cell widths.

    Widths are integer percentages of the page width; each row sums to
    100. We use ints (not floats) on purpose: the renderer maps these to
    CSS Grid track sizes and integer percentages avoid sub-pixel
    seams between gutters.
    """

    cell_widths_pct: list[Annotated[int, Field(ge=10, le=100)]]

    @model_validator(mode="after")
    def _row_sums_to_total(self) -> "PageGridRow":
        if not self.cell_widths_pct:
            raise ValueError("a grid row must have at least one cell")
        if len(self.cell_widths_pct) > MAX_CELLS_PER_ROW:
            raise ValueError(
                f"a grid row has at most {MAX_CELLS_PER_ROW} cells; "
                f"got {len(self.cell_widths_pct)}"
            )
        total = sum(self.cell_widths_pct)
        if total != TOTAL_WIDTH_PERCENT:
            raise ValueError(
                f"row cell widths must sum to {TOTAL_WIDTH_PERCENT}%; "
                f"got {total}% ({self.cell_widths_pct})"
            )
        return self


class PageComposition(BaseModel):
    """How one storyboard page is physically laid out.

    Field-by-field rationale:

    * ``gutter_grid`` \u2014 the page is divided top-to-bottom into rows; each
      row is sliced left-to-right (which the renderer then flips to RTL)
      into cells. Cell count summed across all rows MUST equal the page's
      panel count.
    * ``panel_order`` \u2014 the storyboard panels in the order they fill the
      grid cells (row-major, RTL within each row). The validator checks
      it is a permutation of the page's panel ids; the renderer trusts
      it for placement.
    * ``page_turn_panel_id`` \u2014 the storyboard panel that should anchor
      the bottom-left of the page (the manga "page turn" beat: the last
      thing the eye sees before flipping). Optional; when None the
      renderer picks the bottom-most cell of the last row.
    * ``panel_emphasis_overrides`` \u2014 sparse map of ``panel_id \u2192 emphasis``
      that overrides the storyboard's default emphasis when the
      composition needs to promote a particular panel (e.g. give it a
      tall full-row cell to function as a splash).
    * ``composition_notes`` \u2014 short, free-form rationale the LLM wrote
      for this page. Surfaced in the QA dashboard, never read by the
      renderer.
    """

    page_index: int
    gutter_grid: list[PageGridRow] = Field(default_factory=list)
    panel_order: list[str] = Field(default_factory=list)
    page_turn_panel_id: str = ""
    panel_emphasis_overrides: dict[str, str] = Field(default_factory=dict)
    composition_notes: str = ""

    @model_validator(mode="after")
    def _structural(self) -> "PageComposition":
        if len(self.gutter_grid) > MAX_ROWS_PER_PAGE:
            raise ValueError(
                f"a page has at most {MAX_ROWS_PER_PAGE} grid rows; "
                f"got {len(self.gutter_grid)}"
            )
        cell_total = sum(len(row.cell_widths_pct) for row in self.gutter_grid)
        if cell_total != len(self.panel_order):
            raise ValueError(
                f"gutter_grid has {cell_total} cells but panel_order has "
                f"{len(self.panel_order)} entries; they must match 1:1"
            )
        # Allowed override values mirror StoryboardPanel's emphasis
        # vocabulary. We hardcode the set so a typo never silently
        # disables an override at the renderer.
        allowed = {"low", "medium", "high"}
        for panel_id, emphasis in self.panel_emphasis_overrides.items():
            if emphasis not in allowed:
                raise ValueError(
                    f"panel_emphasis_overrides['{panel_id}']={emphasis!r} "
                    f"is not one of {sorted(allowed)}"
                )
        return self

    @property
    def is_default(self) -> bool:
        """True when no LLM composition was authored (renderer falls back).

        Used by the storyboard mapper to decide whether to consult the
        composition or use ``_layout_for_panel_count`` for legacy pages.
        """
        return not self.gutter_grid


class SliceComposition(BaseModel):
    """All ``PageComposition`` rows for a single slice's pages.

    The composition stage produces ONE of these per slice (one LLM call
    covers every page in the slice). Persisted alongside the slice so
    the renderer and the QA dashboard can both read it without re-running
    the stage.
    """

    pages: list[PageComposition] = Field(default_factory=list)

    def composition_for(self, page_index: int) -> PageComposition | None:
        for comp in self.pages:
            if comp.page_index == page_index:
                return comp
        return None
