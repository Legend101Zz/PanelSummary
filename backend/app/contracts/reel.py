"""Strict, data-only ReelSpec consumed by the reviewed Remotion registry."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, model_validator

from .base import ContractModel, Identifier, ShortText
from .manga import DialogueLine, LayoutBoxPct
from .source import SourceRef


class ReelFormat(ContractModel):
    width: Literal[1080]
    height: Literal[1920]
    fps: Literal[30]
    duration_frames: Annotated[int, Field(gt=0)]


class SfxCue(ContractModel):
    asset_id: Identifier
    frame: Annotated[int, Field(ge=0)]
    gain: Annotated[float, Field(ge=0, le=2)] = 1


class ReelAudio(ContractModel):
    narration_asset_id: Identifier | None = None
    music_asset_id: Identifier | None = None
    sfx_cues: list[SfxCue] = Field(default_factory=list, max_length=128)
    caption_track_id: Identifier | None = None


class ReelSceneBase(ContractModel):
    scene_id: Identifier
    start_frame: Annotated[int, Field(ge=0)]
    duration_frames: Annotated[int, Field(gt=0)]
    beat_ids: list[Identifier] = Field(min_length=1, max_length=32)


class PanelFocusScene(ReelSceneBase):
    scene_type: Literal["panel_focus"]
    component_id: Literal["panel_focus"]
    panel_id: Identifier
    asset_id: Identifier | None = None
    focus_box_pct: LayoutBoxPct | None = None
    motion_preset: Literal["hold", "push_in", "pull_out", "pan_left", "pan_right"] = "push_in"
    caption: Annotated[str, Field(min_length=1, max_length=500)] | None = None


class SplitPanelScene(ReelSceneBase):
    scene_type: Literal["split_panel"]
    component_id: Literal["split_panel_reveal"]
    panel_ids: Annotated[list[Identifier], Field(min_length=2, max_length=2)]
    divider_style: Literal["ink", "clean", "jagged"] = "ink"
    reveal_order: Literal["simultaneous", "first_then_second"] = "first_then_second"


class DialogueExchangeScene(ReelSceneBase):
    scene_type: Literal["dialogue_exchange"]
    component_id: Literal["dialogue_exchange"]
    panel_id: Identifier
    dialogue: list[DialogueLine] = Field(min_length=1, max_length=8)
    bubble_motion: Literal["pop", "slide", "type_on"] = "pop"


class ImpactCutScene(ReelSceneBase):
    scene_type: Literal["impact_cut"]
    component_id: Literal["impact_cut"]
    panel_id: Identifier
    sfx_text: Annotated[str, Field(min_length=1, max_length=40)]
    impact_preset: Literal["flash", "shake", "speedlines", "ink_burst"] = "ink_burst"


class NarratorCardScene(ReelSceneBase):
    scene_type: Literal["narrator_card"]
    component_id: Literal["narrator_card"]
    text: Annotated[str, Field(min_length=1, max_length=500)]
    background_asset_id: Identifier | None = None
    text_preset: Literal["paper_box", "ink_reverse", "chapter_card"] = "paper_box"


class PageTurnScene(ReelSceneBase):
    scene_type: Literal["page_turn"]
    component_id: Literal["page_turn"]
    from_panel_id: Identifier
    to_panel_id: Identifier
    direction: Literal["rtl", "ltr"] = "rtl"


class MontageScene(ReelSceneBase):
    scene_type: Literal["montage"]
    component_id: Literal["panel_montage"]
    panel_ids: list[Identifier] = Field(min_length=2, max_length=8)
    layout_preset: Literal["cascade", "grid", "rapid_cuts"] = "cascade"


ReelScene = Annotated[
    PanelFocusScene
    | SplitPanelScene
    | DialogueExchangeScene
    | ImpactCutScene
    | NarratorCardScene
    | PageTurnScene
    | MontageScene,
    Field(discriminator="scene_type"),
]


class InteractionMapEntry(ContractModel):
    beat_id: Identifier
    start_frame: Annotated[int, Field(ge=0)]
    end_frame: Annotated[int, Field(gt=0)]

    @model_validator(mode="after")
    def validate_frame_range(self) -> "InteractionMapEntry":
        if self.end_frame <= self.start_frame:
            raise ValueError("end_frame must be greater than start_frame")
        return self


class ReelSpec(ContractModel):
    schema_version: Literal["reel-spec.v1"]
    reel_id: Identifier
    series_id: Identifier
    sequence: Annotated[int, Field(ge=0)]
    manga_manifest_id: Identifier
    beat_ids: list[Identifier] = Field(min_length=1, max_length=1_000)
    format: ReelFormat
    style_kit_id: Identifier
    audio: ReelAudio
    scenes: list[ReelScene] = Field(min_length=1, max_length=128)
    interaction_map: list[InteractionMapEntry] = Field(min_length=1, max_length=1_000)
    source_refs: list[SourceRef] = Field(min_length=1, max_length=1_000)

    @model_validator(mode="after")
    def validate_timeline(self) -> "ReelSpec":
        if len(self.beat_ids) != len(set(self.beat_ids)):
            raise ValueError("beat_ids must be unique")
        expected_start = 0
        scene_ids: set[str] = set()
        for scene in self.scenes:
            if scene.scene_id in scene_ids:
                raise ValueError("scene_id values must be unique")
            scene_ids.add(scene.scene_id)
            if scene.start_frame != expected_start:
                raise ValueError("scenes must be contiguous and ordered from frame zero")
            if not set(scene.beat_ids).issubset(set(self.beat_ids)):
                raise ValueError("scene beat_ids must reference ReelSpec.beat_ids")
            expected_start += scene.duration_frames
        if expected_start != self.format.duration_frames:
            raise ValueError("scene durations must equal format.duration_frames")
        for cue in self.audio.sfx_cues:
            if cue.frame >= self.format.duration_frames:
                raise ValueError("SFX cue must fall inside the reel timeline")
        for entry in self.interaction_map:
            if entry.beat_id not in self.beat_ids:
                raise ValueError("interaction_map beat_id must reference ReelSpec.beat_ids")
            if entry.end_frame > self.format.duration_frames:
                raise ValueError("interaction_map range must fall inside the reel timeline")
        return self
