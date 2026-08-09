# Contract deltas for real-manga rendering — proposals (2026-08-07)

Additive schema/renderer proposals closing the gaps between the ADR-009 v2 contract
(`ScrollStack backend/app/contracts/manga.py`) and a professional reference page
(One Piece ch.1187 class). Tracked in [#5](https://github.com/Legend101Zz/PanelSummary/issues/5);
all deltas are additive with defaults preserving current behavior.

## 1. Character breakout (sprite crossing its panel frame)

The reference page's most manga-defining trick: a character's head/body overlaps the
gutter, popping out of its panel. Today every sprite is clipped by
`CompiledPanelGeometry.clip_path`.

```python
class SpriteLayer(ContractModel):
    ...
    breakout: Literal["none", "top", "leading", "trailing", "any"] = "none"
    # renderer: breakout sprites render unclipped ABOVE the frame stroke of their
    # own panel but BELOW text layers; compiler emits an unclipped overflow budget
    # (max 12% of panel height beyond the border) so validators can bound it.
```

Validator: breakout allowed only on `importance in {high, page_turn}` panels; never on
two adjacent panels (visual noise guard).

## 2. Bubbles crossing panel borders

Real pages let bubbles sit on gutters and span sibling panels. Today `TextElement`
placement is panel-scoped.

```python
class TextElement(ContractModel):
    ...
    anchor_panel_id: Identifier                 # read-order owner (exists today as its panel)
    overflow_panel_ids: list[Identifier] = []   # NEW: panels the bubble may visually cover
    # compiler validates: overflow panels are adjacent to anchor panel AND the bubble's
    # placed box intersects the anchor panel by >= 55% so reading order stays unambiguous.
```

Read-order rule stays intact: the bubble is *read* with its anchor panel; overflow is
purely visual. Face-occlusion validator (#10, MangaFlow criterion) applies across all
covered panels.

## 3. SFX lettering treatments (deterministic, never image-model text)

`kind: "sfx"` + `shape: "free_sfx"` exist; the renderer needs treatments:

```python
class SfxTreatment(ContractModel):
    preset: Literal["impact_arc", "taper_diagonal", "tremble", "burst_radial", "drip"]
    path: Literal["arc_up", "arc_down", "diagonal", "straight"] = "straight"
    warp_intensity: Annotated[float, Field(ge=0, le=1)] = 0.5
    fill: Literal["solid", "outline", "halftone"] = "outline"
```

Rendered as SVG text-on-path with stroke/fill pairs in the deterministic lettering
engine (the reference's FWUP/WOING/SPOINK class). Fonts from a pinned lettering set.

## 4. Panel background treatments (tone/speedline/emotion vocabulary)

Book-Reel v1 already has a vector-scene layer (`backend/app/domain/manga/vector_scene.py`,
`frontend .../VectorSceneLayer.tsx` from `visual-upgrade-phase-v`). Wire it into v2 as:

```python
class PanelBackdrop(ContractModel):
    treatment: Literal["none", "screentone_dots", "screentone_gradient",
                       "speedlines_radial", "speedlines_horizontal",
                       "emotion_flowers", "dark_aura", "flat_black"] = "none"
    intensity: Annotated[float, Field(ge=0, le=1)] = 0.5
```

Selected by the composer per panel tempo/emotion; rendered under sprites, over lane-C art
only when the panel has no generated art (generated pages carry their own tones).

## 5. Layout templates (see `layout-templates/layout-template-library.md`)

New `layout-template.v1` contract + template store + agent tools
(`list_layout_templates`, template-id + slot-map + bounded nudges in the page plan).
`freeform_panel` remains the guarded exception path.

## 6. Mask export for conditioned generation (#12)

```python
class CompiledPanelGeometry(ContractModel):
    ...
    mask_ref: str | None = None   # NEW: storage ref to a rasterized per-panel mask
    # emitted by the compiler alongside clip_path; consumed by lane C/D generation
    # (page-level conditioning today, regional/ComfyUI generation later).
```

## Sequencing

1+2 (breakout, cross-border bubbles) are renderer+validator work on existing artifacts —
highest visual payoff per effort. 3+4 are deterministic-renderer features. 5+6 land with
the template store and the #12 mechanism decision.
