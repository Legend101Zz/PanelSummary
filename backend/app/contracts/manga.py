"""Source-grounded manga planning and deterministic reader contracts."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, JsonValue, model_validator

from .base import ContentHash, ContractModel, Identifier, NonEmptyText, ShortText, UnitInterval
from .context import CharacterStateUpdate, GroundedFact, StoryThreadUpdate, TerminologyUpdate
from .source import SourceRef


class CharacterIntent(ContractModel):
    character_id: Identifier
    intent: NonEmptyText
    emotional_state: ShortText


class AdaptationBeat(ContractModel):
    beat_id: Identifier
    sequence: Annotated[int, Field(ge=0)]
    source_refs: list[SourceRef] = Field(min_length=1, max_length=128)
    required_fact_ids: list[Identifier] = Field(default_factory=list, max_length=128)
    narrative_purpose: Literal[
        "hook", "setup", "conflict", "explanation", "reveal", "payoff", "cliffhanger"
    ]
    book_essence: NonEmptyText
    dramatization: NonEmptyText
    character_intent: list[CharacterIntent] = Field(default_factory=list, max_length=64)
    visual_intent: list[ShortText] = Field(min_length=1, max_length=64)
    must_preserve: list[NonEmptyText] = Field(min_length=1, max_length=128)
    may_compress: list[NonEmptyText] = Field(default_factory=list, max_length=128)
    confidence: UnitInterval


class MangaPlan(ContractModel):
    schema_version: Literal["manga-plan.v1"]
    plan_id: Identifier
    project_id: Identifier
    scope_id: Identifier
    context_pack_id: Identifier
    memory_version: Annotated[int, Field(ge=0)]
    title: ShortText
    summary: NonEmptyText
    target_page_count: Annotated[int, Field(ge=1, le=100)]
    beats: list[AdaptationBeat] = Field(min_length=1, max_length=1_000)
    character_state_updates: list[CharacterStateUpdate] = Field(default_factory=list, max_length=256)
    terminology_updates: list[TerminologyUpdate] = Field(default_factory=list, max_length=256)
    new_facts: list[GroundedFact] = Field(default_factory=list, max_length=1_000)
    ending_state: NonEmptyText
    unresolved_thread_updates: list[StoryThreadUpdate] = Field(default_factory=list, max_length=256)

    @model_validator(mode="after")
    def validate_plan(self) -> "MangaPlan":
        beat_ids = [beat.beat_id for beat in self.beats]
        if len(beat_ids) != len(set(beat_ids)):
            raise ValueError("beat ids must be unique")
        if [beat.sequence for beat in self.beats] != list(range(len(self.beats))):
            raise ValueError("beat sequence values must be contiguous from zero")
        if len(self.character_state_updates) != len(
            {item.character_id for item in self.character_state_updates}
        ):
            raise ValueError("character state updates must be unique by character_id")
        if len(self.terminology_updates) != len(
            {item.canonical_form for item in self.terminology_updates}
        ):
            raise ValueError("terminology updates must be unique by canonical_form")
        if len(self.new_facts) != len({item.fact_id for item in self.new_facts}):
            raise ValueError("new facts must be unique by fact_id")
        return self


class DialogueLine(ContractModel):
    speaker_id: Identifier
    text: Annotated[str, Field(min_length=1, max_length=1_000)]
    delivery: ShortText | None = None


class LayoutBoxPct(ContractModel):
    x_pct: Annotated[float, Field(ge=0, le=100)]
    y_pct: Annotated[float, Field(ge=0, le=100)]
    width_pct: Annotated[float, Field(gt=0, le=100)]
    height_pct: Annotated[float, Field(gt=0, le=100)]

    @model_validator(mode="after")
    def fits_container(self) -> "LayoutBoxPct":
        if self.x_pct + self.width_pct > 100:
            raise ValueError("x_pct + width_pct must be <= 100")
        if self.y_pct + self.height_pct > 100:
            raise ValueError("y_pct + height_pct must be <= 100")
        return self


class CropHint(ContractModel):
    crop_id: Identifier
    box_pct: LayoutBoxPct
    subject: ShortText


class StoryboardPanel(ContractModel):
    panel_id: Identifier
    scene_id: Identifier
    beat_ids: list[Identifier] = Field(min_length=1, max_length=32)
    purpose: Literal[
        "establishing", "action", "dialogue", "reaction", "explanation", "reveal", "transition"
    ]
    shot_type: Literal[
        "extreme_wide", "wide", "medium", "close_up", "extreme_close_up", "over_shoulder", "insert"
    ]
    composition: NonEmptyText
    action: NonEmptyText | None = None
    dialogue: list[DialogueLine] = Field(default_factory=list, max_length=16)
    narration: list[Annotated[str, Field(min_length=1, max_length=1_000)]] = Field(
        default_factory=list, max_length=8
    )
    source_refs: list[SourceRef] = Field(min_length=1, max_length=128)
    source_fact_ids: list[Identifier] = Field(default_factory=list, max_length=128)
    character_ids: list[Identifier] = Field(default_factory=list, max_length=32)
    visual_asset_ids: list[Identifier] = Field(default_factory=list, max_length=32)
    emotional_tone: ShortText

    @model_validator(mode="after")
    def has_readable_content(self) -> "StoryboardPanel":
        if self.action is None and not self.dialogue and not self.narration:
            raise ValueError("panel needs action, dialogue, or narration")
        speakers = {line.speaker_id for line in self.dialogue}
        if not speakers.issubset(set(self.character_ids)):
            raise ValueError("every dialogue speaker must appear in character_ids")
        return self


class StoryboardPage(ContractModel):
    page_id: Identifier
    page_index: Annotated[int, Field(ge=0)]
    panels: list[StoryboardPanel] = Field(min_length=1, max_length=7)
    page_turn_hook: Annotated[str, Field(max_length=1_000)] = ""
    reading_flow: Literal["top-right to bottom-left", "top-left to bottom-right"] = (
        "top-right to bottom-left"
    )

    @model_validator(mode="after")
    def panel_ids_are_unique(self) -> "StoryboardPage":
        ids = [panel.panel_id for panel in self.panels]
        if len(ids) != len(set(ids)):
            raise ValueError("panel ids must be unique within a page")
        return self


class PanelPlacement(ContractModel):
    bbox_pct: LayoutBoxPct
    z_index: Annotated[int, Field(ge=0, le=100)] = 0
    bleed_edges: list[Literal["top", "right", "bottom", "left"]] = Field(
        default_factory=list, max_length=4
    )


class SpriteLayer(ContractModel):
    character_id: Identifier
    asset_id: Identifier
    expression: ShortText = "neutral"
    bbox_pct: LayoutBoxPct
    z_index: Annotated[int, Field(ge=0, le=100)] = 20
    opacity: UnitInterval = 1.0
    flip_x: bool = False


class BubblePlacement(ContractModel):
    line_index: Annotated[int, Field(ge=0)]
    speaker_id: Identifier
    bbox_pct: LayoutBoxPct
    tail_side: Literal["left", "right", "bottom", "top"] = "bottom"
    tail_offset_pct: Annotated[float, Field(ge=0, le=100)] = 50
    variant: Literal["speech", "thought", "shout"] = "speech"
    z_index: Annotated[int, Field(ge=0, le=100)] = 40


class PageComposition(ContractModel):
    page_index: Annotated[int, Field(ge=0)]
    panel_order: list[Identifier] = Field(min_length=1, max_length=7)
    panel_placements: dict[Identifier, PanelPlacement] = Field(min_length=1, max_length=7)
    sprite_layers: dict[Identifier, list[SpriteLayer]] = Field(default_factory=dict, max_length=7)
    bubble_placements: dict[Identifier, list[BubblePlacement]] = Field(default_factory=dict, max_length=7)
    page_turn_panel_id: Identifier | None = None
    gutter_px: Annotated[int, Field(ge=0, le=32)] = 6
    composition_notes: Annotated[str, Field(max_length=2_000)] = ""

    @model_validator(mode="after")
    def validate_composition_keys(self) -> "PageComposition":
        panel_ids = set(self.panel_order)
        if len(panel_ids) != len(self.panel_order):
            raise ValueError("panel_order must not contain duplicates")
        if set(self.panel_placements) != panel_ids:
            raise ValueError("panel_placements must cover panel_order exactly")
        if not set(self.sprite_layers).issubset(panel_ids):
            raise ValueError("sprite_layers references an unknown panel")
        if not set(self.bubble_placements).issubset(panel_ids):
            raise ValueError("bubble_placements references an unknown panel")
        if self.page_turn_panel_id is not None and self.page_turn_panel_id not in panel_ids:
            raise ValueError("page_turn_panel_id must reference panel_order")
        return self


class PanelRenderArtifact(ContractModel):
    asset_id: Identifier | None = None
    aspect_ratio: Annotated[str, Field(pattern=r"^[1-9][0-9]*:[1-9][0-9]*$")] | None = None
    used_reference_asset_ids: list[Identifier] = Field(default_factory=list, max_length=32)
    requested_character_count: Annotated[int, Field(ge=0)] = 0
    render_status: Literal["not_requested", "rendered", "failed"] = "not_requested"
    error_code: Identifier | None = None

    @model_validator(mode="after")
    def validate_render_result(self) -> "PanelRenderArtifact":
        if self.render_status == "rendered" and self.asset_id is None:
            raise ValueError("rendered panel artifacts require asset_id")
        if self.render_status == "failed" and self.error_code is None:
            raise ValueError("failed panel artifacts require error_code")
        if self.render_status != "failed" and self.error_code is not None:
            raise ValueError("error_code is only valid for failed panel artifacts")
        return self


class RenderedPage(ContractModel):
    schema_version: Literal["rendered-page.v1"]
    storyboard_page: StoryboardPage
    composition: PageComposition | None = None
    panel_artifacts: dict[Identifier, PanelRenderArtifact] = Field(min_length=1, max_length=7)

    @model_validator(mode="after")
    def validate_layers(self) -> "RenderedPage":
        panels = {panel.panel_id: panel for panel in self.storyboard_page.panels}
        panel_ids = set(panels)
        if set(self.panel_artifacts) != panel_ids:
            raise ValueError("panel_artifacts must cover storyboard panels exactly")
        if self.composition is None:
            return self
        if self.composition.page_index != self.storyboard_page.page_index:
            raise ValueError("composition page_index must match storyboard page_index")
        if set(self.composition.panel_order) != panel_ids:
            raise ValueError("composition panel_order must cover storyboard panels exactly")
        for panel_id, sprites in self.composition.sprite_layers.items():
            known_characters = set(panels[panel_id].character_ids)
            if any(sprite.character_id not in known_characters for sprite in sprites):
                raise ValueError("sprite layer character must be present in its storyboard panel")
        for panel_id, bubbles in self.composition.bubble_placements.items():
            dialogue = panels[panel_id].dialogue
            for bubble in bubbles:
                if bubble.line_index >= len(dialogue):
                    raise ValueError("bubble line_index is outside panel dialogue")
                if dialogue[bubble.line_index].speaker_id != bubble.speaker_id:
                    raise ValueError("bubble speaker_id must match the dialogue line")
        return self


class NormalizedPoint(ContractModel):
    x: UnitInterval
    y: UnitInterval


class NormalizedBox(ContractModel):
    x: UnitInterval
    y: UnitInterval
    width: Annotated[float, Field(gt=0, le=1)]
    height: Annotated[float, Field(gt=0, le=1)]

    @model_validator(mode="after")
    def fits_page(self) -> "NormalizedBox":
        if self.x + self.width > 1:
            raise ValueError("x + width must be <= 1")
        if self.y + self.height > 1:
            raise ValueError("y + height must be <= 1")
        return self


class PageCanvas(ContractModel):
    width_px: Annotated[int, Field(ge=320, le=16_384)]
    height_px: Annotated[int, Field(ge=320, le=16_384)]
    trim: NormalizedBox
    safe: NormalizedBox
    bleed_pct: Annotated[float, Field(ge=0, le=0.1)] = 0

    @model_validator(mode="after")
    def safe_area_is_inside_trim(self) -> "PageCanvas":
        if (
            self.safe.x < self.trim.x
            or self.safe.y < self.trim.y
            or self.safe.x + self.safe.width > self.trim.x + self.trim.width
            or self.safe.y + self.safe.height > self.trim.y + self.trim.height
        ):
            raise ValueError("safe area must be contained by trim")
        return self


class PanelCamera(ContractModel):
    shot: Literal[
        "extreme_wide",
        "wide",
        "medium",
        "close_up",
        "extreme_close_up",
        "insert",
        "pov",
    ]
    angle: Literal["eye", "high", "low", "dutch", "over_shoulder"] = "eye"
    movement: Literal["static", "pan", "push_in", "pull_out", "tracking"] = "static"


class SubjectBlocking(ContractModel):
    subject_ref: Identifier
    pose: ShortText
    expression: ShortText
    anchor: NormalizedPoint
    scale: Annotated[float, Field(gt=0, le=2)] = 1
    facing: Literal["left", "right", "front", "away"] = "front"
    depth: Literal["foreground", "midground", "background"] = "midground"


class PanelMotion(ContractModel):
    direction: ShortText | None = None
    speed: ShortText | None = None
    effects: list[ShortText] = Field(default_factory=list, max_length=16)


class PageScriptPanel(ContractModel):
    panel_id: Identifier
    purpose: Literal["setup", "action", "reaction", "reveal", "transition", "insert", "payoff"]
    story_beat: NonEmptyText
    importance: Literal["low", "medium", "high", "page_turn"]
    tempo: Literal["hold", "normal", "quick", "impact"]
    camera: PanelCamera
    blocking: list[SubjectBlocking] = Field(default_factory=list, max_length=32)
    environment_ref: Identifier | None = None
    prop_refs: list[Identifier] = Field(default_factory=list, max_length=32)
    focal_regions: list[NormalizedBox] = Field(default_factory=list, max_length=16)
    avoid_text_regions: list[NormalizedBox] = Field(default_factory=list, max_length=16)
    motion: PanelMotion = Field(default_factory=PanelMotion)
    source_refs: list[SourceRef] = Field(min_length=1, max_length=128)
    source_fact_ids: list[Identifier] = Field(default_factory=list, max_length=128)


class TextTypography(ContractModel):
    font_token: Identifier
    weight: Annotated[int, Field(ge=100, le=900)] = 500
    min_px: Annotated[int, Field(ge=8, le=128)] = 18
    max_px: Annotated[int, Field(ge=8, le=256)] = 48
    emphasis: Literal["normal", "bold", "whisper", "shout"] = "normal"

    @model_validator(mode="after")
    def font_range_is_ordered(self) -> "TextTypography":
        if self.min_px > self.max_px:
            raise ValueError("min_px must be <= max_px")
        return self


class TextTailTarget(ContractModel):
    subject_ref: Identifier | None = None
    point: NormalizedPoint


class TextElement(ContractModel):
    text_id: Identifier
    panel_id: Identifier
    kind: Literal["dialogue", "thought", "narration", "monologue", "sfx"]
    content: Annotated[str, Field(min_length=1, max_length=1_000)]
    speaker_ref: Identifier | None = None
    emotion: ShortText | None = None
    writing_direction: Literal["horizontal", "vertical"] = "horizontal"
    shape: Literal["oval", "round_rect", "thought_cloud", "jagged", "caption", "free_sfx"]
    preferred_region: NormalizedBox
    tail_target: TextTailTarget | None = None
    typography: TextTypography
    overflow: Literal["fit", "reflow", "split", "reject"] = "reject"
    z_index: Annotated[int, Field(ge=0, le=1_000)] = 40

    @model_validator(mode="after")
    def speaker_and_tail_are_coherent(self) -> "TextElement":
        if self.kind == "dialogue" and self.speaker_ref is None:
            raise ValueError("dialogue requires speaker_ref")
        if self.kind in {"narration", "sfx"} and self.tail_target is not None:
            raise ValueError("narration and sfx cannot have a tail_target")
        return self


class PageScript(ContractModel):
    page_id: Identifier
    page_index: Annotated[int, Field(ge=0, le=999)]
    page_kind: Literal["standard", "splash", "spread_left", "spread_right"] = "standard"
    entry_state: NonEmptyText
    exit_state: NonEmptyText
    page_turn_panel_id: Identifier | None = None
    panels: list[PageScriptPanel] = Field(min_length=1, max_length=12)
    text_elements: list[TextElement] = Field(default_factory=list, max_length=64)

    @model_validator(mode="after")
    def validate_script_graph(self) -> "PageScript":
        panel_ids = [panel.panel_id for panel in self.panels]
        if len(panel_ids) != len(set(panel_ids)):
            raise ValueError("page-script panel IDs must be unique")
        known = set(panel_ids)
        if self.page_turn_panel_id is not None and self.page_turn_panel_id not in known:
            raise ValueError("page_turn_panel_id must reference a page-script panel")
        text_ids = [item.text_id for item in self.text_elements]
        if len(text_ids) != len(set(text_ids)):
            raise ValueError("page-script text IDs must be unique")
        if any(item.panel_id not in known for item in self.text_elements):
            raise ValueError("every text element must reference a page-script panel")
        return self


class PageScriptSet(ContractModel):
    schema_version: Literal["page-script-set.v1"]
    script_set_id: Identifier
    project_id: Identifier
    plan_artifact_id: Identifier
    context_pack_id: Identifier
    pages: list[PageScript] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_page_sequence(self) -> "PageScriptSet":
        page_ids = [page.page_id for page in self.pages]
        if len(page_ids) != len(set(page_ids)):
            raise ValueError("page IDs must be unique")
        if [page.page_index for page in self.pages] != list(range(len(self.pages))):
            raise ValueError("page indices must be contiguous from zero")
        all_panels = [panel.panel_id for page in self.pages for panel in page.panels]
        if len(all_panels) != len(set(all_panels)):
            raise ValueError("panel IDs must be unique across the script set")
        return self


class PanelLayoutNode(ContractModel):
    kind: Literal["panel"]
    node_id: Identifier
    panel_id: Identifier


class SplitGutter(ContractModel):
    value: Annotated[float, Field(ge=0, le=0.1)]
    unit: Literal["page_pct"] = "page_pct"


class SplitLayoutNode(ContractModel):
    kind: Literal["split"]
    node_id: Identifier
    axis: Literal["x", "y"]
    ratios: list[Annotated[float, Field(gt=0, le=100)]] = Field(min_length=2, max_length=12)
    gutter: SplitGutter
    angle_deg: Annotated[float, Field(ge=-18, le=18)] = 0
    children: list["LayoutNode"] = Field(min_length=2, max_length=12)

    @model_validator(mode="after")
    def ratios_cover_children(self) -> "SplitLayoutNode":
        if len(self.ratios) != len(self.children):
            raise ValueError("split ratios must cover children exactly")
        return self


class OverlayInset(ContractModel):
    node: "LayoutNode"
    anchor: Literal["top_left", "top_right", "bottom_left", "bottom_right", "center"]
    box: NormalizedBox
    z_index: Annotated[int, Field(ge=1, le=1_000)]
    border_style: Literal["standard", "borderless", "broken"] = "standard"


class OverlayLayoutNode(ContractModel):
    kind: Literal["overlay"]
    node_id: Identifier
    base: "LayoutNode"
    insets: list[OverlayInset] = Field(min_length=1, max_length=8)


class FreeformPanelLayoutNode(ContractModel):
    kind: Literal["freeform_panel"]
    node_id: Identifier
    panel_id: Identifier
    polygon: list[NormalizedPoint] = Field(min_length=3, max_length=16)
    exception_reason: NonEmptyText


LayoutNode = Annotated[
    PanelLayoutNode | SplitLayoutNode | OverlayLayoutNode | FreeformPanelLayoutNode,
    Field(discriminator="kind"),
]


class ReadingEdge(ContractModel):
    from_panel_id: Identifier
    to_panel_id: Identifier
    reason: ShortText


class MangaPagePlan(ContractModel):
    schema_version: Literal["manga-page-plan.v1"]
    page_plan_id: Identifier
    project_id: Identifier
    script_set_artifact_id: Identifier
    canvas: PageCanvas
    reading_direction: Literal["rtl", "ltr"]
    page_script: PageScript
    layout_root: LayoutNode
    reading_edges: list[ReadingEdge] = Field(default_factory=list, max_length=32)
    source_fact_ids: list[Identifier] = Field(default_factory=list, max_length=256)

    @staticmethod
    def _walk_layout(node: LayoutNode) -> list[PanelLayoutNode | FreeformPanelLayoutNode]:
        if isinstance(node, (PanelLayoutNode, FreeformPanelLayoutNode)):
            return [node]
        if isinstance(node, SplitLayoutNode):
            return [leaf for child in node.children for leaf in MangaPagePlan._walk_layout(child)]
        return MangaPagePlan._walk_layout(node.base) + [
            leaf for inset in node.insets for leaf in MangaPagePlan._walk_layout(inset.node)
        ]

    @staticmethod
    def _node_ids(node: LayoutNode) -> list[str]:
        if isinstance(node, (PanelLayoutNode, FreeformPanelLayoutNode)):
            return [node.node_id]
        if isinstance(node, SplitLayoutNode):
            return [node.node_id, *[value for child in node.children for value in MangaPagePlan._node_ids(child)]]
        return [
            node.node_id,
            *MangaPagePlan._node_ids(node.base),
            *[value for inset in node.insets for value in MangaPagePlan._node_ids(inset.node)],
        ]

    @model_validator(mode="after")
    def validate_layout_and_reading_graph(self) -> "MangaPagePlan":
        panel_ids = {panel.panel_id for panel in self.page_script.panels}
        leaves = self._walk_layout(self.layout_root)
        leaf_panel_ids = [leaf.panel_id for leaf in leaves]
        if len(leaf_panel_ids) != len(set(leaf_panel_ids)):
            raise ValueError("layout must reference every panel exactly once")
        if set(leaf_panel_ids) != panel_ids:
            raise ValueError("layout panel references must match page-script panels")
        node_ids = self._node_ids(self.layout_root)
        if len(node_ids) != len(set(node_ids)):
            raise ValueError("layout node IDs must be unique")

        if len(panel_ids) == 1:
            if self.reading_edges:
                raise ValueError("single-panel pages cannot have reading edges")
            return self
        if len(self.reading_edges) != len(panel_ids) - 1:
            raise ValueError("reading edges must form one complete panel chain")
        outgoing: dict[str, str] = {}
        incoming: dict[str, str] = {}
        for edge in self.reading_edges:
            if edge.from_panel_id not in panel_ids or edge.to_panel_id not in panel_ids:
                raise ValueError("reading edge references an unknown panel")
            if edge.from_panel_id == edge.to_panel_id:
                raise ValueError("reading edge cannot reference the same panel twice")
            if edge.from_panel_id in outgoing or edge.to_panel_id in incoming:
                raise ValueError("reading graph must be a single unambiguous chain")
            outgoing[edge.from_panel_id] = edge.to_panel_id
            incoming[edge.to_panel_id] = edge.from_panel_id
        starts = panel_ids - set(incoming)
        if len(starts) != 1:
            raise ValueError("reading graph must have exactly one start panel")
        visited: set[str] = set()
        current = next(iter(starts))
        while current not in visited:
            visited.add(current)
            if current not in outgoing:
                break
            current = outgoing[current]
        if visited != panel_ids:
            raise ValueError("reading graph contains a cycle or disconnected panel")
        return self


class ThumbnailSet(ContractModel):
    schema_version: Literal["thumbnail-set.v1"]
    thumbnail_set_id: Identifier
    project_id: Identifier
    script_set_artifact_id: Identifier
    page_plans: list[MangaPagePlan] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_thumbnail_sequence(self) -> "ThumbnailSet":
        indices = [item.page_script.page_index for item in self.page_plans]
        if indices != list(range(len(indices))):
            raise ValueError("thumbnail page indices must be contiguous from zero")
        if any(item.project_id != self.project_id for item in self.page_plans):
            raise ValueError("thumbnail page plan crosses project ownership")
        if any(item.script_set_artifact_id != self.script_set_artifact_id for item in self.page_plans):
            raise ValueError("thumbnail page plan references another script set")
        return self


class CompiledPanelGeometry(ContractModel):
    panel_id: Identifier
    node_id: Identifier
    polygon: list[NormalizedPoint] = Field(min_length=3, max_length=32)
    bbox: NormalizedBox
    clip_path: Annotated[str, Field(min_length=1, max_length=2_000)]
    z_index: Annotated[int, Field(ge=0, le=1_000)] = 0
    read_rank: Annotated[int, Field(ge=0, le=999)]


class PanelAdjacency(ContractModel):
    panel_a: Identifier
    panel_b: Identifier
    relation: Literal["horizontal", "vertical", "overlap", "near"]


class CompiledPageLayout(ContractModel):
    schema_version: Literal["compiled-layout.v1"]
    page_plan_id: Identifier
    layout_engine_version: ShortText
    compiler_hash: ContentHash
    panels: list[CompiledPanelGeometry] = Field(min_length=1, max_length=20)
    adjacency: list[PanelAdjacency] = Field(default_factory=list, max_length=190)

    @model_validator(mode="after")
    def validate_compiled_graph(self) -> "CompiledPageLayout":
        panel_ids = [panel.panel_id for panel in self.panels]
        if len(panel_ids) != len(set(panel_ids)):
            raise ValueError("compiled panel IDs must be unique")
        if sorted(panel.read_rank for panel in self.panels) != list(range(len(self.panels))):
            raise ValueError("compiled read ranks must be contiguous from zero")
        known = set(panel_ids)
        if any(item.panel_a not in known or item.panel_b not in known for item in self.adjacency):
            raise ValueError("adjacency references an unknown compiled panel")
        return self


class PageValidationIssue(ContractModel):
    code: Identifier
    severity: Literal["error", "warning", "info"]
    message: Annotated[str, Field(min_length=1, max_length=2_000)]
    path: Annotated[str, Field(min_length=1, max_length=500)]
    node_id: Identifier | None = None


class PageValidationReport(ContractModel):
    schema_version: Literal["page-validation-report.v1"]
    report_id: Identifier
    candidate_artifact_id: Identifier
    validator_version: ShortText
    passed: bool
    issues: list[PageValidationIssue] = Field(default_factory=list, max_length=1_000)

    @model_validator(mode="after")
    def errors_match_passed_state(self) -> "PageValidationReport":
        has_error = any(issue.severity == "error" for issue in self.issues)
        if self.passed == has_error:
            raise ValueError("passed must be false exactly when error issues exist")
        return self


class RevisionOperation(ContractModel):
    op: Literal["add", "remove", "replace"]
    path: Annotated[str, Field(min_length=1, max_length=500, pattern=r"^/")]
    value: JsonValue | None = None
    node_id: Identifier | None = None

    @model_validator(mode="after")
    def value_matches_operation(self) -> "RevisionOperation":
        if self.op in {"add", "replace"} and self.value is None:
            raise ValueError("add and replace operations require value")
        if self.op == "remove" and self.value is not None:
            raise ValueError("remove operations cannot include value")
        return self


class RevisionRequest(ContractModel):
    schema_version: Literal["revision-request.v1"]
    revision_id: Identifier
    target_artifact_id: Identifier
    validation_report_id: Identifier
    issue_codes: list[Identifier] = Field(min_length=1, max_length=128)
    preserve_paths: list[Annotated[str, Field(min_length=1, max_length=500, pattern=r"^/")]] = Field(
        default_factory=list,
        max_length=128,
    )
    operations: list[RevisionOperation] = Field(min_length=1, max_length=64)
    rationale: NonEmptyText


class ImageAttempt(ContractModel):
    schema_version: Literal["image-attempt.v1"]
    attempt_id: Identifier
    panel_id: Identifier
    purpose: Literal["panel", "character_reference", "environment", "prop", "texture"]
    provider: ShortText
    model: ShortText
    prompt_snapshot: NonEmptyText
    negative_prompt: NonEmptyText | None = None
    reference_asset_ids: list[Identifier] = Field(default_factory=list, max_length=32)
    parameters: dict[Identifier, str | int | float | bool] = Field(default_factory=dict, max_length=64)
    seed: Annotated[int, Field(ge=0)] | None = None
    request_hash: ContentHash
    provider_response_id: ShortText | None = None
    output_asset_id: Identifier | None = None
    receipt_id: Identifier | None = None
    cost_usd: Annotated[float, Field(ge=0)] | None = None
    status: Literal["requested", "succeeded", "failed", "rejected", "accepted"]
    validation_report_ids: list[Identifier] = Field(default_factory=list, max_length=64)
    revision_instruction: NonEmptyText | None = None
    created_at: AwareDatetime

    @model_validator(mode="after")
    def validate_attempt_result(self) -> "ImageAttempt":
        if self.status in {"succeeded", "accepted"} and self.output_asset_id is None:
            raise ValueError("successful image attempts require output_asset_id")
        if self.status == "accepted" and not self.validation_report_ids:
            raise ValueError("accepted image attempts require validation reports")
        return self


class RenderedPanelV2(ContractModel):
    panel_id: Identifier
    clip_path: Annotated[str, Field(min_length=1, max_length=2_000)]
    visual_asset_ids: list[Identifier] = Field(default_factory=list, max_length=32)
    text_ids: list[Identifier] = Field(default_factory=list, max_length=64)


class RenderedPageV2(ContractModel):
    schema_version: Literal["rendered-page.v2"]
    page_plan: MangaPagePlan
    compiled_layout: CompiledPageLayout
    panels: list[RenderedPanelV2] = Field(min_length=1, max_length=20)
    canonical_svg_asset_id: Identifier
    raster_asset_ids: list[Identifier] = Field(default_factory=list, max_length=8)
    accessible_text: list[TextElement] = Field(default_factory=list, max_length=64)

    @model_validator(mode="after")
    def validate_rendered_page_v2(self) -> "RenderedPageV2":
        if self.compiled_layout.page_plan_id != self.page_plan.page_plan_id:
            raise ValueError("compiled layout must reference page_plan")
        planned = {panel.panel_id for panel in self.page_plan.page_script.panels}
        rendered = {panel.panel_id for panel in self.panels}
        if rendered != planned or len(rendered) != len(self.panels):
            raise ValueError("rendered panels must cover page-plan panels exactly")
        text_ids = {text.text_id for text in self.page_plan.page_script.text_elements}
        if {text.text_id for text in self.accessible_text} != text_ids:
            raise ValueError("accessible text must cover planned text exactly")
        if any(not set(panel.text_ids).issubset(text_ids) for panel in self.panels):
            raise ValueError("rendered panel references unknown text")
        return self


class ManifestPanel(ContractModel):
    panel_id: Identifier
    page_id: Identifier
    sequence: Annotated[int, Field(ge=0)]
    beat_ids: list[Identifier] = Field(min_length=1, max_length=32)
    panel_type: ShortText
    dialogue: list[DialogueLine] = Field(default_factory=list, max_length=16)
    narration: list[Annotated[str, Field(min_length=1, max_length=1_000)]] = Field(
        default_factory=list, max_length=8
    )
    visual_asset_ids: list[Identifier] = Field(default_factory=list, max_length=32)
    crop_hints: list[CropHint] = Field(default_factory=list, max_length=16)
    emotional_tone: ShortText
    source_refs: list[SourceRef] = Field(min_length=1, max_length=128)


class MangaManifest(ContractModel):
    schema_version: Literal["manga-manifest.v1"]
    manga_id: Identifier
    project_id: Identifier
    scope_id: Identifier
    memory_version: Annotated[int, Field(ge=0)]
    rendered_page_artifact_ids: list[Identifier] = Field(min_length=1, max_length=1_000)
    beats: list[AdaptationBeat] = Field(min_length=1, max_length=1_000)
    panels: list[ManifestPanel] = Field(min_length=1, max_length=10_000)
    character_asset_ids: list[Identifier] = Field(default_factory=list, max_length=1_000)
    art_direction_artifact_id: Identifier
    content_hash: ContentHash

    @model_validator(mode="after")
    def validate_manifest_graph(self) -> "MangaManifest":
        beat_ids = [beat.beat_id for beat in self.beats]
        if len(beat_ids) != len(set(beat_ids)):
            raise ValueError("beat ids must be unique")
        known_beats = set(beat_ids)
        panel_ids = [panel.panel_id for panel in self.panels]
        if len(panel_ids) != len(set(panel_ids)):
            raise ValueError("panel ids must be unique")
        if any(not set(panel.beat_ids).issubset(known_beats) for panel in self.panels):
            raise ValueError("every panel beat_id must reference a manifest beat")
        sequences = [beat.sequence for beat in self.beats]
        if sequences != list(range(len(self.beats))):
            raise ValueError("beat sequence values must be contiguous from zero")
        return self
